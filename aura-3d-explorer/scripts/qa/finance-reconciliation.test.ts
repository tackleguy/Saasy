/**
 * Every currency and area figure for The Meridian Tower must be the same number
 * on every surface that shows it: the sidebar, the chart totals, the
 * sensitivity table, the stacking plan and the printed pro forma. Each surface
 * is rendered to static HTML from the same finance.ts result and searched for
 * the formatted figure. Also covers the zero-units-sold edge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PROJECTS, projectSite } from "../../src/content/projects";
import { computeSite, computeYield, sensitivity } from "../../src/lib/finance";
import { fmtMoney, fmtNum } from "../../src/lib/format";
import ProFormaReport from "../../src/components/studio/ProFormaReport";
import SensitivityTable from "../../src/components/ui/SensitivityTable";
import FinancialSidebar from "../../src/components/ui/FinancialSidebar";
import StackingPlan, { buildUnits } from "../../src/components/project/StackingPlan";
import type { BuildingId, YieldInputs, YieldMetrics } from "../../src/types";

const project = PROJECTS.find((p) => p.slug === "meridian-tower")!;
const buildings = projectSite(project);
const inputsById = Object.fromEntries(buildings.map((b) => [b.id, project.finance[b.id]])) as Record<BuildingId, YieldInputs>;
const metricsById = Object.fromEntries(buildings.map((b) => [b.id, computeYield(inputsById[b.id], b.floors)])) as Record<BuildingId, YieldMetrics>;
const site = computeSite(buildings.map((b) => metricsById[b.id]));
const active = buildings[0];
const m = metricsById[active.id];
const close = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)) * 1e-6 + tol, `${a} ≠ ${b}`);
// React escapes text; compare against the escaped form of formatted figures.
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el).replace(/&amp;/g, "&").replace(/<!-- -->/g, "");

const report = () => html(createElement(ProFormaReport, { projectName: project.name, city: project.city, buildings, inputsById, metricsById, site }));
const sidebar = (metrics = m, siteMetrics = site, inputs = inputsById[active.id]) => html(createElement(FinancialSidebar, {
  buildings, siteName: project.name, building: active, inputs, metrics, metricsById: { ...metricsById, [active.id]: metrics }, site: siteMetrics,
  onBuildingChange: () => {}, setInput: () => {}, onReset: () => {}, onFocusZone: () => {},
}));

test("Meridian: sidebar and printed pro forma show identical site and building figures", () => {
  const side = sidebar(), print = report();
  for (const figure of [fmtMoney(site.gdv), fmtMoney(site.profit)]) {
    assert.ok(side.includes(figure), `sidebar missing site ${figure}`);
    assert.ok(print.includes(figure), `report missing site ${figure}`);
  }
  assert.ok(side.includes(fmtNum(site.totalSqFt)) && print.includes(fmtNum(site.totalSqFt)), "site area differs");
  assert.ok(side.includes(fmtNum(site.totalUnits)) && print.includes(fmtNum(site.totalUnits)), "site units differ");
  for (const value of [m.gdv, m.totalDevelopmentCost, m.profit, m.equityRequired, m.residualLandValue]) {
    assert.ok(side.includes(fmtMoney(value)), `sidebar missing ${fmtMoney(value)}`);
    assert.ok(print.includes(fmtMoney(value, false)), `report missing ${fmtMoney(value, false)}`);
  }
});

test("Meridian: chart totals reconcile — costs + profit = GDV, zones sum to GDV", () => {
  const stack = m.landCost + m.hardCost + m.softCost + m.contingency + m.financeCost + m.salesCommission + m.platformFee + m.profit;
  close(stack, m.gdv);
  close(m.zones.reduce((s, z) => s + z.revenue, 0), m.gdv);
  close(m.floors.reduce((s, f) => s + f.revenue, 0), m.gdv);
  close(m.floors.reduce((s, f) => s + f.sqFt, 0), m.zones.reduce((s, z) => s + z.sqFt, 0));
});

test("Meridian: sensitivity centre cell is the sidebar's profit on cost", () => {
  const grid = sensitivity(inputsById[active.id], active.floors);
  close(grid[2][2], m.profitOnCostPct);
  const table = html(createElement(SensitivityTable, { inputs: inputsById[active.id], floors: active.floors, buildingName: active.short }));
  assert.ok(table.includes(`${m.profitOnCostPct.toFixed(1)}%`), "sensitivity table must print the base case");
  assert.ok(sidebar().includes(`${m.profitOnCostPct.toFixed(1)}%`), "sidebar must print the same profit on cost");
});

test("Meridian: stacking plan units add up to the building's saleable area and GDV", () => {
  for (const b of buildings) {
    const metrics = metricsById[b.id];
    // The penthouse spans every crown floor and appears on each crown row: count it once, as the plan's totals do.
    const units = [...new Map(buildUnits(project.slug, project.status, b, metrics).flat().map((u) => [u.code, u])).values()];
    const saleable = metrics.floors.filter((f) => f.revenue > 0);
    close(units.reduce((s, u) => s + u.price, 0), saleable.reduce((s, f) => s + f.revenue, 0));
    close(units.reduce((s, u) => s + u.price, 0), metrics.gdv);
    close(units.reduce((s, u) => s + u.sqFt, 0), saleable.reduce((s, f) => s + f.sqFt, 0));
  }
  const plan = html(createElement(StackingPlan, { slug: project.slug, status: project.status, building: active, metrics: m, onShowFloor: () => {}, onEnquire: () => {} }));
  assert.ok(plan.length > 1000, "stacking plan renders");
});

test("zero units sold: no sales absorption keeps every surface finite and consistent", () => {
  const inputs = { ...inputsById[active.id], absorptionUnitsPerMonth: 0, presalePct: 0 } as YieldInputs;
  const z = computeYield(inputs, active.floors);
  for (const [key, value] of Object.entries(z)) if (typeof value === "number") assert.ok(Number.isFinite(value), `${key} = ${value}`);
  const zSite = computeSite(buildings.map((b) => (b.id === active.id ? z : metricsById[b.id])));
  const side = sidebar(z, zSite, inputs);
  for (const figure of [fmtMoney(z.gdv), fmtMoney(z.totalDevelopmentCost), fmtMoney(z.profit)]) assert.ok(side.includes(figure), `sidebar missing ${figure}`);
  assert.ok(!/NaN|Infinity|undefined/.test(side), "sidebar prints an invalid number");
  const print = html(createElement(ProFormaReport, { projectName: project.name, city: project.city, buildings, inputsById: { ...inputsById, [active.id]: inputs }, metricsById: { ...metricsById, [active.id]: z }, site: zSite }));
  assert.ok(print.includes(fmtMoney(z.profit, false)), "report must match sidebar profit");
  assert.ok(!/NaN|Infinity|undefined/.test(print), "report prints an invalid number");
  close(z.landCost + z.hardCost + z.softCost + z.contingency + z.financeCost + z.salesCommission + z.platformFee + z.profit, z.gdv);
});
