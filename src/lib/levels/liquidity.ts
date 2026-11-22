import type { OHLC } from "@/indicators/utils";
import { aggregate, DAY_MS, dayStartOf, WEEK_MS, weekStartOf } from "@/lib/plan/weeklyPlan";

// Liquidity levels: where stops rest. Above every obvious high sit buy stops
// (shorts' stops and breakout buys), below every obvious low sit sell stops.
// Price is drawn to them and often reverses once they're taken (a sweep).
//
// Weekly: last week's high and low, and weekly swing highs and lows from the
// last two years that price hasn't traded through since.
// Daily: yesterday's high and low, daily swing highs and lows from the last
// six weeks still untaken, and equal highs or lows (two daily swings within
// a tenth of a day's range: a double top or bottom, with more stops behind it).
// Pure: candles in, levels out.

export type LevelSide = "above" | "below";
export type Timeframe = "W" | "D";
export type Proximity = "at" | "near" | "far";

export interface LiquidityLevel {
  id: string; // stable across refreshes, for one alert per level
  price: number;
  side: LevelSide; // above price (buy stops) or below it (sell stops), right now
  timeframe: Timeframe;
  label: string; // "Last week's high", "Equal daily lows"…
  also: string[]; // other levels within a few points, merged into this one
  weight: number; // higher = more stops behind it
  swept: boolean; // traded through since it formed
  distance: number; // from price, in daily ATRs
  proximity: Proximity;
}

export interface LevelSweep {
  level: LiquidityLevel;
  at: number; // when price traded through
  reclaimed: boolean; // and closed back on the other side since
}

export interface MarketLevels {
  symbol: string;
  price: number;
  asOf: number; // close time of the newest candle
  atr: number; // 14-day average true range
  above: LiquidityLevel[]; // nearest first, untaken
  below: LiquidityLevel[]; // nearest first, untaken
  sweeps: LevelSweep[]; // key levels taken in the last SWEEP_FRESH_MS
}

// Within a tenth of a day's range is "at" the level, within 0.3 "near".
export const AT_ATR = 0.1;
export const NEAR_ATR = 0.3;
export const SWEEP_FRESH_MS = 4 * 3_600_000;
const EQUAL_ATR = 0.1;
const MERGE_ATR = 0.08;
const PER_SIDE = 4;

export const proximityOf = (distance: number): Proximity => (distance <= AT_ATR ? "at" : distance <= NEAR_ATR ? "near" : "far");

interface Raw {
  key: string;
  price: number;
  high: boolean; // a high (buy stops above) or a low
  timeframe: Timeframe;
  label: string;
  weight: number;
  from: number; // candles opening at or after this can take it
  always?: boolean; // shown even once swept: last week's and yesterday's extremes
}

// "4 Nov", or "17 Nov 2025" when it's from an earlier year than `ref`.
const fmtDay = (t: number, ref: number) =>
  new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: new Date(t).getUTCFullYear() === new Date(ref).getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  });

// Bars with `n` lower highs (or higher lows) either side.
function swings(bars: OHLC[], n: number) {
  const out: { bar: OHLC; high: boolean }[] = [];
  for (let i = n; i < bars.length - n; i++) {
    const b = bars[i];
    const around = [...bars.slice(i - n, i), ...bars.slice(i + 1, i + 1 + n)];
    if (around.every((x) => b.high > x.high)) out.push({ bar: b, high: true });
    if (around.every((x) => b.low < x.low)) out.push({ bar: b, high: false });
  }
  return out;
}

function rawLevels(weeks: OHLC[], days: OHLC[], atr: number, ref: number): Raw[] {
  const out: Raw[] = [];
  const day = (t: number) => fmtDay(t, ref);
  const lw = weeks[weeks.length - 1];
  const yd = days[days.length - 1];
  if (lw) {
    out.push({ key: `PWH:${lw.openTime}`, price: lw.high, high: true, timeframe: "W", label: "Last week's high", weight: 5, from: lw.openTime + WEEK_MS, always: true });
    out.push({ key: `PWL:${lw.openTime}`, price: lw.low, high: false, timeframe: "W", label: "Last week's low", weight: 5, from: lw.openTime + WEEK_MS, always: true });
  }
  if (yd) {
    out.push({ key: `PDH:${yd.openTime}`, price: yd.high, high: true, timeframe: "D", label: "Yesterday's high", weight: 3, from: yd.openTime + DAY_MS, always: true });
    out.push({ key: `PDL:${yd.openTime}`, price: yd.low, high: false, timeframe: "D", label: "Yesterday's low", weight: 3, from: yd.openTime + DAY_MS, always: true });
  }
  for (const { bar, high } of swings(weeks.slice(-104), 1)) {
    if (bar === lw) continue;
    out.push({
      key: `WS${high ? "H" : "L"}:${bar.openTime}`,
      price: high ? bar.high : bar.low,
      high,
      timeframe: "W",
      label: `Weekly swing ${high ? "high" : "low"} (w/c ${day(bar.openTime)})`,
      weight: 4,
      from: bar.openTime + WEEK_MS,
    });
  }
  const daily = swings(days.slice(-42), 2).filter((s) => s.bar !== yd);
  for (const { bar, high } of daily) {
    out.push({
      key: `DS${high ? "H" : "L"}:${bar.openTime}`,
      price: high ? bar.high : bar.low,
      high,
      timeframe: "D",
      label: `Daily swing ${high ? "high" : "low"} (${day(bar.openTime)})`,
      weight: 2,
      from: bar.openTime + DAY_MS,
    });
  }
  // Equal highs/lows: two daily swings of the same kind within EQUAL_ATR.
  for (const high of [true, false]) {
    const same = daily.filter((s) => s.high === high);
    for (let i = 0; i < same.length; i++)
      for (let j = i + 1; j < same.length; j++) {
        const a = high ? same[i].bar.high : same[i].bar.low;
        const b = high ? same[j].bar.high : same[j].bar.low;
        if (Math.abs(a - b) > atr * EQUAL_ATR) continue;
        out.push({
          key: `EQ${high ? "H" : "L"}:${same[i].bar.openTime}:${same[j].bar.openTime}`,
          price: high ? Math.max(a, b) : Math.min(a, b),
          high,
          timeframe: "D",
          label: `Equal daily ${high ? "highs" : "lows"} (${day(same[i].bar.openTime)}, ${day(same[j].bar.openTime)})`,
          weight: 4,
          from: same[j].bar.openTime + DAY_MS,
        });
      }
  }
  return out;
}

// When price first traded through a level after it formed, if it has.
function sweptAt(r: Raw, candles: OHLC[]): number | null {
  for (const c of candles) {
    if (c.openTime < r.from) continue;
    if (r.high ? c.high > r.price : c.low < r.price) return c.openTime;
  }
  return null;
}

/**
 * The untaken liquidity on each side of price, and the key levels swept in
 * the last few hours. `recent` are finer candles (15m) after the last 1h
 * one, so price and sweeps are fresher than the hour.
 */
export function marketLevels(symbol: string, h1: OHLC[], now: number, recent: OHLC[] = []): MarketLevels | null {
  const closedH1 = h1.filter((c) => c.closeTime < now);
  if (closedH1.length < 24 * 30) return null;
  const lastH1 = closedH1[closedH1.length - 1];
  const candles = [...closedH1, ...recent.filter((c) => c.closeTime < now && c.openTime > lastH1.closeTime)];
  const last = candles[candles.length - 1];
  const price = last.close;

  const today = dayStartOf(last.openTime);
  const thisWeek = weekStartOf(last.openTime);
  const days = aggregate(closedH1, dayStartOf, DAY_MS).filter((d) => d.openTime < today);
  const weeks = aggregate(closedH1, weekStartOf, WEEK_MS).filter((w) => w.openTime < thisWeek);
  if (days.length < 21 || weeks.length < 4) return null;

  const trs = days.slice(-14).map((d, i, a) => {
    const prevClose = i > 0 ? a[i - 1].close : d.open;
    return Math.max(d.high - d.low, Math.abs(d.high - prevClose), Math.abs(d.low - prevClose));
  });
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length;
  if (!(atr > 0)) return null;

  const levels: (LiquidityLevel & { sweptAt: number | null; high: boolean })[] = [];
  for (const r of rawLevels(weeks, days, atr, last.openTime)) {
    const at = sweptAt(r, candles);
    if (at !== null && !r.always) continue;
    const distance = Math.abs(r.price - price) / atr;
    levels.push({
      id: `${symbol}:${r.key}`,
      price: r.price,
      side: r.price >= price ? "above" : "below",
      timeframe: r.timeframe,
      label: r.label,
      also: [],
      weight: r.weight,
      swept: at !== null,
      distance,
      proximity: proximityOf(distance),
      sweptAt: at,
      high: r.high,
    });
  }

  // Levels within MERGE_ATR of each other are one pool: keep the heaviest, name both.
  const pick = (side: LevelSide) => {
    const pool = levels.filter((l) => l.side === side && !l.swept).sort((a, b) => a.distance - b.distance);
    const out: LiquidityLevel[] = [];
    for (const l of pool) {
      const near = out.find((o) => Math.abs(o.price - l.price) <= atr * MERGE_ATR);
      if (near) {
        if (l.weight > near.weight) Object.assign(near, { id: l.id, price: l.price, weight: l.weight, timeframe: l.timeframe, label: l.label, also: [near.label, ...near.also], distance: l.distance, proximity: l.proximity });
        else near.also.push(l.label);
        continue;
      }
      if (out.length === PER_SIDE) break;
      out.push(strip(l));
    }
    return out;
  };

  const sweeps: LevelSweep[] = levels
    .filter((l) => l.sweptAt !== null && now - l.sweptAt <= SWEEP_FRESH_MS)
    .map((l) => ({ level: strip(l), at: l.sweptAt!, reclaimed: l.high ? price < l.price : price > l.price }))
    .sort((a, b) => b.at - a.at);

  return { symbol, price, asOf: last.closeTime, atr, above: pick("above"), below: pick("below"), sweeps };
}

function strip(l: LiquidityLevel & { sweptAt?: number | null; high?: boolean }): LiquidityLevel {
  const { sweptAt: _s, high: _h, ...rest } = l;
  void _s;
  void _h;
  return { ...rest, also: [...rest.also] };
}

export type LevelAlert =
  | { kind: "approach"; id: string; symbol: string; level: LiquidityLevel; price: number }
  | { kind: "sweep"; id: string; symbol: string; level: LiquidityLevel; price: number; reclaimed: boolean; at: number };

/** Levels price is at or near, and fresh sweeps, heaviest and closest first. */
export function levelAlerts(markets: readonly MarketLevels[]): LevelAlert[] {
  const out: LevelAlert[] = [];
  for (const m of markets) {
    for (const level of [...m.above, ...m.below])
      if (level.proximity !== "far") out.push({ kind: "approach", id: `${level.id}:${level.proximity}`, symbol: m.symbol, level, price: m.price });
    for (const s of m.sweeps)
      out.push({ kind: "sweep", id: `${s.level.id}:swept${s.reclaimed ? ":back" : ""}`, symbol: m.symbol, level: s.level, price: m.price, reclaimed: s.reclaimed, at: s.at });
  }
  const rank = (a: LevelAlert) => (a.kind === "sweep" ? 0 : a.level.proximity === "at" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || b.level.weight - a.level.weight || a.level.distance - b.level.distance);
}
