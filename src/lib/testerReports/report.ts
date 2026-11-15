import type { ReportTrade } from "./analyze";

// The "full report" half of a tester report page: the views MT5's own report
// gives (balance and drawdown over time, month-by-month returns, splits by
// direction, exit, weekday and hour, the R distribution, the trade list),
// all in R and in dollars at the home account's risk. Pure and cheap.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const msOf = (t: string) => Date.parse(`${t.replace(" ", "T")}Z`); // server time, treated as UTC
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export interface TimelinePoint {
  t: number; // close time, ms (server time as UTC)
  r: number; // cumulative R after this trade
  ddR: number; // below the running peak, R (≥ 0)
  i: number; // trade number (1-based)
}

/**
 * Cumulative R and drawdown after each trade, thinned to at most `maxPoints`
 * so a 1,900-trade report stays a light SVG. Each kept point is the last trade
 * of its bucket, with the bucket's deepest drawdown, so the worst dip survives.
 */
export function timeline(trades: ReportTrade[], maxPoints = 600): TimelinePoint[] {
  const all: TimelinePoint[] = [];
  let r = 0, peak = 0;
  trades.forEach((t, k) => {
    r += t.r;
    peak = Math.max(peak, r);
    all.push({ t: msOf(t.close), r: round(r, 3), ddR: round(peak - r, 3), i: k + 1 });
  });
  if (all.length <= maxPoints) return all;
  const size = Math.ceil(all.length / maxPoints);
  const out: TimelinePoint[] = [];
  for (let s = 0; s < all.length; s += size) {
    const bucket = all.slice(s, s + size);
    const deepest = bucket.reduce((a, b) => (b.ddR > a.ddR ? b : a));
    const last = bucket[bucket.length - 1];
    // Keep the deepest point too when it isn't the last, so the dip shows on the curve.
    if (deepest !== last) out.push(deepest);
    out.push(last);
  }
  return out;
}

export interface MonthCell {
  r: number;
  trades: number;
}
export interface YearRow {
  year: number;
  months: (MonthCell | null)[]; // Jan … Dec; null = no trade closed that month
  r: number;
  trades: number;
}

/** Net R per calendar month (by close time), one row per year. */
export function monthlyReturns(trades: ReportTrade[]): YearRow[] {
  const rows = new Map<number, YearRow>();
  for (const t of trades) {
    const year = Number(t.close.slice(0, 4)), month = Number(t.close.slice(5, 7)) - 1;
    let row = rows.get(year);
    if (!row) rows.set(year, (row = { year, months: Array(12).fill(null), r: 0, trades: 0 }));
    const cell = (row.months[month] ??= { r: 0, trades: 0 });
    cell.r = round(cell.r + t.r, 3);
    cell.trades++;
    row.r = round(row.r + t.r, 3);
    row.trades++;
  }
  return [...rows.values()].sort((a, b) => a.year - b.year);
}

export interface SplitRow {
  key: string;
  trades: number;
  winPct: number;
  netR: number;
  avgR: number;
  profitFactor: number | null;
}

export function split(trades: ReportTrade[], keyOf: (t: ReportTrade) => string, order?: string[]): SplitRow[] {
  const groups = new Map<string, ReportTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const rows = [...groups].map(([key, ts]): SplitRow => {
    const won = ts.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0);
    const lost = -ts.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0);
    const net = ts.reduce((a, t) => a + t.r, 0);
    return { key, trades: ts.length, winPct: round((ts.filter((t) => t.r > 0).length / ts.length) * 100, 1), netR: round(net), avgR: round(net / ts.length, 3), profitFactor: lost > 0 ? round(won / lost) : null };
  });
  return order ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : rows;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const weekdayOf = (t: ReportTrade) => WEEKDAYS[(new Date(msOf(t.open)).getUTCDay() + 6) % 7];
/** Opening hour in server time, as "08:00". */
export const hourOf = (t: ReportTrade) => `${t.open.slice(11, 13)}:00`;
export const EXIT_LABEL: Record<ReportTrade["exit"], string> = { tp: "Target", sl: "Stop or trailing stop", end: "Test end", other: "Other (trail, time, break-even)" };

export interface HistBin {
  at: number; // the band's centre: a stop at -1.02R and one at -0.98R both count at -1
  from: number;
  to: number;
  count: number;
  open: "below" | "above" | null; // the end bands also hold everything beyond them
}

/** How many trades landed in each R band, `width` wide and centred on multiples of it, from `min` to `max`. */
export function rDistribution(trades: ReportTrade[], width = 0.5, min = -2, max = 5): HistBin[] {
  const bins: HistBin[] = [];
  for (let c = min; c <= max + 1e-9; c += width) bins.push({ at: round(c, 2), from: round(c - width / 2, 2), to: round(c + width / 2, 2), count: 0, open: null });
  bins[0].open = "below";
  bins[bins.length - 1].open = "above";
  for (const t of trades) {
    const k = Math.min(bins.length - 1, Math.max(0, Math.round((t.r - min) / width)));
    bins[k].count++;
  }
  // Trim empty bands at both ends, keeping the one at 0.
  while (bins.length > 1 && bins[0].count === 0 && bins[0].at < 0) bins.shift();
  while (bins.length > 1 && bins[bins.length - 1].count === 0 && bins[bins.length - 1].at > 0) bins.pop();
  return bins;
}

export interface ExtraStats {
  stdevR: number;
  sharpe: number | null; // average R over its standard deviation, per trade
  sqn: number | null; // Van Tharp's system quality number on up to 100 trades
  recoveryFactor: number | null; // net R over the deepest drawdown
  longestDrawdownDays: number; // peak to new peak, calendar days
  longestDrawdownOpen: boolean; // still under water at the end of the report
  profitableMonthsPct: number;
  months: number;
  tradesPerMonth: number;
  avgHoldHoursWin: number | null;
  avgHoldHoursLoss: number | null;
  longPct: number;
}

export function extraStats(trades: ReportTrade[]): ExtraStats {
  const rs = trades.map((t) => t.r);
  const n = rs.length;
  const avg = n ? rs.reduce((a, b) => a + b, 0) / n : 0;
  const stdev = n > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r - avg) ** 2, 0) / (n - 1)) : 0;

  let eq = 0, peak = 0, peakAt = trades.length ? msOf(trades[0].open) : 0, longest = 0, maxDd = 0;
  for (const t of trades) {
    eq += t.r;
    const at = msOf(t.close);
    if (eq >= peak) {
      longest = Math.max(longest, at - peakAt);
      peak = eq;
      peakAt = at;
    }
    maxDd = Math.max(maxDd, peak - eq);
  }
  const end = trades.length ? msOf(trades[trades.length - 1].close) : 0;
  const open = eq < peak;
  if (open) longest = Math.max(longest, end - peakAt);

  const months = monthlyReturns(trades).flatMap((y) => y.months.filter((m): m is MonthCell => m !== null));
  const hold = (ts: ReportTrade[]) => (ts.length ? round(ts.reduce((a, t) => a + (msOf(t.close) - msOf(t.open)), 0) / ts.length / HOUR, 1) : null);
  return {
    stdevR: round(stdev),
    sharpe: stdev > 0 ? round(avg / stdev) : null,
    sqn: stdev > 0 ? round((Math.sqrt(Math.min(n, 100)) * avg) / stdev) : null,
    recoveryFactor: maxDd > 0 ? round(eq / maxDd) : null,
    longestDrawdownDays: Math.round(longest / DAY),
    longestDrawdownOpen: open && end - peakAt >= longest,
    profitableMonthsPct: months.length ? round((months.filter((m) => m.r > 0).length / months.length) * 100, 0) : 0,
    months: months.length,
    tradesPerMonth: months.length ? round(n / months.length, 1) : 0,
    avgHoldHoursWin: hold(trades.filter((t) => t.r > 0)),
    avgHoldHoursLoss: hold(trades.filter((t) => t.r <= 0)),
    longPct: n ? round((trades.filter((t) => t.side === "LONG").length / n) * 100, 0) : 0,
  };
}

export interface FullReport {
  timeline: TimelinePoint[];
  monthly: YearRow[];
  bySide: SplitRow[];
  byExit: SplitRow[];
  byWeekday: SplitRow[];
  byHour: SplitRow[];
  distribution: HistBin[];
  stats: ExtraStats;
}

export function fullReport(trades: ReportTrade[]): FullReport {
  return {
    timeline: timeline(trades),
    monthly: monthlyReturns(trades),
    bySide: split(trades, (t) => (t.side === "LONG" ? "Long" : "Short"), ["Long", "Short"]),
    byExit: split(trades, (t) => EXIT_LABEL[t.exit], Object.values(EXIT_LABEL)).sort((a, b) => b.trades - a.trades),
    byWeekday: split(trades, weekdayOf, WEEKDAYS),
    byHour: split(trades, hourOf).sort((a, b) => a.key.localeCompare(b.key)),
    distribution: rDistribution(trades),
    stats: extraStats(trades),
  };
}

/** Every trade as CSV, with the running total and drawdown in R. */
export function tradesCsv(trades: ReportTrade[]): string {
  let eq = 0, peak = 0;
  const lines = ["trade,open,close,side,r,exit,cumulative_r,drawdown_r"];
  trades.forEach((t, i) => {
    eq += t.r;
    peak = Math.max(peak, eq);
    lines.push([i + 1, t.open, t.close, t.side, t.r, t.exit, round(eq, 3), round(peak - eq, 3)].join(","));
  });
  return lines.join("\n") + "\n";
}
