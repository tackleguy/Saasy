# Product decisions — overnight product pass (2026-10-23)

Decisions made without the owner present. Each lists what was chosen, what was rejected, and how to reverse it. Reverse anything here freely.

| # | Area | Decision | Rejected alternative | How to reverse |
|---|---|---|---|---|
| D-01 | Assistant provider | **Owner instruction (2026-10-23): no Anthropic for now.** The assistant stays local-only (Ollama → LM Studio). A hosted Anthropic provider was built and then removed on request before it shipped (commit 47210cf has it). | Hosted Anthropic chat on Vercel. | Re-apply the provider block from commit 47210cf (`git show 47210cf -- src/app/api/assistant/route.ts`) and set `ANTHROPIC_API_KEY`. `/engine` blueprint reading keeps its pre-existing optional Anthropic vision path, unchanged and off unless a key is set. |
| D-02 | Rate limiting | In-memory fixed window per IP per server instance (20 chats / 10 min; 10 vision reads / 10 min). No new paid service. | Upstash/Redis or Vercel KV for one global quota (adds a dependency and an account). | Raise/lower with `AURA_ASSISTANT_RATE_LIMIT` / `AURA_ENGINE_RATE_LIMIT`. For a global quota, swap `takeToken` in `src/lib/apiGuard.ts` for a KV-backed counter. |
| D-03 | Same-origin | `/api/assistant` and `/api/engine` POSTs must carry an `Origin` matching the site's host; requests with no `Origin` (curl, scripts) are refused. | Allowing origin-less requests (lets scripts spend the key). | Add trusted origins in `AURA_ALLOWED_ORIGINS`. |
| D-04 | Assistant on Vercel | On a Vercel deployment (`VERCEL=1`) the assistant does not probe `127.0.0.1` and shows a neutral "not available on this site yet" card instead of Ollama instructions. `next start` on your own machine still uses local models and shows the setup steps. | Showing Ollama commands to every website visitor. | `AURA_LOCAL_AI=1`. |
