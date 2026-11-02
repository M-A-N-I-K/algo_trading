// Pure journal metrics: everything the dashboard shows is computed here from
// plain trade rows, so it is testable without React and the same rule
// (what a win is, how R is computed, how gross is derived) holds everywhere.
//
// Money vocabulary follows GLOSSARY.md: net = gross − fees + funding, and
// `pnl` on a trade is always net. Manual trades have no grossPnl/funding; for
// them gross is derived as pnl + fees.

export interface JournalTrade {
  id: string;
  time: string | Date; // closed at
  openedAt?: string | Date | null;
  pnl: number; // net
  grossPnl?: number | null;
  fees?: number | null;
  funding?: number | null;
  symbol: string;
  side: "LONG" | "SHORT";
  exitType?: string | null;
  marginCurrency?: string | null;
  initialRiskAmount?: number | null;
  quantity: number;
  entryPrice: number;
}

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

export function grossOf(t: JournalTrade): number {
  return t.grossPnl ?? t.pnl + (t.fees ?? 0) - (t.funding ?? 0);
}

export function rMultipleOf(t: JournalTrade): number | null {
  return t.initialRiskAmount != null && t.initialRiskAmount > 0 ? t.pnl / t.initialRiskAmount : null;
}

export function holdMinutesOf(t: JournalTrade): number | null {
  if (!t.openedAt) return null;
  const minutes = (ms(t.time) - ms(t.openedAt)) / 60_000;
  return minutes >= 0 ? minutes : null;
}

export const isWin = (t: JournalTrade) => t.pnl > 0;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface PnlBreakdown {
  gross: number;
  fees: number; // positive number = cost
  funding: number; // signed
  net: number;
  count: number;
}

export function pnlBreakdown(trades: JournalTrade[]): PnlBreakdown {
  return {
    gross: sum(trades.map(grossOf)),
    fees: sum(trades.map((t) => t.fees ?? 0)),
    funding: sum(trades.map((t) => t.funding ?? 0)),
    net: sum(trades.map((t) => t.pnl)),
    count: trades.length,
  };
}

export function chronological<T extends JournalTrade>(trades: T[]): T[] {
  return [...trades].sort((a, b) => ms(a.time) - ms(b.time));
}

export interface EquityPoint {
  time: number;
  gross: number; // cumulative
  net: number; // cumulative
  drawdown: number; // net minus running peak of net (≤ 0)
}

export function equitySeries(trades: JournalTrade[]): EquityPoint[] {
  let gross = 0;
  let net = 0;
  let peak = 0;
  return chronological(trades).map((t) => {
    gross += grossOf(t);
    net += t.pnl;
    peak = Math.max(peak, net);
    return { time: ms(t.time), gross, net, drawdown: net - peak };
  });
}

export interface Summary {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null; // 0..1
  profitFactor: number | null; // Infinity when there are no losses
  expectancy: number | null; // average net per trade
  avgWin: number | null;
  avgLoss: number | null; // positive
  avgR: number | null;
  rCount: number;
  avgFee: number | null;
  /** Fees as a share of gross profit made by price (only meaningful when gross > 0). */
  feeToGross: number | null;
  /** Average round-trip fee as a % of entry notional — the move needed just to break even. */
  breakevenMovePct: number | null;
  maxDrawdown: number; // ≤ 0
  longestLosingStreak: number;
}

export function summarize(trades: JournalTrade[]): Summary {
  const wins = trades.filter(isWin);
  const losses = trades.filter((t) => !isWin(t));
  const grossProfit = sum(wins.map((t) => t.pnl));
  const grossLoss = -sum(losses.map((t) => t.pnl));
  const rs = trades.map(rMultipleOf).filter((r): r is number => r != null);
  const withFees = trades.filter((t) => t.fees != null);
  const b = pnlBreakdown(trades);

  const notionalShares = withFees
    .filter((t) => t.entryPrice > 0 && t.quantity > 0)
    .map((t) => (t.fees as number) / (t.entryPrice * t.quantity));

  let streak = 0;
  let longest = 0;
  for (const t of chronological(trades)) {
    streak = isWin(t) ? 0 : streak + 1;
    longest = Math.max(longest, streak);
  }

  const series = equitySeries(trades);
  const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : null,
    profitFactor: !trades.length ? null : grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    expectancy: avg(trades.map((t) => t.pnl)),
    avgWin: avg(wins.map((t) => t.pnl)),
    avgLoss: losses.length ? grossLoss / losses.length : null,
    avgR: avg(rs),
    rCount: rs.length,
    avgFee: avg(withFees.map((t) => t.fees as number)),
    feeToGross: b.gross > 0 ? b.fees / b.gross : null,
    breakevenMovePct: notionalShares.length ? (avg(notionalShares) as number) * 100 : null,
    maxDrawdown: Math.min(0, ...series.map((p) => p.drawdown)),
    longestLosingStreak: longest,
  };
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/** R-multiple distribution; outliers are clamped into the end bins. */
export function rHistogram(trades: JournalTrade[], { width = 0.5, min = -3, max = 4 } = {}): HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let from = min; from < max - 1e-9; from += width) bins.push({ from, to: from + width, count: 0 });
  for (const r of trades.map(rMultipleOf)) {
    if (r == null) continue;
    const clamped = Math.min(Math.max(r, min), max - 1e-9);
    bins[Math.floor((clamped - min) / width)].count += 1;
  }
  return bins;
}

export interface HeatCell {
  weekday: number; // 0 = Monday
  hour: number; // 0..23, local time
  net: number;
  count: number;
}

/** Net P&L by the local weekday/hour the trade was opened (falls back to close time). */
export function weekdayHourGrid(trades: JournalTrade[]): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) cells.push({ weekday, hour, net: 0, count: 0 });
  }
  for (const t of trades) {
    const d = new Date(ms(t.openedAt ?? t.time));
    const weekday = (d.getDay() + 6) % 7;
    const cell = cells[weekday * 24 + d.getHours()];
    cell.net += t.pnl;
    cell.count += 1;
  }
  return cells;
}

export interface GroupRow {
  key: string;
  count: number;
  wins: number;
  winRate: number;
  gross: number;
  fees: number;
  funding: number;
  net: number;
}

export function groupBy(trades: JournalTrade[], keyOf: (t: JournalTrade) => string): GroupRow[] {
  const groups = new Map<string, JournalTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups].map(([key, ts]) => {
    const b = pnlBreakdown(ts);
    const wins = ts.filter(isWin).length;
    return { key, count: ts.length, wins, winRate: wins / ts.length, gross: b.gross, fees: b.fees, funding: b.funding, net: b.net };
  });
}
