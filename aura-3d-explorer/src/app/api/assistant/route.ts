/**
 * /api/assistant — AURA, the local AI assistant.
 * -----------------------------------------------------------------------------
 * POST { messages: {role, content}[], context?: object }
 *   → text/plain stream of the model's reply (tokens as they arrive).
 * GET
 *   → { online, provider, model } health check.
 *
 * Runs against a LOCAL model — nothing leaves the machine:
 *   1. Ollama         OLLAMA_URL     (default http://127.0.0.1:11434), model AURA_AI_MODEL (default llama3.2:latest)
 *   2. LM Studio      LMSTUDIO_URL   (default http://127.0.0.1:1234), OpenAI-compatible; model LMSTUDIO_MODEL
 *                     (default: the first model the server lists)
 *
 * Needs a Node server (`next dev` / `next start`). A `STATIC_EXPORT=1` build
 * has no API routes; the client then shows the "Local AI offline" state.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const LMSTUDIO_URL = (process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234").replace(/\/$/, "");
const MODEL = process.env.AURA_AI_MODEL ?? "llama3.2:latest";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 5_000;

type Provider = "ollama" | "lmstudio";
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/* ------------------------------------------------------------ system prompt */

const SYSTEM_PROMPT = `You are AURA, an expert real-estate development analyst and architectural-visualisation guide built into the AURA platform. You help developers, investors and buyers understand a project: its programme, massing, pro-forma yield, and how it looks in the live 3D explorer.

Rules:
- Be concise: 2-5 short sentences or a few bullets. No preamble.
- Ground every figure in the CONTEXT JSON below and quote it (e.g. "profit on cost 18.2%"). Never invent numbers. If something isn't in the context, say so.
- All projects are sample placeholders: when you quote figures, mention once that they are illustrative.
- "yield" means profit on cost / margin / IRR from the pro-forma in context.
- "This tower" / "this building" = CONTEXT.explorer.activeBuilding: quote its buildings[].yield. Whole-site totals are in siteYield.
- To compare buildings, give one bullet per building with floors, profit on cost and IRR from buildings[]. No command needed.

You can control the 3D explorer (only when CONTEXT.explorer is not null, except tour). To do so, write a command ALONE on its own line, exactly in this form:
[[action:photo angle=aerial]]   (angles: street, waterfront, aerial, podium, skyline, drone)
[[action:floor n=12]]           (isolate floor 12 of the active building; add building=<id> for another building)
[[action:building id=<id>]]     (make a building active)
[[action:explode value=1.5]]    (0 = closed, up to 2.5)
[[action:xray on=true]]
[[action:walk]]                 (walk through the isolated floor; select a floor first)
[[action:city id=miami]]        (city backdrop; ids in CONTEXT.options.cities)
[[action:reset]]
[[action:tour]]                 (open the cinematic tour page)
Use at most 2 commands per reply, only when the user asks to see, show, move, explode, walk or tour. Floor numbers must exist in the chosen building (see buildings[].floors); if the active building is too short, add building=<id> of one tall enough and name it. After a command, add one short sentence about what they are looking at.`;

function buildSystem(context: unknown): string {
  let json = "";
  try {
    json = JSON.stringify(context ?? {});
  } catch {
    json = "{}";
  }
  if (json.length > MAX_CONTEXT_CHARS) json = json.slice(0, MAX_CONTEXT_CHARS) + "…";
  return `${SYSTEM_PROMPT}\n\nCONTEXT:\n${json}`;
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

/* ---------------------------------------------------------------- providers */

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 1500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function ollamaHealth(): Promise<{ online: boolean; model?: string; hasModel?: boolean }> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return { online: false };
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    const hasModel = names.includes(MODEL) || names.includes(`${MODEL}:latest`);
    return { online: true, model: MODEL, hasModel };
  } catch {
    return { online: false };
  }
}

async function lmStudioModel(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${LMSTUDIO_URL}/v1/models`);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id: string }[] };
    return process.env.LMSTUDIO_MODEL ?? data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Pipe a provider's streaming body into a plain text stream of content deltas. */
function textStream(body: ReadableStream<Uint8Array>, extract: (line: string) => string | null | "done"): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = body.getReader();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const out = extract(buffer.trim());
            if (out && out !== "done") controller.enqueue(encoder.encode(out));
          }
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const out = extract(line.trim());
          if (out === "done") {
            controller.close();
            await reader.cancel().catch(() => {});
            return;
          }
          if (out) controller.enqueue(encoder.encode(out));
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });
}

const ollamaExtract = (line: string) => {
  try {
    const j = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string };
    if (j.error) return `\n[AURA error: ${j.error}]`;
    const text = j.message?.content ?? "";
    return j.done && !text ? "done" : text;
  } catch {
    return null;
  }
};

const openAiExtract = (line: string) => {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return "done";
  try {
    const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
    return j.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
};

function streamResponse(stream: ReadableStream<Uint8Array>, provider: Provider, model: string) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-AURA-Provider": provider,
      "X-AURA-Model": model,
    },
  });
}

const offline = () =>
  NextResponse.json(
    {
      error: "Local AI offline",
      hint: `Start Ollama with \`ollama serve\` and \`ollama pull ${MODEL}\` (or start LM Studio's local server on ${LMSTUDIO_URL}).`,
    },
    { status: 503 }
  );

/* ------------------------------------------------------------------ routes */

export async function GET() {
  const o = await ollamaHealth();
  if (o.online) return NextResponse.json({ online: true, provider: "ollama", model: MODEL, modelInstalled: o.hasModel });
  const lm = await lmStudioModel();
  if (lm) return NextResponse.json({ online: true, provider: "lmstudio", model: lm });
  return NextResponse.json({ online: false, provider: null, model: null });
}

export async function POST(req: Request) {
  let body: { messages?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const history = sanitizeMessages(body.messages);
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send at least one user message" }, { status: 400 });
  }
  const messages: ChatMessage[] = [{ role: "system", content: buildSystem(body.context) }, ...history];

  // 1. Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        options: { temperature: 0.3, num_ctx: 4096, num_predict: 400 },
      }),
      signal: req.signal,
    });
    if (res.ok && res.body) return streamResponse(textStream(res.body, ollamaExtract), "ollama", MODEL);
    const detail = await res.text().catch(() => "");
    // Reachable but failing (e.g. model not pulled) — report it rather than silently falling back.
    if (res.status === 404) {
      return NextResponse.json({ error: `Model "${MODEL}" is not installed in Ollama`, hint: `Run \`ollama pull ${MODEL}\`, or set AURA_AI_MODEL.`, detail }, { status: 502 });
    }
    console.warn(`[assistant] Ollama returned ${res.status}: ${detail.slice(0, 200)}`);
  } catch (err) {
    if ((err as Error).name === "AbortError") return new Response(null, { status: 499 });
    // Unreachable — try LM Studio.
  }

  // 2. LM Studio (OpenAI-compatible)
  const lmModel = await lmStudioModel();
  if (lmModel) {
    try {
      const res = await fetch(`${LMSTUDIO_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: lmModel, messages, stream: true, temperature: 0.3, max_tokens: 400 }),
        signal: req.signal,
      });
      if (res.ok && res.body) return streamResponse(textStream(res.body, openAiExtract), "lmstudio", lmModel);
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: `LM Studio returned ${res.status}`, detail: detail.slice(0, 300) }, { status: 502 });
    } catch (err) {
      if ((err as Error).name === "AbortError") return new Response(null, { status: 499 });
    }
  }

  return offline();
}
