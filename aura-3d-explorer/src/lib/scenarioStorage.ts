import type { BuildingId, YieldInputs } from '@/types';

export type SiteLayout = Partial<Record<BuildingId, [number, number]>>;
export interface Scenario {
  id: string;
  name: string;
  savedAt: string;
  inputsById: Record<BuildingId, YieldInputs>;
  layout?: SiteLayout;
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const limits: Record<string, [number, number]> = {
  totalBuildableSqFt: [1, 10_000_000], landCost: [0, 10_000_000_000], hardCostPerSqFt: [0, 100_000],
  softCostPct: [0, 100], contingencyPct: [0, 100], ltcPct: [0, 100], interestRatePct: [0, 100],
  termMonths: [1, 120], absorptionUnitsPerMonth: [0.1, 100_000], salesCommissionPct: [0, 100],
  auraFeePct: [0, 100], targetProfitOnCostPct: [0, 100],
};
export function validYieldInputs(value: unknown): value is YieldInputs {
  if (!record(value)) return false;
  if (!Object.entries(limits).every(([key, [min,max]]) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= min && value[key] <= max)) return false;
  if (!['balanced','luxury_heavy','commercial_focus'].includes(String(value.unitMixStrategy))) return false;
  const prices = value.pricePerSqFt;
  return record(prices) && ['podium','office','residential','crown'].every(z => typeof prices[z] === 'number' && Number.isFinite(prices[z]) && prices[z] >= 0 && prices[z] <= 100_000);
}
export const scenarioKey = (slug: string) => `aura:scenarios:${slug}`;
export function readScenarios(storage: Pick<Storage,'getItem'>, slug: string): Scenario[] {
  const raw = storage.getItem(scenarioKey(slug));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(s => record(s) && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.savedAt === 'string' && Number.isFinite(Date.parse(s.savedAt)) && record(s.inputsById) && Object.keys(s.inputsById).length > 0 && Object.values(s.inputsById).every(validYieldInputs) && (s.layout === undefined || (record(s.layout) && Object.values(s.layout).every(pos=>Array.isArray(pos) && pos.length===2 && pos.every(v=>typeof v==='number' && Number.isFinite(v))))))) {
    throw new Error('Invalid saved scenarios');
  }
  return data as Scenario[];
}
export function writeScenarios(storage: Pick<Storage,'setItem'>, slug: string, list: Scenario[]): void {
  storage.setItem(scenarioKey(slug), JSON.stringify(list));
}
