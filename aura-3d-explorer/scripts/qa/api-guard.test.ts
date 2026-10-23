import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin, resetRateLimits, takeToken } from '../../src/lib/apiGuard';

// Route modules read NODE_ENV / keys at import time: production, hosted, no local model.
(process.env as Record<string, string>).NODE_ENV = 'production';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.AURA_ASSISTANT_RATE_LIMIT = '3';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://aura.example/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'aura.example', origin: 'https://aura.example', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  });

/** A minimal Anthropic streaming response (SSE), as the Messages API sends it. */
function sse(text: string[], stop = 'end_turn') {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'SECRET-REASONING' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
    ...text.map((t): [string, unknown] => ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } }]),
    ['content_block_stop', { type: 'content_block_stop', index: 1 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
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

test('assistant health in production reports Anthropic and never local setup', async () => {
  resetRateLimits();
  const { GET } = await import('../../src/app/api/assistant/route');
  const res = await GET(new Request('https://aura.example/api/assistant', { headers: { host: 'aura.example' } }));
  const data = await res.json();
  assert.deepEqual({ online: data.online, provider: data.provider, setup: data.setup }, { online: true, provider: 'anthropic', setup: 'hosted' });
});

test('assistant streams Claude text only, keeps [[action]] lines, and bounds history', async () => {
  resetRateLimits();
  const { POST } = await import('../../src/app/api/assistant/route');
  const original = globalThis.fetch;
  let sent: { model: string; messages: { role: string; content: string }[]; system: string; fallbacks: unknown } | null = null;
  let headers: Headers | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /api\.anthropic\.com\/v1\/messages/);
    sent = JSON.parse(String(init?.body));
    headers = new Headers(init?.headers);
    return sse(['Here is the aerial view.\n', '[[action:photo angle=aerial]]\n']);
  }) as typeof fetch;
  try {
    const long = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i} ${'x'.repeat(2500)}` }));
    long.push({ role: 'user', content: 'show me from above' });
    const res = await POST(post({ messages: long, context: { project: 'meridian' } }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-aura-provider'), 'anthropic');
    const text = await res.text();
    assert.equal(text, 'Here is the aerial view.\n[[action:photo angle=aerial]]\n');
    assert.ok(!text.includes('SECRET-REASONING'));
    assert.ok(sent);
    const body = sent as unknown as { model: string; messages: { role: string; content: string }[]; system: string; fallbacks: unknown };
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(body.fallbacks, 'default');
    assert.match(String((headers as unknown as Headers).get('anthropic-beta')), /server-side-fallback-2026-07-01/);
    assert.ok(body.messages.length <= 12, `history ${body.messages.length}`);
    assert.equal(body.messages[0].role, 'user');
    assert.ok(body.messages.every((m) => m.content.length <= 2000));
    assert.match(body.system, /CONTEXT:\n\{"project":"meridian"\}/);
  } finally {
    globalThis.fetch = original;
  }
});

test('assistant refuses cross-site POSTs and rate limits per IP', async () => {
  resetRateLimits();
  const { POST } = await import('../../src/app/api/assistant/route');
  const original = globalThis.fetch;
  globalThis.fetch = (async () => sse(['ok'])) as typeof fetch;
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
