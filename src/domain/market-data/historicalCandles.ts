import { Candle, Instrument, Timeframe } from "./types";

// Historical candles for backtests, by date range.
//
// Instruments on a fetchable exchange (Binance spot, Binance USDⓈ-M futures)
// are served from the `candles` table, and any closed candles missing from it
// are fetched from that market first and saved, so a re-run over the same
// range reads identical data and makes no requests. The candle still forming
// is never returned or saved. Every other instrument (the seeded NSE demo
// instruments) is read from the store as is.

export const BINANCE_EXCHANGE = "BINANCE";
// Binance USDⓈ-M perpetual futures: markets not listed on spot, e.g. gold (XAUUSDT).
export const BINANCE_FUTURES_EXCHANGE = "BINANCE_FUTURES";
const PAGE_SIZE = 1000;

export type CandleDataSource = "binance-spot" | "binance-futures" | "demo";

const SOURCE_BY_EXCHANGE: Record<string, CandleDataSource> = {
  [BINANCE_EXCHANGE]: "binance-spot",
  [BINANCE_FUTURES_EXCHANGE]: "binance-futures",
};

// Where an instrument's candles come from, by its exchange.
export function dataSourceFor(exchange: string): CandleDataSource {
  return SOURCE_BY_EXCHANGE[exchange] ?? "demo";
}

export interface Kline {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface KlineFetcher {
  // Klines whose open time is within [startMs, endMs], oldest first, at most `limit`.
  fetch(symbol: string, interval: Timeframe, startMs: number, endMs: number, limit: number): Promise<Kline[]>;
}

export interface CandleStore {
  // Candles whose open time is within [from, to], oldest first.
  find(instrumentId: string, timeframe: Timeframe, from: Date, to: Date): Promise<Candle[]>;
  // Upsert on (instrumentId, timeframe, timestamp).
  save(candles: Candle[]): Promise<void>;
}

export interface CandleRange {
  candles: Candle[];
  source: CandleDataSource;
  fetched: number; // candles fetched from the exchange by this call
}

export interface HistoricalCandleSource {
  getRange(instrument: Instrument, timeframe: Timeframe, from: Date, to: Date): Promise<CandleRange>;
}

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 3_600_000,
  "4h": 4 * 3_600_000,
  "1d": 86_400_000,
};

export function createHistoricalCandleSource(deps: {
  store: CandleStore;
  // One fetcher per exchange (BINANCE, BINANCE_FUTURES). Instruments on any
  // other exchange are read from the store as demo data.
  fetchers: Partial<Record<string, KlineFetcher>>;
  now?: () => number;
}): HistoricalCandleSource {
  const { store, fetchers } = deps;
  const now = deps.now ?? Date.now;

  return {
    async getRange(instrument, timeframe, from, to) {
      const fetcher = fetchers[instrument.exchange];
      const source = dataSourceFor(instrument.exchange);
      if (!fetcher || source === "demo") {
        return { candles: await store.find(instrument.id, timeframe, from, to), source: "demo", fetched: 0 };
      }

      const step = TIMEFRAME_MS[timeframe];
      const first = Math.ceil(from.getTime() / step) * step;
      const lastClosed = Math.floor((now() - step) / step) * step;
      const last = Math.min(Math.floor(to.getTime() / step) * step, lastClosed);
      if (last < first) return { candles: [], source, fetched: 0 };

      const cached = await store.find(instrument.id, timeframe, new Date(first), new Date(last));
      const have = new Set(cached.map((c) => new Date(c.timestamp).getTime()));

      let fetched = 0;
      for (const [spanStart, spanEnd] of missingSpans(first, last, step, have)) {
        let cursor = spanStart;
        while (cursor <= spanEnd) {
          const remaining = Math.floor((spanEnd - cursor) / step) + 1;
          const batch = await fetcher.fetch(instrument.symbol, timeframe, cursor, spanEnd, Math.min(PAGE_SIZE, remaining));
          const closed = batch.filter((k) => k.openTime >= cursor && k.openTime <= spanEnd && k.openTime <= lastClosed);
          if (closed.length === 0) break; // the exchange has nothing (more) for this span
          await store.save(closed.map((k) => toCandle(instrument.id, timeframe, k)));
          fetched += closed.length;
          cursor = closed[closed.length - 1].openTime + step;
        }
      }

      const candles = fetched > 0 ? await store.find(instrument.id, timeframe, new Date(first), new Date(last)) : cached;
      return { candles, source, fetched };
    },
  };
}

// Contiguous [start, end] runs of expected open times that the cache lacks.
function missingSpans(first: number, last: number, step: number, have: Set<number>): [number, number][] {
  const spans: [number, number][] = [];
  let start: number | null = null;
  for (let t = first; t <= last; t += step) {
    if (!have.has(t)) {
      if (start === null) start = t;
    } else if (start !== null) {
      spans.push([start, t - step]);
      start = null;
    }
  }
  if (start !== null) spans.push([start, last]);
  return spans;
}

function toCandle(instrumentId: string, timeframe: Timeframe, k: Kline): Candle {
  return {
    instrumentId,
    timestamp: new Date(k.openTime).toISOString(),
    timeframe,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    isDemo: false,
  };
}
