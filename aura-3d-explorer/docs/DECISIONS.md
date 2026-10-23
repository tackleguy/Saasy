# Product decisions — overnight product pass (2026-10-23)

Decisions made without the owner present. Each lists what was chosen, what was rejected, and how to reverse it. Reverse anything here freely.

| # | Area | Decision | Rejected alternative | How to reverse |
|---|---|---|---|---|
| D-01 | Assistant model | Hosted assistant defaults to `claude-opus-5-5` (Anthropic's current default model) at `effort: low`, max 2,000 output tokens, with Anthropic's server-side refusal fallback on. | `claude-haiku-5-5` (about 40× cheaper per token, weaker at following the `[[action:…]]` protocol). | Set `AURA_ASSISTANT_MODEL=claude-haiku-5-5` (or `claude-sonnet-5-5`) in Vercel. No code change. |
| D-02 | Rate limiting | In-memory fixed window per IP per server instance (20 chats / 10 min; 10 vision reads / 10 min). No new paid service. | Upstash/Redis or Vercel KV for one global quota (adds a dependency and an account). | Raise/lower with `AURA_ASSISTANT_RATE_LIMIT` / `AURA_ENGINE_RATE_LIMIT`. For a global quota, swap `takeToken` in `src/lib/apiGuard.ts` for a KV-backed counter. Also set a monthly spend cap in the Anthropic console. |
| D-03 | Same-origin | `/api/assistant` and `/api/engine` POSTs must carry an `Origin` matching the site's host; requests with no `Origin` (curl, scripts) are refused. | Allowing origin-less requests (lets scripts spend the key). | Add trusted origins in `AURA_ALLOWED_ORIGINS`. |
| D-04 | Local models in production | Production never probes `127.0.0.1` and never shows Ollama instructions. | Keeping the old fallback chain in production (always fails on Vercel and leaks setup copy). | `AURA_LOCAL_AI=1`. |
