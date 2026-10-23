import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin, resetRateLimits, takeToken } from '../../src/lib/apiGuard';

// Route modules read env at import time: a local machine (not Vercel), Ollama only.
process.env.AURA_ASSISTANT_RATE_LIMIT = '3';
delete process.env.VERCEL;

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://aura.example/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'aura.example', origin: 'https://aura.example', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  });

/** A minimal Ollama /api/chat streaming response (newline-delimited JSON). */
function ndjson(text: string[]) {
  const lines = [...text.map((t) => ({ message: { role: 'assistant', content: t }, done: false })), { message: { role: 'assistant', content: '' }, done: true }];
  return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

test('same-origin check rejects cross-site and origin-less POSTs', () => {
  const r = (h: Record<string, string>) => new Request('https://aura.example/api/x', { method: 'POST', headers: { host: 'aura.example', ...h } });
  assert.equal(isSameOrigin(r({ origin: 'https://aura.example' }), { requireOrigin: true }), true);
  assert.equal(isSameOrigin(r({ origin: 'https://evil.example' }), { requireOrigin: true }), false);
  assert.equal(isSameOrigin(r({ origin: 'https://aura.example', 'sec-fetch-site': 'cross-site' }), { requireOrigin: true }), false);
  assert.equal(isSameOrigin(r({}), { requireOrigin: true }), false);
  assert.equal(isSameOrigin(r({}), { requireOrigin: false }), true);
});

test('rate limiter blocks after the limit and resets after the window', () => {
  resetRateLimits();
  const rule = { limit: 2, windowMs: 1000 };
  assert.equal(takeToken('t', 'ip', rule, 0), null);
  assert.equal(takeToken('t', 'ip', rule, 10), null);
  assert.equal(takeToken('t', 'ip', rule, 20), 1);
  assert.equal(takeToken('t', 'other-ip', rule, 20), null);
  assert.equal(takeToken('t', 'ip', rule, 1001), null);
});

test('assistant streams the local model reply, keeps [[action]] lines, and bounds history', async () => {
  resetRateLimits();
  const { POST } = await import('../../src/app/api/assistant/route');
  const original = globalThis.fetch;
  let sent: { messages: { role: string; content: string }[] } | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /127\.0\.0\.1:11434\/api\/chat/);
    sent = JSON.parse(String(init?.body));
    return ndjson(['Here is the aerial view.\n', '[[action:photo angle=aerial]]\n']);
  }) as typeof fetch;
  try {
    const long = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i} ${'x'.repeat(2500)}` }));
    long.push({ role: 'user', content: 'show me from above' });
    const res = await POST(post({ messages: long, context: { project: 'meridian' } }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-aura-provider'), 'ollama');
    assert.equal(await res.text(), 'Here is the aerial view.\n[[action:photo angle=aerial]]\n');
    const body = sent as unknown as { messages: { role: string; content: string }[] };
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /CONTEXT:\n\{"project":"meridian"\}/);
    assert.ok(body.messages.length <= 13, `history ${body.messages.length}`);
    assert.ok(body.messages.slice(1).every((m) => m.content.length <= 2000));
  } finally {
    globalThis.fetch = original;
  }
});

test('assistant refuses cross-site POSTs and rate limits per IP', async () => {
  resetRateLimits();
  const { POST } = await import('../../src/app/api/assistant/route');
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ndjson(['ok'])) as typeof fetch;
  try {
    const msg = { messages: [{ role: 'user', content: 'hi' }] };
    assert.equal((await POST(post(msg, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }))).status, 403);
    for (let i = 0; i < 3; i++) assert.equal((await POST(post(msg))).status, 200);
    const limited = await POST(post(msg));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.equal((await POST(post(msg, { 'x-forwarded-for': '198.51.100.7' }))).status, 200);
  } finally {
    globalThis.fetch = original;
  }
});

test('engine route refuses cross-site uploads before reading the body', async () => {
  resetRateLimits();
  const { POST } = await import('../../src/app/api/engine/route');
  const req = new Request('https://aura.example/api/engine', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'aura.example', origin: 'https://evil.example' },
    body: JSON.stringify({ fileName: 'a.dxf', text: '0\nEOF' }),
  });
  assert.equal((await POST(req)).status, 403);
});

test('requestOrigin follows the Host the browser used, not the server bind address', async () => {
  const { requestOrigin } = await import('../../src/lib/apiGuard');
  assert.equal(requestOrigin(new Request('http://localhost:3137/auth/callback', { headers: { host: '127.0.0.1:3137' } })), 'http://127.0.0.1:3137');
  assert.equal(requestOrigin(new Request('http://localhost:3000/x', { headers: { host: 'internal', 'x-forwarded-host': 'aura.example.com', 'x-forwarded-proto': 'https' } })), 'https://aura.example.com');
  assert.equal(requestOrigin(new Request('http://localhost:3000/x', { headers: { host: 'evil.example/<script>' } })), 'http://localhost:3000');
});
