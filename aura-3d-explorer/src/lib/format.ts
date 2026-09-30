/**
 * Number formatting helpers shared by every financial readout.
 */

/** "$174.0M", "$1.25B", "−$3.2M". Set `compact = false` for "$174,000,000". */
export function fmtMoney(n: number, compact = true): string {
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (!compact) return `${sign}$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

/** "120,000" */
export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");

/** "38.4%" */
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
