/**
 * AURA assistant — action protocol.
 * -----------------------------------------------------------------------------
 * The model controls the 3D explorer by emitting commands on their own line:
 *
 *   [[action:photo angle=aerial]]       street | waterfront | aerial | podium | skyline | drone
 *   [[action:floor n=12]]               isolate floor 12 of the active building
 *   [[action:floor n=40 building=pinnacle]]
 *   [[action:building id=spire]]        make another building on the site active
 *   [[action:explode value=1.5]]        0 (closed) … 2.5 (fully exploded)
 *   [[action:xray on=true]]             toggle X-ray
 *   [[action:walk]]                     first-person walk-through of the isolated floor
 *   [[action:city id=miami]]            city backdrop
 *   [[action:reset]]                    back to the default view
 *   [[action:tour]]                     navigate to /tour (cinematic reel)
 *   [[action:furnish scheme=living-out]]  room plan on an apartment floor
 *   [[action:furnish set=lounge]]         furniture set
 *   [[action:furnish vary=true]]          a different plan on every apartment floor
 *   [[action:furnish reset=true]]         empty corner-suite floors
 *
 * Parsing is stream-safe: complete commands are extracted, an unfinished
 * trailing `[[…` is hidden until it closes, and commands are stripped from the
 * text shown to the user. Pure module — no React, no Three.js.
 */

export type AssistantAction =
  | { type: "model"; id: string }
  | { type: "photo"; angle: string }
  | { type: "floor"; n: number; building?: string }
  | { type: "building"; id: string }
  | { type: "explode"; value: number }
  | { type: "xray"; on: boolean }
  | { type: "walk" }
  | { type: "city"; id: string }
  | { type: "reset" }
  | { type: "tour" }
  | { type: "furnish"; scheme?: string; set?: string; floor?: number; building?: string; vary?: boolean; reset?: boolean }
  | { type: "design"; floor?: number; building?: string };

/** Matches one complete command. Tolerates spaces, quotes and `action :` variants. */
const ACTION_RE = /\[\[\s*action\s*:\s*([a-z_-]+)([^\]]*)\]\]/gi;

function parseArgs(raw: string): Record<string, string> {
  const args: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-z_]+)\s*=\s*["']?([^\s"'\]]+)["']?/gi)) args[m[1].toLowerCase()] = m[2];
  return args;
}

/** Turn one matched command into a typed action (null if unknown / malformed). */
export function toAction(verb: string, rawArgs: string): AssistantAction | null {
  const a = parseArgs(rawArgs);
  const v = verb.toLowerCase();
  switch (v) {
    case "model":
      return a.id ? { type: "model", id: a.id.toLowerCase() } : null;
    case "photo":
    case "view":
    case "camera":
      return a.angle || a.id ? { type: "photo", angle: (a.angle ?? a.id).toLowerCase() } : null;
    case "floor":
    case "level": {
      const n = parseInt(a.n ?? a.floor ?? a.level ?? "", 10);
      return Number.isFinite(n) ? { type: "floor", n, building: a.building?.toLowerCase() } : null;
    }
    case "building":
      return a.id ? { type: "building", id: a.id.toLowerCase() } : null;
    case "explode": {
      const value = parseFloat(a.value ?? a.v ?? "1.5");
      return Number.isFinite(value) ? { type: "explode", value } : null;
    }
    case "xray":
      return { type: "xray", on: !/^(false|off|0|no)$/i.test(a.on ?? "true") };
    case "walk":
      return { type: "walk" };
    case "city":
      return a.id || a.city ? { type: "city", id: (a.id ?? a.city).toLowerCase() } : null;
    case "reset":
      return { type: "reset" };
    case "tour":
      return { type: "tour" };
    case "design": {
      const n = parseInt(a.floor ?? a.n ?? a.level ?? "", 10);
      return { type: "design", floor: Number.isFinite(n) ? n : undefined, building: a.building?.toLowerCase() };
    }
    case "furnish":
    case "layout":
    case "rooms":
    case "furniture": {
      const yes = (v: string | undefined) => /^(true|yes|1|floors|all)$/i.test(v ?? "");
      const n = parseInt(a.floor ?? a.n ?? a.level ?? "", 10);
      const scheme = v === "furniture" ? undefined : a.scheme ?? a.plan ?? a.layout ?? (v === "furnish" ? undefined : a.id);
      const set = a.set ?? a.furniture ?? (v === "furniture" ? a.id : undefined);
      const vary = yes(a.vary);
      const reset = /^(true|yes|1)$/i.test(a.reset ?? "");
      if (!scheme && !set && !vary && !reset && !Number.isFinite(n)) {
        return v === "furniture" ? { type: "furnish", set: "next" } : { type: "furnish", scheme: "next" };
      }
      return {
        type: "furnish",
        scheme,
        set,
        floor: Number.isFinite(n) ? n : undefined,
        building: a.building?.toLowerCase(),
        vary,
        reset,
      };
    }
    default:
      return null;
  }
}

const SCHEME_WORDS: [RegExp, string][] = [
  [/living (to|on|toward)s? the (glass|windows?|facade)|living[- ]out/i, "living-out"],
  [/gallery/i, "gallery"],
  [/open studio|studio (layout|plan|apartment|condo|rooms?)|one[- ]bed/i, "studio"],
  [/corner (suites?|layout|plan)/i, "corner"],
];
const SET_WORDS: [RegExp, string][] = [
  [/\b(remove|clear|empty|no|strip|take out)\b.*\bfurniture\b|\bunfurnish/i, "none"],
  [/\blounge\b|\bcasual\b/i, "lounge"],
  [/\bformal\b|\bpiano\b|\bsix[- ]seat/i, "formal"],
  [/\b(add|put|place|stage|furnish|furnished|furniture)\b/i, "standard"],
];

/**
 * What a plain-language request implies for the apartment fit, used when the
 * model replies without a command. Null when the request isn't about rooms or furniture.
 */
export function intentFromText(text: string): AssistantAction | null {
  const t = text.toLowerCase();
  const aboutLayout = /\b(layout|floor ?plan|room plan|rooms|rearrange|reconfigure|redesign|condo|apartment)\b/.test(t);
  const aboutFurniture = /furnish|furniture|\bstage\b|staging/.test(t);
  if (!aboutLayout && !aboutFurniture) return null;
  const scheme = SCHEME_WORDS.find(([re]) => re.test(t))?.[1] ?? (aboutLayout && /\b(change|switch|different|another|new|rearrange|redesign)\b/.test(t) ? "next" : undefined);
  const set = aboutFurniture ? SET_WORDS.find(([re]) => re.test(t))?.[1] : undefined;
  if (/\b(every|each|all) (apartment |condo )?floors?\b|\bvary\b/.test(t)) return { type: "furnish", vary: true };
  if (!scheme && !set) return null;
  const n = parseInt(t.match(/\b(?:floor|level)\s+(\d{1,3})\b/)?.[1] ?? "", 10);
  return { type: "furnish", scheme, set, floor: Number.isFinite(n) ? n : undefined };
}

export interface ParsedStream {
  /** Text to display: commands removed, dangling partial command hidden. */
  text: string;
  /** Every complete, recognised command so far, in order. */
  actions: AssistantAction[];
}

/** Parse the raw (possibly still streaming) model output. */
export function parseAssistantText(raw: string): ParsedStream {
  const actions: AssistantAction[] = [];
  let text = raw.replace(ACTION_RE, (_m, verb: string, args: string) => {
    const action = toAction(verb, args);
    if (action) actions.push(action);
    return "";
  });
  // Hide a command that has started streaming but not closed yet.
  const open = text.lastIndexOf("[[");
  if (open !== -1 && text.indexOf("]]", open) === -1) text = text.slice(0, open);
  // Tidy the blank lines left where commands were.
  text = text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, actions };
}
