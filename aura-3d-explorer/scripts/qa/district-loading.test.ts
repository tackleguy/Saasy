import { test } from "node:test";
import assert from "node:assert/strict";
import { DistrictLoadController, type DistrictDetail, type DistrictLoadStatus } from "../../src/lib/districtLoadController";

type Resource = { name: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const requests: { detail: DistrictDetail; signal: AbortSignal; result: ReturnType<typeof deferred<Resource>> }[] = [];
  const statuses: DistrictLoadStatus[] = [];
  const events: string[] = [];
  const disposals = new Map<Resource, number>();
  let visible: Resource | null = null;
  const controller = new DistrictLoadController<Resource>({
    load(detail, signal) {
      const result = deferred<Resource>();
      requests.push({ detail, signal, result });
      return result.promise;
    },
    dispose(value) {
      assert.notEqual(visible, value, "detach the graph before disposing its resources");
      disposals.set(value, (disposals.get(value) ?? 0) + 1);
      events.push(`dispose:${value.name}`);
    },
    replace(next, previous, detail) {
      assert.equal(visible, previous);
      visible = next;
      events.push(`replace:${next?.name ?? "none"}:${detail ?? "none"}`);
    },
    status(value) { statuses.push(value); },
  });
  return { controller, requests, statuses, events, disposals, visible: () => visible };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

test("a pending quality upgrade keeps the district and atomically replaces it before disposal", async () => {
  const f = fixture(), standard = { name: "standard" }, high = { name: "high" };
  const first = f.controller.request("standard");
  f.requests[0].result.resolve(standard); await first;
  const upgrade = f.controller.request("high");
  assert.equal(f.visible(), standard);
  assert.equal(f.statuses.at(-1), "updating");
  assert.equal(f.disposals.size, 0);
  f.requests[1].result.resolve(high); await upgrade;
  assert.equal(f.visible(), high);
  assert.deepEqual(f.events, ["replace:standard:standard", "replace:high:high", "dispose:standard"]);
  f.controller.dispose(); f.controller.dispose();
  assert.equal(f.visible(), null);
  assert.deepEqual([...f.disposals.values()], [1, 1]);
});

test("initial unavailable or corrupt HQ falls back to the same district's standard model", async () => {
  for (const failure of [new Error("404"), new SyntaxError("Corrupt GLB")]) {
    const f = fixture(), standard = { name: "standard" };
    const request = f.controller.request("high");
    f.requests[0].result.reject(failure); await turn();
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].detail, "standard");
    assert.equal(f.requests[1].signal, f.requests[0].signal);
    f.requests[1].result.resolve(standard); await request;
    assert.equal(f.visible(), standard);
    assert.equal(f.statuses.at(-1), "fallback");
    f.controller.dispose();
    assert.equal(f.disposals.get(standard), 1);
  }
});

test("a failed HQ upgrade retains an active standard district without downloading it again", async () => {
  const f = fixture(), standard = { name: "standard" };
  const first = f.controller.request("standard");
  f.requests[0].result.resolve(standard); await first;
  const upgrade = f.controller.request("high");
  f.requests[1].result.reject(new Error("Network disconnected")); await upgrade;
  assert.equal(f.visible(), standard);
  assert.equal(f.requests.length, 2);
  assert.equal(f.statuses.at(-1), "fallback");
  assert.equal(f.disposals.size, 0);
  f.controller.dispose();
});

test("both variants failing leaves an actionable failed state and a later retry can recover", async () => {
  const f = fixture(), high = { name: "retried high" };
  const request = f.controller.request("high");
  f.requests[0].result.reject(new Error("HQ missing")); await turn();
  f.requests[1].result.reject(new Error("Standard missing")); await request;
  assert.equal(f.visible(), null);
  assert.equal(f.statuses.at(-1), "failed");
  const retry = f.controller.request("high");
  assert.equal(f.statuses.at(-1), "loading");
  f.requests[2].result.resolve(high); await retry;
  assert.equal(f.visible(), high);
  assert.equal(f.statuses.at(-1), "ready");
  f.controller.dispose();
});

test("a failed downgrade retains its existing HQ district", async () => {
  const f = fixture(), high = { name: "high" };
  const first = f.controller.request("high");
  f.requests[0].result.resolve(high); await first;
  const downgrade = f.controller.request("standard");
  f.requests[1].result.reject(new Error("Standard fetch failed")); await downgrade;
  assert.equal(f.visible(), high);
  assert.equal(f.statuses.at(-1), "retained");
  assert.equal(f.disposals.size, 0);
  f.controller.dispose();
});

test("reversing to active detail cancels an obsolete upgrade without refetching or blanking", async () => {
  const f = fixture(), standard = { name: "standard" }, stale = { name: "stale high" };
  const first = f.controller.request("standard");
  f.requests[0].result.resolve(standard); await first;
  const upgrade = f.controller.request("high");
  await f.controller.request("standard");
  assert.equal(f.requests[1].signal.aborted, true);
  assert.equal(f.requests.length, 2);
  assert.equal(f.visible(), standard);
  const statuses = [...f.statuses];
  f.requests[1].result.resolve(stale); await upgrade;
  assert.equal(f.visible(), standard);
  assert.deepEqual(f.statuses, statuses);
  assert.equal(f.disposals.get(stale), 1);
  f.controller.dispose();
});

test("an older initial load cannot replace a newer choice or trigger a stale fallback", async () => {
  const f = fixture(), standard = { name: "latest standard" };
  const old = f.controller.request("high");
  const latest = f.controller.request("standard");
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[1].result.resolve(standard); await latest;
  f.requests[0].result.reject(new Error("late HQ failure")); await old;
  assert.equal(f.requests.length, 2);
  assert.equal(f.visible(), standard);
  assert.equal(f.statuses.at(-1), "ready");
  f.controller.dispose();
});

test("unmount detaches active scenery and disposes late parse completion without callbacks", async () => {
  const f = fixture(), standard = { name: "standard" }, late = { name: "late high" };
  const first = f.controller.request("standard");
  f.requests[0].result.resolve(standard); await first;
  const upgrade = f.controller.request("high");
  f.controller.dispose(); f.controller.dispose();
  assert.equal(f.requests[1].signal.aborted, true);
  const statuses = [...f.statuses], events = [...f.events];
  f.requests[1].result.resolve(late); await upgrade;
  assert.equal(f.visible(), null);
  assert.deepEqual(f.statuses, statuses);
  assert.deepEqual(f.events, [...events, "dispose:late high"]);
  assert.equal(f.disposals.get(standard), 1);
  assert.equal(f.disposals.get(late), 1);
  await f.controller.request("standard");
  assert.equal(f.requests.length, 2);
});

test("a stale fallback completion is released when a newer request wins", async () => {
  const f = fixture(), high = { name: "latest high" }, stale = { name: "stale fallback" };
  const initial = f.controller.request("high");
  f.requests[0].result.reject(new Error("HQ unavailable")); await turn();
  const latest = f.controller.request("high");
  assert.equal(f.requests[1].signal.aborted, true);
  f.requests[2].result.resolve(high); await latest;
  f.requests[1].result.resolve(stale); await initial;
  assert.equal(f.visible(), high);
  assert.equal(f.disposals.get(stale), 1);
  assert.equal(f.statuses.at(-1), "ready");
  f.controller.dispose();
});
