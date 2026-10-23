import { test } from "node:test";
import assert from "node:assert/strict";
import { enquiryEmail, parseEnquiry, sendWithResend } from "../../src/lib/enquiries";
import { resetRateLimits } from "../../src/lib/apiGuard";

const valid = { kind: "enquiry", name: "Ada Buyer", email: "ada@example.com", projectSlug: "meridian-tower", message: "Hi", details: { intent: "viewing", unit: "MER-1203" } };

test("enquiry validation keeps clean fields and rejects bad input", () => {
  const parsed = parseEnquiry(valid);
  assert.ok(typeof parsed !== "string");
  assert.deepEqual(parsed, { kind: "enquiry", name: "Ada Buyer", email: "ada@example.com", company: null, message: "Hi", projectSlug: "meridian-tower", details: { intent: "viewing", unit: "MER-1203" } });
  assert.equal(parseEnquiry({ ...valid, email: "not-an-email" }), "Please enter a valid email address.");
  assert.equal(parseEnquiry({ ...valid, name: "   " }), "Please enter your name.");
  assert.equal(parseEnquiry({ ...valid, kind: "spam" }), "Unknown request type.");
  assert.equal(parseEnquiry({ ...valid, website: "http://spam.example" }), "Your request could not be sent.");
  const hostile = parseEnquiry({ ...valid, projectSlug: "../../etc", name: "x\u0000y", details: { "bad key": "v", ok: "fine", n: { nested: 1 } } });
  assert.ok(typeof hostile !== "string");
  assert.equal(hostile.projectSlug, null);
  assert.equal(hostile.name, "xy");
  assert.deepEqual(hostile.details, { ok: "fine" });
});

test("email content names the project, intent and reply-to address", () => {
  const parsed = parseEnquiry(valid);
  assert.ok(typeof parsed !== "string");
  const mail = enquiryEmail(parsed, "The Meridian Tower");
  assert.equal(mail.subject, "Viewing request — The Meridian Tower");
  assert.match(mail.text, /Unit: MER-1203/);
  assert.match(mail.text, /Email: ada@example.com/);
});

test("Resend is called with the right payload, and failures are reported, not thrown", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.AURA_ENQUIRY_TO = "sales@aura.example, ceo@aura.example";
  const parsed = parseEnquiry(valid);
  assert.ok(typeof parsed !== "string");
  let sent: { url: string; body: Record<string, unknown>; auth: string | null } | null = null;
  const ok = await sendWithResend(parsed, "The Meridian Tower", (async (url: RequestInfo | URL, init?: RequestInit) => {
    sent = { url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") };
    return new Response("{}", { status: 200 });
  }) as typeof fetch);
  assert.equal(ok, true);
  const s = sent as unknown as { url: string; body: Record<string, unknown>; auth: string | null };
  assert.equal(s.url, "https://api.resend.com/emails");
  assert.equal(s.auth, "Bearer re_test");
  assert.deepEqual(s.body.to, ["sales@aura.example", "ceo@aura.example"]);
  assert.equal(s.body.reply_to, "ada@example.com");
  assert.equal(await sendWithResend(parsed, null, (async () => new Response("bad", { status: 422 })) as typeof fetch), false);
  assert.equal(await sendWithResend(parsed, null, (async () => { throw new Error("network"); }) as typeof fetch), false);
  delete process.env.RESEND_API_KEY;
  delete process.env.AURA_ENQUIRY_TO;
});

test("with no database and no email key the route says plainly that nothing was sent", async () => {
  resetRateLimits();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { POST } = await import("../../src/app/api/enquiries/route");
  const res = await POST(new Request("https://aura.example/api/enquiries", {
    method: "POST", headers: { "content-type": "application/json", host: "aura.example", origin: "https://aura.example" }, body: JSON.stringify(valid),
  }));
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.deepEqual({ stored: data.stored, emailed: data.emailed }, { stored: false, emailed: false });
  assert.match(data.error, /not connected to an inbox yet, so your request was not sent/);
  const bad = await POST(new Request("https://aura.example/api/enquiries", {
    method: "POST", headers: { "content-type": "application/json", host: "aura.example", origin: "https://evil.example" }, body: JSON.stringify(valid),
  }));
  assert.equal(bad.status, 403);
});
