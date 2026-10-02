/**
 * /api/engine — Aura Engine: floor plan → engine-ready AuraScene JSON.
 * -----------------------------------------------------------------------------
 * POST { fileName, text }                     DXF / CAD JSON / AuraScene JSON
 *   → { scene, report }  parsed and staged locally (no model involved)
 * POST { fileName, mediaType, data }          blueprint image / PDF, base64
 *   → { scene, report }  read by a vision model with the Aura Engine prompt,
 *                        then validated, repaired and re-staged
 * GET
 *   → { vision: { provider, model, pdf } | null }
 *
 * Vision providers, in order:
 *   1. Anthropic   ANTHROPIC_API_KEY set; model AURA_ENGINE_MODEL (default
 *                  claude-sonnet-5-5). Reads images and PDFs.
 *   2. Ollama      a local model whose /api/tags capabilities include
 *                  "vision" (e.g. llama3.2-vision, qwen2.5vl, gemma3).
 *                  Images only; nothing leaves the machine.
 * DXF / JSON never need a model.
 */
import { NextResponse } from "next/server";
import { readJsonObject, RequestBodyError } from "@/lib/requestBody";
import { extractJson, repairScene, runEngine, summaryFacts } from "@/lib/engine";
import { ENGINE_SYSTEM_PROMPT, engineUserNote } from "@/lib/engine/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const ANTHROPIC_MODEL = process.env.AURA_ENGINE_MODEL ?? "claude-sonnet-5-5";
const MAX_TEXT = 12_000_000;
const MAX_B64 = 22_000_000; // ≈ 16 MB file

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type Vision = { provider: "anthropic" | "ollama"; model: string; pdf: boolean };

async function ollamaVisionModel(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal, cache: "no-store" }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string; capabilities?: string[] }[] };
    const pick = (data.models ?? []).find((m) => m.capabilities?.includes("vision") || /vision|llava|qwen2?\.?5?-?vl|gemma3|minicpm-v|moondream/i.test(m.name));
    return pick?.name ?? null;
  } catch {
    return null;
  }
}

async function visionProvider(): Promise<Vision | null> {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: ANTHROPIC_MODEL, pdf: true };
  const local = await ollamaVisionModel();
  return local ? { provider: "ollama", model: local, pdf: false } : null;
}

export async function GET() {
  return NextResponse.json({ vision: await visionProvider() });
}

async function askAnthropic(model: string, fileName: string, mediaType: string, data: string): Promise<string> {
  const source = { type: "base64", media_type: mediaType, data };
  const block = mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system: ENGINE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [block, { type: "text", text: engineUserNote(fileName) }] }],
    }),
    signal: AbortSignal.timeout(115_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (out.content ?? []).map((c) => c.text ?? "").join("");
}

async function askOllama(model: string, fileName: string, data: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.1, num_ctx: 16384 },
      messages: [
        { role: "system", content: ENGINE_SYSTEM_PROMPT },
        { role: "user", content: engineUserNote(fileName), images: [data] },
      ],
    }),
    signal: AbortSignal.timeout(115_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const out = (await res.json()) as { message?: { content?: string } };
  return out.message?.content ?? "";
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 24_000_000);
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Could not read the request. Try again." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "plan";

  try {
    // Vector / JSON input — deterministic, local.
    if (typeof body.text === "string") {
      if (body.text.length > MAX_TEXT) return NextResponse.json({ error: "File too large (max ~12 MB of text)." }, { status: 413 });
      return NextResponse.json(runEngine(fileName, body.text));
    }

    // Raster / PDF input — needs a vision model.
    const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
    const data = typeof body.data === "string" ? body.data : "";
    if (!data) return NextResponse.json({ error: "Nothing to read: no text or data." }, { status: 400 });
    if (data.length > MAX_B64) return NextResponse.json({ error: "File too large (max ~16 MB)." }, { status: 413 });
    if (!IMAGE_TYPES.includes(mediaType) && mediaType !== "application/pdf")
      return NextResponse.json({ error: `Unsupported file type ${mediaType || "(unknown)"}. Use PNG, JPEG, WebP, PDF, DXF or JSON.` }, { status: 415 });

    const vision = await visionProvider();
    if (!vision)
      return NextResponse.json(
        {
          error:
            "Reading blueprint images needs a vision model. Set ANTHROPIC_API_KEY (images + PDFs), or pull a local one: `ollama pull llama3.2-vision`. DXF and CAD JSON work without one.",
        },
        { status: 503 }
      );
    if (mediaType === "application/pdf" && !vision.pdf)
      return NextResponse.json({ error: `The local model (${vision.model}) can't read PDFs. Export the page as PNG, or set ANTHROPIC_API_KEY.` }, { status: 415 });

    const reply = vision.provider === "anthropic" ? await askAnthropic(vision.model, fileName, mediaType, data) : await askOllama(vision.model, fileName, data);
    const { scene, notes } = repairScene(extractJson(reply));
    if (!scene.rooms.length) throw new Error("The model found no rooms in this drawing.");
    return NextResponse.json({
      scene,
      report: {
        source: fileName,
        method: "vision",
        model: `${vision.provider} · ${vision.model}`,
        units: "metres",
        facts: [{ label: "Read by", value: `${vision.model} (${vision.provider})` }, ...summaryFacts(scene)],
        warnings: notes,
        openings: [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
