/**
 * Tenant isolation, proven against a real Postgres (QA-001's "unverifiable gap").
 *
 * Applies supabase/tests/local-supabase-stub.sql and every migration in
 * supabase/migrations to a fresh database, then acts as two organizations and
 * an anonymous visitor through the same `anon` / `authenticated` roles and JWT
 * claims Supabase uses. Needs a local Postgres 15+ (psql on PATH):
 *
 *   AURA_TEST_PG="-h /var/tmp -p 54329 -U postgres" npm test
 *
 * Without AURA_TEST_PG the suite is skipped and says so; it never reports a pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";

const PG = process.env.AURA_TEST_PG;
const skip = PG ? false : "set AURA_TEST_PG to a local Postgres (see file header) to run tenant-isolation tests";
const DB = `aura_rls_${process.pid}`;
const args = (PG ?? "").split(/\s+/).filter(Boolean);
const psql = (db: string, sql: string) => spawnSync("psql", [...args, "-d", db, "-v", "ON_ERROR_STOP=1", "-qAt", "-f", "-"], { encoding: "utf8", input: sql });

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** Run statements as a Supabase role; returns stdout lines, or throws with stderr. */
function as(who: { role: "anon" | "authenticated" | "service_role"; sub?: string }, sql: string): string[] {
  const claims = JSON.stringify(who.sub ? { sub: who.sub, role: who.role } : { role: who.role });
  const r = psql(DB, `begin; set local role ${who.role}; do $$ begin perform set_config('request.jwt.claims', '${claims}', true); end $$;\n${sql}; commit;`);
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim().split("\n").filter(Boolean);
}
const userA = { role: "authenticated" as const, sub: A };
const userB = { role: "authenticated" as const, sub: B };
const anon = { role: "anon" as const };
const service = { role: "service_role" as const };
const denied = (fn: () => unknown, pattern = /row-level security|permission denied|violates/) => assert.throws(fn, pattern);
const token = () => randomBytes(32).toString("base64url");
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

test("tenant isolation and share links", { skip }, async (t) => {
  execFileSync("psql", [...args, "-d", "postgres", "-qc", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
  try {
    const setup = (file: string) => execFileSync("psql", [...args, "-d", DB, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8" });
    setup("supabase/tests/local-supabase-stub.sql");
    for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) setup(`supabase/migrations/${f}`);
    psql(DB, `insert into auth.users (id, email) values ('${A}', 'a@alpha.test'), ('${B}', 'b@beta.test')`);

    const orgA = as(userA, `select aura.create_organization('Alpha Developments', 'alpha')`)[0];
    const orgB = as(userB, `select aura.create_organization('Beta Partners', 'beta')`)[0];
    const projectA = as(userA, `insert into projects (org_id, slug, name, data, created_by) values ('${orgA}', 'harbor', 'Harbor', '{"name":"Harbor","finance":{"x":1},"massing":[]}', '${A}') returning id`)[0];
    as(userB, `insert into projects (org_id, slug, name, data, created_by) values ('${orgB}', 'quay', 'Quay', '{"name":"Quay"}', '${B}')`);
    // The seed migration provides the public sample portfolio (all of src/content/projects.ts).
    const samples = Number(as(service, `select count(*) from projects where is_public`)[0]);
    assert.ok(samples >= 8, `seeded samples: ${samples}`);

    await t.test("each organization sees only its own organization, members and projects", () => {
      assert.deepEqual(as(userA, `select name from organizations`), ["Alpha Developments"]);
      assert.deepEqual(as(userB, `select name from organizations`), ["Beta Partners"]);
      assert.deepEqual(as(userA, `select user_id from memberships`), [A]);
      assert.deepEqual(as(userA, `select name from projects where not is_public order by name`), ["Harbor"]);
      assert.ok(Number(as(userA, `select count(*) from projects where is_public`)[0]) >= 8, "members still see the public samples");
      assert.deepEqual(as(userB, `select name from projects where not is_public order by name`), ["Quay"]);
      assert.deepEqual(as(userB, `select count(*) from projects where id = '${projectA}'`), ["0"]);
    });

    await t.test("a member cannot write into another organization", () => {
      denied(() => as(userB, `insert into projects (org_id, slug, name, data, created_by) values ('${orgA}', 'x', 'X', '{}', '${B}')`));
      assert.deepEqual(as(userB, `update projects set name = 'pwned' where id = '${projectA}' returning id`), []);
      assert.deepEqual(as(userB, `delete from projects where id = '${projectA}' returning id`), []);
      denied(() => as(userB, `insert into scenarios (project_id, org_id, name, payload) values ('${projectA}', '${orgB}', 'x', '{}')`));
      denied(() => as(userB, `insert into scenarios (project_id, org_id, name, payload) values ('${projectA}', '${orgA}', 'x', '{}')`));
      denied(() => as(userB, `insert into share_links (project_id, org_id, token_hash) values ('${projectA}', '${orgB}', '${sha(token())}')`));
      assert.deepEqual(as(userB, `update organizations set name = 'pwned' where id = '${orgA}' returning id`), []);
      denied(() => as(userB, `insert into memberships (user_id, org_id) values ('${B}', '${orgA}')`), /permission denied/);
      denied(() => as(userB, `select aura.create_organization('Second', 'second')`), /already a member/);
      assert.deepEqual(as(userA, `select name from projects where id = '${projectA}'`), ["Harbor"]);
    });

    await t.test("storage objects are confined to the organization's folder", () => {
      as(userA, `insert into storage.objects (bucket_id, name) values ('project-images', '${orgA}/${projectA}/hero-1.jpg')`);
      denied(() => as(userB, `insert into storage.objects (bucket_id, name) values ('project-images', '${orgA}/${projectA}/evil.jpg')`));
      assert.deepEqual(as(userB, `select count(*) from storage.objects`), ["0"]);
      assert.deepEqual(as(userA, `select count(*) from storage.objects`), ["1"]);
    });

    await t.test("anonymous visitors read public samples only and nothing else", () => {
      assert.deepEqual(as(anon, `select count(*) from projects`), [String(samples)]);
      assert.deepEqual(as(anon, `select count(*) from projects where not is_public`), ["0"]);
      assert.deepEqual(as(anon, `select name from projects where slug = 'meridian-tower'`), ["The Meridian Tower"]);
      denied(() => as(anon, `select * from organizations`), /permission denied/);
      denied(() => as(anon, `select * from share_links`), /permission denied/);
      denied(() => as(anon, `select * from enquiries`), /permission denied/);
      denied(() => as(anon, `insert into enquiries (kind, name, email) values ('demo', 'x', 'x@y.z')`), /permission denied/);
    });

    await t.test("share links resolve by token, hide financials by default, revoke and expire immediately", () => {
      const open = token(), secret = token(), money = token(), stale = token();
      as(userA, `insert into share_links (project_id, org_id, token_hash, created_by) values ('${projectA}', '${orgA}', '${sha(open)}', '${A}')`);
      as(userA, `insert into share_links (project_id, org_id, token_hash, password_hash) values ('${projectA}', '${orgA}', '${sha(secret)}', aura.hash_share_password('harbor-2028'))`);
      as(userA, `insert into share_links (project_id, org_id, token_hash, share_financials) values ('${projectA}', '${orgA}', '${sha(money)}', true)`);
      as(userA, `insert into share_links (project_id, org_id, token_hash, expires_at) values ('${projectA}', '${orgA}', '${sha(stale)}', now() - interval '1 minute')`);
      const resolve = (tok: string, pw = "null") => as(anon, `select coalesce(project->>'name', '-') || '|' || (project ? 'finance')::text || '|' || needs_password || '|' || coalesce(org_name, '-') from aura.resolve_share('${tok}', ${pw})`);
      assert.deepEqual(resolve(open), ["Harbor|false|false|Alpha Developments"]);
      assert.deepEqual(resolve(money), ["Harbor|true|false|Alpha Developments"]);
      assert.deepEqual(as(anon, `select needs_password, project is null from aura.resolve_share('${secret}', null)`), ["t|t"], "password link must not leak the project");
      assert.deepEqual(as(anon, `select needs_password from aura.resolve_share('${secret}', 'wrong')`), ["t"]);
      assert.deepEqual(as(anon, `select project->>'name' from aura.resolve_share('${secret}', 'harbor-2028')`), ["Harbor"]);
      assert.deepEqual(resolve(stale), []);
      assert.deepEqual(resolve(token()), [], "unknown token");
      assert.deepEqual(resolve("short"), [], "malformed token");
      // Org B cannot revoke Org A's link; Org A can, and it stops resolving at once.
      assert.deepEqual(as(userB, `update share_links set revoked_at = now() where token_hash = '${sha(open)}' returning id`), []);
      assert.deepEqual(resolve(open), ["Harbor|false|false|Alpha Developments"]);
      as(userA, `update share_links set revoked_at = now() where token_hash = '${sha(open)}'`);
      assert.deepEqual(resolve(open), []);
      // Tokens are never stored: only the SHA-256 is.
      assert.deepEqual(as(service, `select count(*) from share_links where token_hash = '${open}'`), ["0"]);
    });

    await t.test("the public API wrappers behave like the aura functions", () => {
      const live = token();
      as(userA, `insert into share_links (project_id, org_id, token_hash) values ('${projectA}', '${orgA}', '${sha(live)}')`);
      assert.deepEqual(as(anon, `select project->>'name' from public.resolve_share('${live}')`), ["Harbor"]);
      denied(() => as(anon, `select public.create_organization('X', 'x')`), /permission denied/);
      denied(() => as(anon, `select public.hash_share_password('x')`), /permission denied/);
      assert.match(as(userA, `select public.hash_share_password('pw')`)[0], /^\$2[aby]\$/);
    });

    await t.test("enquiries written by the server are visible to that organization only", () => {
      as(service, `insert into enquiries (project_id, org_id, kind, name, email) values ('${projectA}', '${orgA}', 'enquiry', 'Buyer', 'buyer@example.com')`);
      assert.deepEqual(as(userA, `select name from enquiries`), ["Buyer"]);
      assert.deepEqual(as(userB, `select count(*) from enquiries`), ["0"]);
    });
  } finally {
    execFileSync("psql", [...args, "-d", "postgres", "-qc", `drop database if exists ${DB}`]);
  }
});
