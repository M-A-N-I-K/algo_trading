import { describe, expect, it } from "vitest";
import { candlesToOhlc } from "@/domain/strategies/marketAdapter";
import { CandleStore, createHistoricalCandleSource, Kline, KlineFetcher } from "../historicalCandles";
import { Candle, Instrument, Timeframe } from "../types";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 1); // 2026-10-01 00:00 UTC

const btc: Instrument = {
  id: "btc",
  symbol: "BTCUSDT",
  exchange: "BINANCE",
  assetType: "CRYPTO",
  currency: "USDT",
  tickSize: 0.01,
  lotSize: 0.00001,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};
const nifty: Instrument = { ...btc, id: "nifty", symbol: "NIFTY", exchange: "NSE", assetType: "INDEX", currency: "INR" };

function memoryStore(initial: Candle[] = []): CandleStore & { rows: Candle[] } {
  const rows = [...initial];
  return {
    rows,
    async find(instrumentId, timeframe, from, to) {
      return rows
        .filter((c) => c.instrumentId === instrumentId && c.timeframe === timeframe)
        .filter((c) => +new Date(c.timestamp) >= +from && +new Date(c.timestamp) <= +to)
        .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
    },
    async save(candles) {
      for (const c of candles) {
        const i = rows.findIndex((r) => r.instrumentId === c.instrumentId && r.timeframe === c.timeframe && r.timestamp === c.timestamp);
        if (i >= 0) rows[i] = c;
        else rows.push(c);
      }
    },
  };
}

// A fake Binance: one hourly kline per hour up to `now`, served in pages.
function fakeBinance(now: number): KlineFetcher & { calls: { startMs: number; endMs: number; limit: number }[] } {
  const calls: { startMs: number; endMs: number; limit: number }[] = [];
  return {
    calls,
    async fetch(_symbol, _interval, startMs, endMs, limit) {
      calls.push({ startMs, endMs, limit });
      const out: Kline[] = [];
      for (let t = Math.ceil(startMs / HOUR) * HOUR; t <= endMs && t <= now && out.length < limit; t += HOUR) {
        const p = 100 + (t - T0) / HOUR;
        out.push({ openTime: t, closeTime: t + HOUR - 1, open: p, high: p + 1, low: p - 1, close: p + 0.5, volume: 10 });
      }
      return out;
    },
  };
}

const hours = (from: number, n: number) => Array.from({ length: n }, (_, i) => new Date(from + i * HOUR).toISOString());

describe("historical candle source", () => {
  const tf: Timeframe = "1h";

  it("fetches a range from Binance on first use, caches it, and marks it as real data", async () => {
    const now = T0 + 100 * HOUR;
    const store = memoryStore();
    const binance = fakeBinance(now);
    const source = createHistoricalCandleSource({ store, fetchers: { BINANCE: binance }, now: () => now });

    const result = await source.getRange(btc, tf, new Date(T0), new Date(T0 + 23 * HOUR));

    expect(result.source).toBe("binance-spot");
    expect(result.candles.map((c) => c.timestamp)).toEqual(hours(T0, 24));
    expect(result.candles.every((c) => !c.isDemo)).toBe(true);
    expect(result.fetched).toBe(24);
    expect(store.rows).toHaveLength(24);
  });

  it("serves a repeated range entirely from the cache", async () => {
    const now = T0 + 100 * HOUR;
    const store = memoryStore();
    const binance = fakeBinance(now);
    const source = createHistoricalCandleSource({ store, fetchers: { BINANCE: binance }, now: () => now });

    await source.getRange(btc, tf, new Date(T0), new Date(T0 + 23 * HOUR));
    const callsAfterFirst = binance.calls.length;
    const again = await source.getRange(btc, tf, new Date(T0), new Date(T0 + 23 * HOUR));

    expect(binance.calls.length).toBe(callsAfterFirst);
    expect(again.fetched).toBe(0);
    expect(again.candles).toHaveLength(24);
  });

  it("fetches only the span that is missing", async () => {
    const now = T0 + 100 * HOUR;
    const store = memoryStore();
    const binance = fakeBinance(now);
    const source = createHistoricalCandleSource({ store, fetchers: { BINANCE: binance }, now: () => now });

    await source.getRange(btc, tf, new Date(T0 + 10 * HOUR), new Date(T0 + 19 * HOUR));
    binance.calls.length = 0;
    const result = await source.getRange(btc, tf, new Date(T0), new Date(T0 + 29 * HOUR));

    expect(result.candles).toHaveLength(30);
    expect(result.fetched).toBe(20);
    expect(binance.calls.map((c) => [c.startMs, c.endMs])).toEqual([
      [T0, T0 + 9 * HOUR],
      [T0 + 20 * HOUR, T0 + 29 * HOUR],
    ]);
  });

  it("pages long spans in requests of at most 1000 candles", async () => {
    const now = T0 + 5000 * HOUR;
    const binance = fakeBinance(now);
    const source = createHistoricalCandleSource({ store: memoryStore(), fetchers: { BINANCE: binance }, now: () => now });

    const result = await source.getRange(btc, tf, new Date(T0), new Date(T0 + 2499 * HOUR));

    expect(result.candles).toHaveLength(2500);
    expect(binance.calls.map((c) => c.limit)).toEqual([1000, 1000, 500]);
  });

  it("never returns or caches the candle that is still forming", async () => {
    const now = T0 + 10 * HOUR + 30 * 60_000; // halfway through the 10:00 candle
    const store = memoryStore();
    const source = createHistoricalCandleSource({ store, fetchers: { BINANCE: fakeBinance(now) }, now: () => now });

    const result = await source.getRange(btc, tf, new Date(T0), new Date(T0 + 20 * HOUR));

    expect(result.candles.map((c) => c.timestamp)).toEqual(hours(T0, 10));
    expect(store.rows).toHaveLength(10);
  });

  it("reads demo instruments from the store without calling Binance", async () => {
    const demo: Candle[] = hours(T0, 3).map((timestamp) => ({
      instrumentId: "nifty",
      timestamp,
      timeframe: tf,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      isDemo: true,
    }));
    const binance = fakeBinance(T0 + 100 * HOUR);
    const source = createHistoricalCandleSource({ store: memoryStore(demo), fetchers: { BINANCE: binance }, now: () => T0 + 100 * HOUR });

    const result = await source.getRange(nifty, tf, new Date(T0), new Date(T0 + 50 * HOUR));

    expect(result.source).toBe("demo");
    expect(result.candles).toHaveLength(3);
    expect(binance.calls).toHaveLength(0);
  });
});

describe("historical candle source: Binance futures", () => {
  // Gold (XAUUSDT) isn't listed on Binance spot, only on USDⓈ-M futures.
  const gold: Instrument = { ...btc, id: "gold", symbol: "XAUUSDT", exchange: "BINANCE_FUTURES", assetType: "FUTURE" };

  it("fetches a futures instrument from the futures market and labels it as futures data", async () => {
    const now = T0 + 48 * HOUR;
    const spot = fakeBinance(now);
    const futures = fakeBinance(now);
    const store = memoryStore();
    const source = createHistoricalCandleSource({ store, fetchers: { BINANCE: spot, BINANCE_FUTURES: futures }, now: () => now });

    const range = await source.getRange(gold, "1h", new Date(T0), new Date(T0 + 23 * HOUR));

    expect(range.source).toBe("binance-futures");
    expect(range.candles).toHaveLength(24);
    expect(range.candles.every((c) => c.instrumentId === "gold" && !c.isDemo)).toBe(true);
    expect(spot.calls).toHaveLength(0);
    expect(futures.calls.length).toBeGreaterThan(0);
  });
});

describe("candlesToOhlc", () => {
  it("gives each candle a close time at the end of its timeframe", () => {
    const [c] = candlesToOhlc([
      { instrumentId: "btc", timestamp: new Date(T0).toISOString(), timeframe: "4h", open: 1, high: 1, low: 1, close: 1, volume: 1, isDemo: false },
    ]);
    expect(c.openTime).toBe(T0);
    expect(c.closeTime).toBe(T0 + 4 * HOUR - 1);
  });
});
