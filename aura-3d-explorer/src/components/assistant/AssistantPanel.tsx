"use client";
/**
 * AssistantPanel — "Ask AURA", the local AI assistant.
 * -----------------------------------------------------------------------------
 * Floating launcher (bottom-right, status dot = local model online) that opens
 * a non-modal slide-over chat. Replies stream from /api/assistant (Ollama or
 * LM Studio on this machine). `[[action:…]]` commands in the stream drive the
 * page's registered 3D explorer (see AssistantBridge + protocol.ts) and are
 * shown as small chips instead of text.
 *
 * Needs `next dev` / `next start`: on a static export the route 404s and the
 * panel shows the "Local AI offline" state.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { ArrowUp, Check, Copy, CornerDownRight, Sparkles, Square, Trash2, X } from "lucide-react";
import { EASE } from "@/components/ui/primitives";
import { useAssistantBridge } from "./AssistantBridge";
import { buildAssistantContext } from "./context";
import { intentFromText, parseAssistantText, type AssistantAction } from "./protocol";
import { runAction, type ActionResult } from "./actions";

type Status = "checking" | "online" | "offline";

interface Message {
  id: number;
  role: "user" | "assistant";
  /** Raw model output (assistant) or the user's text. */
  content: string;
  chips: ActionResult[];
  error?: string;
}

const SUGGESTIONS = [
  "What's the yield on this tower?",
  "Show me the view from level 40",
  "Put the living room on the glass",
  "Give each floor a different layout",
  "Swap this apartment to lounge furniture",
  "Explode the stack",
  "Compare the buildings on site",
  "Take me on a tour",
];

const ENDPOINT = "/api/assistant";
const MAX_ACTIONS_PER_REPLY = 3;

/** Minimal inline formatting: **bold** only. */
function Formatted({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-medium">{p.slice(2, -2)}</strong> : p))}
    </>
  );
}

function StatusDot({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-block h-2 w-2 rounded-full",
        status === "online" ? "bg-emerald-600" : status === "checking" ? "animate-pulse bg-ash/50" : "bg-ash/40",
        className
      )}
    />
  );
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 border border-plaster bg-stone px-3 py-2">
      <code className="font-mono text-xs text-ink">{command}</code>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          navigator.clipboard?.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        aria-label={`Copy “${command}”`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function OfflineCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3 border border-plaster bg-paper p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <StatusDot status="offline" /> Local AI offline — run <code className="font-mono text-xs">ollama serve</code>
      </p>
      <p className="caption">
        AURA runs on a model on this machine; nothing is sent to the cloud. Start Ollama (or LM Studio&apos;s local server) and make sure the site runs
        with <code className="font-mono">next dev</code> / <code className="font-mono">next start</code> (static exports have no assistant).
      </p>
      <CopyCommand command="ollama serve" />
      <CopyCommand command="ollama pull llama3.2" />
      <button type="button" className="btn-secondary w-full py-2 text-xs" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

export default function AssistantPanel() {
  const bridge = useAssistantBridge();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const titleId = useId();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [model, setModel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  /* ---------------------------------------------------------------- health */
  const checkHealth = useCallback(async () => {
    setStatus("checking");
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { online?: boolean; model?: string | null; provider?: string | null };
      setStatus(data.online ? "online" : "offline");
      setModel(data.online ? `${data.model ?? "local model"}${data.provider === "lmstudio" ? " · LM Studio" : ""}` : null);
    } catch {
      setStatus("offline");
      setModel(null);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);
  useEffect(() => {
    if (open && statusRef.current !== "online") checkHealth();
  }, [open, checkHealth]);

  /* --------------------------------------------------------- focus + scroll */
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ------------------------------------------------------------------ send */
  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || streaming) return;
      setInput("");

      const userMsg: Message = { id: nextId.current++, role: "user", content: prompt, chips: [] };
      const replyId = nextId.current++;
      const history = [...messages, userMsg];
      setMessages([...history, { id: replyId, role: "assistant", content: "", chips: [] }]);
      setStreaming(true);

      const patch = (fn: (m: Message) => Message) => setMessages((all) => all.map((m) => (m.id === replyId ? fn(m) : m)));
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let executed = 0;
      let pendingTour = false;
      const dispatch = (all: AssistantAction[]) => {
        const actions = all.slice(0, MAX_ACTIONS_PER_REPLY); // small models sometimes spam commands
        const fresh = actions.slice(executed);
        executed = actions.length;
        const chips = fresh.map((a) => {
          if (a.type === "tour") {
            // Navigating unmounts the explorer — wait until the reply is complete.
            pendingTour = true;
            return { label: "Opening the cinematic tour", ok: true };
          }
          return runAction(a, bridge?.current() ?? {}, prompt, (href) => router.push(href));
        });
        if (chips.length) patch((m) => ({ ...m, chips: [...m.chips, ...chips] }));
      };

      try {
        const reg = bridge?.current() ?? {};
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })).filter((m) => m.content),
            context: buildAssistantContext(reg, pathname),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string; hint?: string } | null;
          if (res.status === 404 || res.status === 503) setStatus("offline");
          throw new Error(data?.error ? `${data.error}${data.hint ? ` — ${data.hint}` : ""}` : `Assistant unavailable (${res.status})`);
        }
        setStatus("online");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let raw = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          const snapshot = raw;
          patch((m) => ({ ...m, content: snapshot }));
          dispatch(parseAssistantText(raw).actions);
        }
        const final = parseAssistantText(raw).actions;
        dispatch(final);
        // The model answered without touching the rooms the user asked about: apply the request directly.
        if (!final.some((a) => a.type === "furnish" || a.type === "design")) {
          const intent = intentFromText(prompt);
          if (intent) {
            const chip = runAction(intent, bridge?.current() ?? {}, prompt, (href) => router.push(href));
            patch((m) => ({ ...m, chips: [...m.chips, chip] }));
          }
        }
        if (pendingTour) setTimeout(() => router.push("/tour"), 600);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const msg = err instanceof TypeError ? "Couldn't reach the assistant route." : (err as Error).message;
          if (err instanceof TypeError) setStatus("offline");
          patch((m) => ({ ...m, error: msg }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [bridge, messages, pathname, router, streaming]
  );

  const stop = () => abortRef.current?.abort();
  const clear = () => {
    stop();
    setMessages([]);
    inputRef.current?.focus();
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };
  const onPanelKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const hasExplorer = !!bridge?.current().explorer;
  // Re-evaluate when hosts mount/unmount.
  void bridge?.version;

  const lastId = messages[messages.length - 1]?.id;

  return (
    <>
      {/* Launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            ref={launcherRef}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="overlay fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-2.5 text-sm text-ink transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50"
          >
            <Sparkles className="h-4 w-4 text-oak" aria-hidden />
            <span className="font-serif text-[17px] leading-none">Ask AURA</span>
            <StatusDot status={status} />
            <span className="sr-only">{status === "online" ? "(local AI online)" : status === "checking" ? "(checking local AI)" : "(local AI offline)"}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Slide-over (non-modal: the explorer stays interactive while AURA drives it) */}
      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.45, ease: EASE }}
            onKeyDown={onPanelKey}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-plaster bg-paper shadow-[0_0_60px_-24px_rgba(28,27,25,0.45)] sm:w-[420px]"
          >
            {/* Header */}
            <header className="flex items-start justify-between gap-3 border-b border-plaster px-5 py-4">
              <div>
                <p className="caption mb-1 flex items-center gap-1.5">
                  <StatusDot status={status} />
                  {status === "online" ? `Local AI · ${model}` : status === "checking" ? "Checking local AI…" : "Local AI offline"}
                </p>
                <h2 id={titleId} className="font-serif text-[26px] leading-tight text-ink">
                  Ask AURA
                </h2>
                <p className="caption mt-0.5">
                  Development analyst &amp; archviz guide{hasExplorer ? " · can drive the 3D view" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost" onClick={clear} disabled={!messages.length} aria-label="Clear chat">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="btn-ghost" onClick={close} aria-label="Close assistant (Esc)">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Messages */}
            <div
              ref={listRef}
              className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
              aria-live="polite"
              aria-busy={streaming}
              aria-relevant="additions text"
            >
              {status === "offline" && <OfflineCard onRetry={checkHealth} />}

              {!messages.length && status !== "offline" && (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-ash">
                    Ask about the programme, the pro-forma or the massing — or ask AURA to show you something in 3D. Runs entirely on this machine.
                  </p>
                  <ul className="space-y-1.5" aria-label="Suggested questions">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => send(s)}
                          disabled={status !== "online"}
                          className="w-full border border-plaster bg-paper px-3 py-2 text-left text-sm text-ink transition-colors hover:border-ink/40 hover:bg-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50 disabled:opacity-40"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="ml-8 border border-plaster bg-stone px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                    <span className="sr-only">You: </span>
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                ) : (
                  <AssistantBubble key={m.id} message={m} live={streaming && m.id === lastId} />
                )
              )}
            </div>

            {/* Composer */}
            <form
              className="border-t border-plaster px-5 py-4"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <label htmlFor={`${titleId}-input`} className="sr-only">
                Message AURA
              </label>
              <div className="flex items-end gap-2 border border-plaster bg-paper px-3 py-2 focus-within:border-ink/40">
                <textarea
                  id={`${titleId}-input`}
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder={status === "offline" ? "Local AI offline" : "Ask about yield, floors, views…"}
                  className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-6 text-ink placeholder:text-ash/70 focus:outline-none [field-sizing:content]"
                />
                {streaming ? (
                  <button type="button" onClick={stop} className="btn-secondary px-2.5 py-1.5" aria-label="Stop generating">
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                ) : (
                  <button type="submit" className="btn-primary px-2.5 py-1.5" disabled={!input.trim() || status === "offline"} aria-label="Send">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="caption mt-2">Enter to send · Shift+Enter for a new line · Esc to close. Figures are illustrative.</p>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function AssistantBubble({ message, live }: { message: Message; live: boolean }): ReactNode {
  const { text } = parseAssistantText(message.content);
  return (
    <div className="space-y-2">
      <p className="caption font-medium text-oak">AURA</p>
      {message.chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Actions taken">
          {message.chips.map((c, i) => (
            <li
              key={i}
              className={clsx(
                "inline-flex items-center gap-1 border px-2 py-0.5 text-[11px]",
                c.ok ? "border-oak/40 bg-oak/5 text-ink" : "border-plaster bg-stone text-ash"
              )}
            >
              <CornerDownRight className="h-3 w-3" aria-hidden />
              {c.label}
            </li>
          ))}
        </ul>
      )}
      {(text || live) && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
          <Formatted text={text} />
          {live && <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse bg-ink" />}
          {live && !text && <span className="sr-only">AURA is thinking…</span>}
        </p>
      )}
      {message.error && <p className="border border-plaster bg-stone px-3 py-2 text-xs text-ash">{message.error}</p>}
    </div>
  );
}
