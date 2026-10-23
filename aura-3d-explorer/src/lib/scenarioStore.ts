/**
 * Where saved scenarios live. Public sample projects keep the original
 * browser storage (no account needed); a customer project stores them in the
 * `scenarios` table, scoped to the project and organization by row-level
 * security. Both validate what they read (QA-007) and surface write failures
 * instead of claiming success (QA-003).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readScenarios, scenarioKey, validYieldInputs, writeScenarios, type Scenario } from "./scenarioStorage";

export interface ScenarioStore {
  /** Shown under the drawer title, e.g. "saved in this browser only". */
  where: string;
  read(): Promise<Scenario[]>;
  add(scenario: Scenario): Promise<void>;
  remove(id: string): Promise<void>;
}

export function browserScenarioStore(projectSlug: string, storage: Storage = window.localStorage): ScenarioStore {
  return {
    where: "saved in this browser only",
    read: async () => readScenarios(storage, projectSlug),
    add: async (s) => writeScenarios(storage, projectSlug, [s, ...readScenarios(storage, projectSlug)]),
    remove: async (id) => writeScenarios(storage, projectSlug, readScenarios(storage, projectSlug).filter((s) => s.id !== id)),
  };
}

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
function fromRow(row: { id: string; name: string; saved_at: string; payload: unknown }): Scenario | null {
  const p = row.payload;
  if (!record(p) || !record(p.inputsById) || !Object.keys(p.inputsById).length || !Object.values(p.inputsById).every(validYieldInputs)) return null;
  const layout = record(p.layout) && Object.values(p.layout).every((v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n))) ? (p.layout as Scenario["layout"]) : undefined;
  return { id: row.id, name: row.name, savedAt: row.saved_at, inputsById: p.inputsById as Scenario["inputsById"], ...(layout ? { layout } : {}) };
}

/**
 * Scenarios for a customer project. On first use it imports any scenarios this
 * browser saved for the same project slug (before accounts existed), once.
 */
export function databaseScenarioStore(client: SupabaseClient, { projectId, orgId, projectSlug, userId }: { projectId: string; orgId: string; projectSlug: string; userId: string }): ScenarioStore {
  const migratedKey = `aura:scenarios-imported:${projectId}`;
  async function importBrowserScenarios() {
    let local: Scenario[] = [];
    try {
      if (window.localStorage.getItem(migratedKey)) return;
      if (window.localStorage.getItem(scenarioKey(projectSlug))) local = readScenarios(window.localStorage, projectSlug);
    } catch { return; }
    if (local.length) {
      const { error } = await client.from("scenarios").insert(local.map((s) => ({ project_id: projectId, org_id: orgId, name: s.name.slice(0, 80), saved_at: s.savedAt, payload: { inputsById: s.inputsById, ...(s.layout ? { layout: s.layout } : {}) }, created_by: userId })));
      if (error) return; // try again next time; nothing is lost locally
    }
    try { window.localStorage.setItem(migratedKey, new Date().toISOString()); } catch {}
  }
  return {
    where: "saved to this project for everyone in your company",
    async read() {
      await importBrowserScenarios();
      const { data, error } = await client.from("scenarios").select("id, name, saved_at, payload").eq("project_id", projectId).order("saved_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(fromRow).filter((s): s is Scenario => !!s);
    },
    async add(s) {
      const { error } = await client.from("scenarios").insert({ project_id: projectId, org_id: orgId, name: s.name.slice(0, 80), saved_at: s.savedAt, payload: { inputsById: s.inputsById, ...(s.layout ? { layout: s.layout } : {}) }, created_by: userId });
      if (error) throw new Error(error.message);
    },
    async remove(id) {
      const { error } = await client.from("scenarios").delete().eq("id", id).eq("project_id", projectId);
      if (error) throw new Error(error.message);
    },
  };
}
