import type { OHLC } from "@/indicators/utils";
import { isForex, priceDecimals } from "@/lib/markets/yahoo";

// The weekly plan: a top-down read of each market, rebuilt from 1h candles
// on every request, so the weekly part rolls over at Monday 00:00 UTC and the
// daily part at 00:00 UTC each day. Pure: candles in, plan out.
//
// What's in it, and why (docs/research/top-down-analysis.md):
// - Where price sits in LAST WEEK's range. Over 2 years, the Signals page
//   strategies' longs below last week's midpoint and shorts above it made
//   PF 2.10 vs 1.44 for the rest, in both halves of the window. That's the
//   A/B grade.
// - Weekly and daily trend, shown as context only. Filtering on them made
//   the same trades worse (weekly trend: PF 1.44 with vs 2.11 against).
// - Daily support and resistance, the daily ATR and today's range so far.

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
const MONDAY_OFFSET = 4 * DAY_MS; // 1 Jan 1970 was a Thursday

// Markets where the location grade ran backwards in the backtest (with:
// AVAX PF 1.18 vs 2.45 against, SOL 0.70 vs 1.21). No grade for them.
// On forex it held on 6 of 7 majors (all pairs: A PF 1.05 vs B 0.72, both
// halves) but ran backwards on USD/CHF (A 0.65 vs B 0.97).
// On the index futures it ran backwards in both halves (A PF 0.69 vs B 0.89
// over 832 trades; Nasdaq 0.63 vs 0.96, S&P 0.76 vs 0.80).
export const GRADE_REVERSED: ReadonlySet<string> = new Set(["AVAXUSDT", "SOLUSDT", "USDCHF", "NAS100", "SPX500"]);

export type Side = "LONG" | "SHORT";
export type Trend = "up" | "down";
export type Grade = "A" | "B";

export interface Range {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CoinPlan {
  symbol: string;
  price: number;
  asOf: number; // close time of the last 1h candle
  weekStart: number; // this week's Monday 00:00 UTC
  lastWeek: Range & { mid: number };
  thisWeek: Range;
  // Where price is in last week's range: 0 = its low, 1 = its high.
  position: number;
  aSide: Side; // the A-grade direction right now
  gradeReversed: boolean;
  yesterday: Range;
  today: Range;
  dayChangePct: number; // vs yesterday's close
  atr: number; // 14-day average true range
  todayRangeOfAtr: number; // today's high − low, as a share of the ATR
  weeklyTrend: Trend; // price vs the 10-week EMA of weekly closes
  weeklyEma: number;
  dailyTrend: Trend; // last daily close vs its 20-day EMA
  dailyEma: number;
  change4wPct: number;
  support: number[]; // nearest first
  resistance: number[]; // nearest first
  insights: string[];
}

export const weekStartOf = (t: number) => Math.floor((t - MONDAY_OFFSET) / WEEK_MS) * WEEK_MS + MONDAY_OFFSET;
export const dayStartOf = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;

// Groups candles into periods (days or weeks) by their open time.
export function aggregate(candles: OHLC[], startOf: (t: number) => number, length: number): OHLC[] {
  const out: OHLC[] = [];
  let cur: OHLC | null = null;
  for (const c of candles) {
    const t = startOf(c.openTime);
    if (!cur || cur.openTime !== t) {
      if (cur) out.push(cur);
      cur = { openTime: t, closeTime: t + length - 1, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : k * v + (1 - k) * out[i - 1]));
  return out;
}

const range = (c: OHLC): Range => ({ open: c.open, high: c.high, low: c.low, close: c.close });

// The A-grade side for a price against last week's range.
export const aSideFor = (price: number, mid: number): Side => (price < mid ? "LONG" : "SHORT");

// The grade of a trade entered at `time`: A when a long is below the
// previous week's midpoint or a short above it, else B. Null when there's
// no complete previous week yet, or for a market where the grade ran backwards.
export function locationGrade(symbol: string, side: Side, price: number, time: number, h1: OHLC[]): Grade | null {
  if (GRADE_REVERSED.has(symbol)) return null;
  const thisWeek = weekStartOf(time);
  const prev = h1.filter((c) => c.openTime >= thisWeek - WEEK_MS && c.openTime < thisWeek);
  // Need most of the week to call it a range (markets that close at weekends still have ~120 bars).
  if (prev.length < 72) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const c of prev) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
  }
  return aSideFor(price, (high + low) / 2) === side ? "A" : "B";
}

// Daily swing highs and lows (2 days either side), over the last `days`.
function dailySwings(days: OHLC[]) {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < days.length - 2; i++) {
    const d = days[i];
    const around = [days[i - 2], days[i - 1], days[i + 1], days[i + 2]];
    if (around.every((x) => d.high > x.high)) highs.push(d.high);
    if (around.every((x) => d.low < x.low)) lows.push(d.low);
  }
  return { highs, lows };
}

// The nearest `n` levels on one side of price, merging ones closer than `gap`.
function nearest(levels: number[], price: number, above: boolean, gap: number, n = 3): number[] {
  const side = levels.filter((l) => (above ? l > price : l < price)).sort((a, b) => (above ? a - b : b - a));
  const out: number[] = [];
  for (const l of side) {
    if (out.length && Math.abs(l - out[out.length - 1]) < gap) continue;
    out.push(l);
    if (out.length === n) break;
  }
  return out;
}

export function fmtPrice(n: number, symbol?: string): string {
  const d = priceDecimals(n, symbol);
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function buildCoinPlan(symbol: string, h1: OHLC[], now: number, fmt: (n: number) => string = (n) => fmtPrice(n, symbol)): CoinPlan | null {
  const candles = h1.filter((c) => c.closeTime < now);
  if (candles.length < 24 * 30) return null;
  const last = candles[candles.length - 1];
  const price = last.close;

  const days = aggregate(candles, dayStartOf, DAY_MS);
  const weeks = aggregate(candles, weekStartOf, WEEK_MS);
  const today = dayStartOf(last.openTime);
  const weekStart = weekStartOf(last.openTime);
  const closedDays = days.filter((d) => d.openTime < today);
  const closedWeeks = weeks.filter((w) => w.openTime < weekStart);
  if (closedDays.length < 21 || closedWeeks.length < 4) return null;

  const todayBar = days[days.length - 1].openTime === today ? days[days.length - 1] : null;
  const thisWeekBar = weeks[weeks.length - 1].openTime === weekStart ? weeks[weeks.length - 1] : null;
  const yesterday = closedDays[closedDays.length - 1];
  const lw = closedWeeks[closedWeeks.length - 1];
  const mid = (lw.high + lw.low) / 2;
  const position = lw.high > lw.low ? (price - lw.low) / (lw.high - lw.low) : 0.5;

  const trs = closedDays.slice(-14).map((d, i, a) => {
    const prevClose = i > 0 ? a[i - 1].close : d.open;
    return Math.max(d.high - d.low, Math.abs(d.high - prevClose), Math.abs(d.low - prevClose));
  });
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length;

  const dEma = ema(closedDays.map((d) => d.close), 20);
  const wEma = ema(closedWeeks.map((w) => w.close), 10);
  const dailyEma = dEma[dEma.length - 1];
  const weeklyEma = wEma[wEma.length - 1];
  const dailyTrend: Trend = yesterday.close > dailyEma ? "up" : "down";
  // Price now against the weekly EMA, so a week that's already broken down
  // doesn't still read "up" until it closes.
  const weeklyTrend: Trend = price > weeklyEma ? "up" : "down";
  const fourAgo = closedWeeks[Math.max(0, closedWeeks.length - 4)];
  const change4wPct = (price / fourAgo.close - 1) * 100;

  const swings = dailySwings(closedDays.slice(-90));
  const pool = [...swings.highs, ...swings.lows, lw.high, lw.low, yesterday.high, yesterday.low];
  const gap = atr * 0.25;
  const resistance = nearest(pool, price, true, gap);
  const support = nearest(pool, price, false, gap);

  const todayRange = todayBar ? todayBar.high - todayBar.low : 0;
  const plan: CoinPlan = {
    symbol,
    price,
    asOf: last.closeTime,
    weekStart,
    lastWeek: { ...range(lw), mid },
    thisWeek: thisWeekBar ? range(thisWeekBar) : { open: price, high: price, low: price, close: price },
    position,
    aSide: aSideFor(price, mid),
    gradeReversed: GRADE_REVERSED.has(symbol),
    yesterday: range(yesterday),
    today: todayBar ? range(todayBar) : { open: price, high: price, low: price, close: price },
    dayChangePct: (price / yesterday.close - 1) * 100,
    atr,
    todayRangeOfAtr: atr > 0 ? todayRange / atr : 0,
    weeklyTrend,
    weeklyEma,
    dailyTrend,
    dailyEma,
    change4wPct,
    support,
    resistance,
    insights: [],
  };
  plan.insights = coinInsights(plan, fmt);
  return plan;
}

// Plain-English reads of one market, most important first.
export function coinInsights(p: CoinPlan, fmt: (n: number) => string): string[] {
  const out: string[] = [];
  const pos = Math.round(p.position * 100);
  // On forex, B-grade trades lost money outright in testing (PF 0.72), so skip them rather than halve them.
  const bSize = isForex(p.symbol) ? "skip" : "half size";
  const lw = p.lastWeek;

  if (p.gradeReversed) {
    out.push(`No A/B grade here: on this market the premium/discount rule ran backwards in the backtest, so take Signals-page trades at normal size either way.`);
  } else if (p.price < lw.low) {
    out.push(`Below last week's low (${fmt(lw.low)}), deep in discount: long signals are A-grade (full size), shorts B-grade (${bSize}).`);
  } else if (p.price > lw.high) {
    out.push(`Above last week's high (${fmt(lw.high)}), deep in premium: short signals are A-grade (full size), longs B-grade (${bSize}).`);
  } else {
    const where = p.aSide === "LONG" ? "discount" : "premium";
    const a = p.aSide === "LONG" ? "Long" : "Short";
    const b = p.aSide === "LONG" ? "shorts" : "longs";
    const nearMid = Math.abs(p.position - 0.5) < 0.1 ? ` It's close to the midpoint (${fmt(lw.mid)}), so the grade can flip quickly.` : "";
    out.push(`At ${pos}% of last week's range, in ${where}: ${a} signals are A-grade (full size), ${b} B-grade (${bSize}).${nearMid}`);
  }

  // Today vs yesterday's range.
  const y = p.yesterday;
  const t = p.today;
  if (t.low < y.low && p.price > y.low) out.push(`Swept yesterday's low (${fmt(y.low)}) today and is back above it: sellers couldn't hold the break.`);
  else if (t.high > y.high && p.price < y.high) out.push(`Swept yesterday's high (${fmt(y.high)}) today and is back below it: buyers couldn't hold the break.`);
  else if (p.price < y.low) out.push(`Trading below yesterday's low (${fmt(y.low)}).`);
  else if (p.price > y.high) out.push(`Trading above yesterday's high (${fmt(y.high)}).`);
  else out.push(`Inside yesterday's range (${fmt(y.low)}–${fmt(y.high)}).`);

  if (p.todayRangeOfAtr >= 0.9) {
    out.push(`Today has already moved ${Math.round(p.todayRangeOfAtr * 100)}% of a normal day's range: late to chase a new move, expect chop.`);
  }

  const trendWord = (tr: Trend) => (tr === "up" ? "up" : "down");
  if (p.weeklyTrend === p.dailyTrend) {
    out.push(`Weekly and daily trends are both ${trendWord(p.weeklyTrend)} (${p.change4wPct >= 0 ? "+" : "−"}${Math.abs(p.change4wPct).toFixed(1)}% in 4 weeks). Context only: in testing, waiting for the trend made these strategies worse.`);
  } else {
    out.push(`Weekly trend ${trendWord(p.weeklyTrend)}, daily ${trendWord(p.dailyTrend)}: the two disagree, so expect two-way trade.`);
  }

  const s = p.support[0];
  const r = p.resistance[0];
  if (s !== undefined && r !== undefined) {
    out.push(`Nearest support ${fmt(s)} (${((1 - s / p.price) * 100).toFixed(1)}% below), resistance ${fmt(r)} (${((r / p.price - 1) * 100).toFixed(1)}% above).`);
  }
  return out;
}

// The market-wide read across every coin, for the top of the page.
export function marketSummary(plans: CoinPlan[], label: (symbol: string) => string): string[] {
  if (!plans.length) return [];
  const out: string[] = [];
  const graded = plans.filter((p) => !p.gradeReversed);
  const longs = graded.filter((p) => p.aSide === "LONG").map((p) => label(p.symbol));
  const shorts = graded.filter((p) => p.aSide === "SHORT").map((p) => label(p.symbol));
  if (longs.length) out.push(`Longs are A-grade on ${longs.join(", ")} (below last week's midpoint).`);
  if (shorts.length) out.push(`Shorts are A-grade on ${shorts.join(", ")} (above last week's midpoint).`);

  const down = plans.filter((p) => p.weeklyTrend === "down" && p.dailyTrend === "down").length;
  const up = plans.filter((p) => p.weeklyTrend === "up" && p.dailyTrend === "up").length;
  if (down >= plans.length * 0.75) {
    out.push(`${down} of ${plans.length} markets are in a weekly and daily downtrend. Trend says down, but in testing location beat trend: favour the A-grade side and don't chase shorts into last week's lows.`);
  } else if (up >= plans.length * 0.75) {
    out.push(`${up} of ${plans.length} markets are in a weekly and daily uptrend. Favour the A-grade side and don't chase longs into last week's highs.`);
  } else {
    out.push(`Trends are mixed (${up} up, ${down} down on both timeframes): no market-wide tide, judge each one alone.`);
  }

  const below = plans.filter((p) => p.price < p.lastWeek.low).map((p) => label(p.symbol));
  const above = plans.filter((p) => p.price > p.lastWeek.high).map((p) => label(p.symbol));
  if (below.length) out.push(`Under last week's low: ${below.join(", ")}.`);
  if (above.length) out.push(`Over last week's high: ${above.join(", ")}.`);
  return out;
}
