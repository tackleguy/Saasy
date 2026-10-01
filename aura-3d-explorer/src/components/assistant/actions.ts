/**
 * AURA assistant — dispatch parsed actions to the registered explorer.
 * Every call is guarded (optional chaining, clamping, id validation) so a
 * sloppy command from a small model can never throw.
 */
import { intentFromText, type AssistantAction } from "./protocol";
import type { AssistantRegistration } from "./AssistantBridge";
import { PHOTO_ANGLES, type PhotoAngle } from "@/lib/explorer";
import { CITY_PRESETS, type CityId } from "@/lib/cityPresets";
import { EXPLODE_MAX, EXPLODE_MIN } from "@/lib/tower";
import type { Building, FloorData } from "@/types";
import { APARTMENT_SCHEMES, DEFAULT_FIT, FURNITURE_COPY, FURNITURE_SETS, nextFurniture, nextScheme, resolveFurniture, resolveScheme, SCHEME_COPY } from "@/lib/apartmentFit";

export interface ActionResult {
  label: string;
  ok: boolean;
}

const CITY_ALIASES: Record<string, CityId> = { nyc: "new-york", newyork: "new-york", ny: "new-york", la: "los-angeles", sf: "san-francisco" };

function resolveCity(id: string): CityId | null {
  const key = id.toLowerCase().replace(/[\s_]+/g, "-");
  const hit = CITY_PRESETS.find((c) => c.id === key || c.label.toLowerCase() === id.toLowerCase());
  return hit?.id ?? CITY_ALIASES[key.replace(/-/g, "")] ?? null;
}

/** Find the building a floor command is aimed at (small models often omit `building=`). */
function resolveBuilding(site: Building[], active: Building | undefined, n: number, hint: string | undefined, userText: string): Building | undefined {
  const match = (s: string) => site.find((b) => b.id === s || b.short?.toLowerCase() === s || b.name.toLowerCase().includes(s));
  if (hint) {
    const b = match(hint);
    if (b) return b;
  }
  if (active && n <= active.floors.length) return active;
  const text = userText.toLowerCase();
  const mentioned = site.find((b) => text.includes(b.id) || text.includes(b.short?.toLowerCase() ?? "\u0000"));
  if (mentioned && n <= mentioned.floors.length) return mentioned;
  return site.find((b) => b.floors.length >= n) ?? active;
}

const NO_EXPLORER: ActionResult = { label: "No 3D explorer on this page — open the Studio or a project", ok: false };

export function runAction(a: AssistantAction, reg: AssistantRegistration, userText: string, navigate: (href: string) => void): ActionResult {
  if (a.type === "tour") {
    navigate("/tour");
    return { label: "Opening the cinematic tour", ok: true };
  }
  const x = reg.explorer;
  if (!x) return NO_EXPLORER;

  switch (a.type) {
    case "photo": {
      const angle = PHOTO_ANGLES.find((p) => p.id === a.angle);
      if (!angle) return { label: `Unknown view “${a.angle}”`, ok: false };
      x.choosePhotoAngle?.(angle.id as PhotoAngle);
      return { label: `Switched to ${angle.label.toLowerCase()} view`, ok: true };
    }
    case "floor": {
      const site = x.site ?? [];
      const b = resolveBuilding(site, x.building, a.n, a.building, userText);
      if (!b?.floors?.length) return { label: "No floors to show", ok: false };
      const n = Math.min(Math.max(1, Math.round(a.n)), b.floors.length);
      x.selectFloor?.(b.floors[n - 1]);
      const clamped = n !== a.n ? ` (top floor is ${b.floors.length})` : "";
      return { label: `Isolated level ${n} · ${b.short ?? b.name}${clamped}`, ok: true };
    }
    case "building": {
      const b = x.site?.find((s) => s.id === a.id || s.short?.toLowerCase() === a.id);
      if (!b) return { label: `Unknown building “${a.id}”`, ok: false };
      x.selectBuilding?.(b.id);
      return { label: `Focused on ${b.name}`, ok: true };
    }
    case "explode": {
      const v = Math.min(EXPLODE_MAX, Math.max(EXPLODE_MIN, a.value));
      x.setExplosion?.(v);
      return { label: v === 0 ? "Closed the stack" : `Exploded the stack (${v.toFixed(1)}×)`, ok: true };
    }
    case "xray":
      x.setXray?.(a.on);
      return { label: `X-ray ${a.on ? "on" : "off"}`, ok: true };
    case "walk": {
      const b = x.building;
      if (!x.selectedFloor && b?.floors?.length) {
        // Walking needs an isolated floor — pick the first residential level.
        const first = b.zones?.residential?.floors?.[0] ?? 2;
        x.selectFloor?.(b.floors[Math.min(first, b.floors.length) - 1]);
      }
      x.startWalk?.();
      return { label: "Started the walk-through (Esc to exit)", ok: true };
    }
    case "city": {
      const id = resolveCity(a.id);
      if (!id) return { label: `Unknown city “${a.id}”`, ok: false };
      x.setCity?.(id);
      return { label: `City backdrop → ${CITY_PRESETS.find((c) => c.id === id)?.label ?? id}`, ok: true };
    }
    case "reset":
      x.resetView?.();
      return { label: "View reset", ok: true };
    case "furnish":
      return furnish(a, x, userText);
    case "design":
      return designFromPlan(a, x, userText);
  }
}

function apartmentFloor(b: Building, preferred: FloorData | null | undefined): FloorData | undefined {
  const ok = (f: FloorData) => (f.zone === "residential" || f.zone === "crown") && !f.amenity;
  if (preferred && preferred.buildingId === b.id && ok(preferred)) return preferred;
  return b.floors.find(ok);
}

function furnish(a: Extract<AssistantAction, { type: "furnish" }>, x: NonNullable<AssistantRegistration["explorer"]>, userText: string): ActionResult {
  const site = x.site ?? [];
  const b = resolveBuilding(site, x.building, a.floor ?? 1, a.building, userText);
  if (!b?.floors?.length) return { label: "No floors to furnish", ok: false };
  const name = b.short ?? b.name;
  if (a.reset) {
    x.resetFloorFits?.(b.id);
    return { label: `Cleared the apartment floors · ${name}`, ok: true };
  }
  if (a.vary) {
    x.varyFloorFits?.(b.id);
    const first = apartmentFloor(b, null);
    if (first) x.selectFloor?.(first);
    return { label: `Each apartment floor has its own room plan · ${name}`, ok: true };
  }
  // Small models copy floor numbers from the prompt's examples: keep the open floor unless the user named one.
  const floorNum = a.floor != null && (!x.selectedFloor || new RegExp(`\\b${Math.round(a.floor)}\\b`).test(userText)) ? a.floor : undefined;
  const explicit = floorNum != null ? b.floors[Math.min(Math.max(1, Math.round(floorNum)), b.floors.length) - 1] : undefined;
  const floor = apartmentFloor(b, explicit ?? (x.selectedFloor?.buildingId === b.id ? x.selectedFloor : null));
  if (!floor) return { label: `${name} has no apartment floors to rearrange`, ok: false };
  if (explicit && explicit !== floor) {
    return { label: `Level ${explicit.number} is not an apartment — room plans apply to residences and the penthouse`, ok: false };
  }
  const cur = x.floorFitOf?.(b.id, floor.index) ?? DEFAULT_FIT;
  let scheme = cur.scheme;
  let furniture = cur.furniture;
  // A layout or set the user named outright beats the model's guess.
  const said = intentFromText(userText);
  if (said?.type === "furnish") {
    if (said.scheme && said.scheme !== "next") a = { ...a, scheme: said.scheme };
    if (said.set && said.set !== "standard") a = { ...a, set: said.set };
  }
  if (a.scheme) {
    const next = resolveScheme(a.scheme);
    if (!next) return { label: `Unknown room plan “${a.scheme}”. Try ${APARTMENT_SCHEMES.join(", ")}`, ok: false };
    scheme = next === "next" ? nextScheme(cur.scheme) : next;
  }
  if (a.set) {
    const next = resolveFurniture(a.set);
    if (!next) return { label: `Unknown furniture “${a.set}”. Try ${FURNITURE_SETS.join(", ")}`, ok: false };
    furniture = next === "next" ? nextFurniture(cur.furniture) : next;
  }
  // Small models often drop `set=` when asked to "add furniture" alongside a layout change.
  if (!a.set && furniture === "none" && /\b(furnish|furniture|furnished|stage|staging|sofa|bed|table)\b/i.test(userText)) furniture = "standard";
  if (!a.scheme && !a.set && furniture === cur.furniture) scheme = nextScheme(cur.scheme);
  x.selectFloor?.(floor);
  x.setFloorFit?.(b.id, floor.index, { scheme, furniture });
  return { label: `Floor ${floor.number} · ${SCHEME_COPY[scheme].label} · ${FURNITURE_COPY[furniture].label}`, ok: true };
}

/** Open an apartment floor that was designed from the project's imported plan. */
function designFromPlan(a: Extract<AssistantAction, { type: "design" }>, x: NonNullable<AssistantRegistration["explorer"]>, userText: string): ActionResult {
  const site = x.site ?? [];
  const b = resolveBuilding(site, x.building, a.floor ?? 1, a.building, userText);
  if (!b?.floors?.length) return { label: "No building to design", ok: false };
  const plan = x.floorPlanFor?.(b.id);
  if (!plan) return { label: `A floor plan import is required before ${b.short ?? b.name} can be designed`, ok: false };
  const explicit = a.floor != null ? b.floors[Math.min(Math.max(1, Math.round(a.floor)), b.floors.length) - 1] : undefined;
  const floor = apartmentFloor(b, explicit ?? (x.selectedFloor?.buildingId === b.id ? x.selectedFloor : null));
  if (!floor) return { label: `${b.short ?? b.name} has no apartment floors to design`, ok: false };
  x.setExplosion?.(Math.max(x.explosion ?? 0, 1));
  x.selectFloor?.(floor);
  const names = plan.result.scene.rooms.map((r) => r.name).slice(0, 6).join(", ");
  return { label: `Floor ${floor.number} designed from ${plan.fileName}${names ? ` · ${names}` : ""}`, ok: true };
}
