import { PulseMarket } from "./markets";

// The numbers behind the Live Pulse panel, from public market data only:
// a 24h ticker and 1m, 15m and daily candles with taker-buy volume.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const BIAS_THRESHOLD_PCT = 55; // share of the hour's volume one side needs
const QUIET_BELOW = 0.7; // 24h span ÷ average daily range
const EXPANDING_ABOVE = 1.3;
const AVERAGE_DAYS = 14;

export interface PulseKline {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number; // volume from market buy orders
}

export interface PulseInput {
  market: PulseMarket;
  now: number;
  ticker: { last: number; high: number; low: number }; // rolling 24h
  minute: PulseKline[]; // 1m candles covering at least the last 61 minutes
  quarterHour: PulseKline[]; // 15m candles covering the last 24h
  daily: PulseKline[]; // daily candles: the last AVERAGE_DAYS closed days plus today
}

export interface PulseZone {
  low: number;
  high: number;
  distance: number; // from the last price to the zone's nearest edge
}

export type PulseBias = "buyers" | "sellers" | "balanced";
export type VolatilityRegime = "quiet" | "normal" | "expanding";

export interface MarketPulse {
  symbol: string;
  asOf: number;
  last: number;
  change1h: number | null;
  change1hPct: number | null;
  high24h: number;
  low24h: number;
  rangePosPct: number; // 0 = at the 24h low, 100 = at the high
  bullPct: number; // share of the last hour's volume bought at market
  bearPct: number;
  bias: PulseBias;
  supply: PulseZone | null; // the candle that made the 24h high, body top to wick
  demand: PulseZone | null; // the candle that made the 24h low, wick to body bottom
  volatility: {
    span: number; // 24h high − low
    spanPct: number;
    avgDailyRange: number | null;
    ratio: number | null;
    regime: VolatilityRegime | null;
    pips: number | null;
  };
}

export function computePulse(input: PulseInput): MarketPulse {
  const { market, now, ticker } = input;
  const last = ticker.last;

  // Last hour: price change and who was aggressive.
  const hourAgo = input.minute.filter((k) => k.closeTime <= now - HOUR).at(-1);
  const change1h = hourAgo ? last - hourAgo.close : null;
  const lastHour = input.minute.filter((k) => k.openTime >= now - HOUR);
  const volume = sum(lastHour, (k) => k.volume);
  const bought = sum(lastHour, (k) => k.takerBuyVolume);
  const bullPct = volume > 0 ? Math.round((bought / volume) * 100) : 50;
  const bearPct = 100 - bullPct;

  const bias: PulseBias =
    change1h !== null && bullPct >= BIAS_THRESHOLD_PCT && change1h > 0
      ? "buyers"
      : change1h !== null && bearPct >= BIAS_THRESHOLD_PCT && change1h < 0
        ? "sellers"
        : "balanced";

  // 24h range and the candles at its extremes.
  const span = ticker.high - ticker.low;
  const rangePosPct = span > 0 ? ((last - ticker.low) / span) * 100 : 50;
  const day = input.quarterHour.filter((k) => k.openTime > now - DAY);
  const top = day.reduce<PulseKline | null>((a, k) => (!a || k.high > a.high ? k : a), null);
  const bottom = day.reduce<PulseKline | null>((a, k) => (!a || k.low < a.low ? k : a), null);
  const supply = top ? zone(Math.max(top.open, top.close), top.high, last) : null;
  const demand = bottom ? zone(bottom.low, Math.min(bottom.open, bottom.close), last) : null;

  // Volatility: today's 24h span against the recent average daily range.
  const closedDays = input.daily.filter((k) => k.closeTime < now).slice(-AVERAGE_DAYS);
  const avgDailyRange = closedDays.length > 0 ? sum(closedDays, (k) => k.high - k.low) / closedDays.length : null;
  const ratio = avgDailyRange ? span / avgDailyRange : null;
  const regime: VolatilityRegime | null = ratio === null ? null : ratio < QUIET_BELOW ? "quiet" : ratio > EXPANDING_ABOVE ? "expanding" : "normal";

  return {
    symbol: market.symbol,
    asOf: now,
    last,
    change1h,
    change1hPct: change1h !== null && hourAgo && hourAgo.close > 0 ? (change1h / hourAgo.close) * 100 : null,
    high24h: ticker.high,
    low24h: ticker.low,
    rangePosPct,
    bullPct,
    bearPct,
    bias,
    supply,
    demand,
    volatility: {
      span,
      spanPct: last > 0 ? (span / last) * 100 : 0,
      avgDailyRange,
      ratio,
      regime,
      pips: market.pipSize ? span / market.pipSize : null,
    },
  };
}

function zone(low: number, high: number, last: number): PulseZone {
  const distance = last < low ? low - last : last > high ? last - high : 0;
  return { low, high, distance };
}

function sum<T>(rows: T[], f: (row: T) => number): number {
  return rows.reduce((a, r) => a + f(r), 0);
}
