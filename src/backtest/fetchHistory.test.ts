import { afterEach, describe, expect, it, vi } from "vitest";

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 17, 12, 0);

// Fake Binance: 1m candles from `listedAt` up to NOW, answering like the real
// klines endpoint (the first `limit` candles opening at or after startTime).
function fakeBinance(listedAt: number, failStarts = new Set<number>()) {
  return vi.fn(async (_s: string, _i: string, startTime?: string, _e?: string, limit = 10) => {
    const from = Math.max(Number(startTime), listedAt);
    if (failStarts.has(Number(startTime))) return undefined;
    const first = Math.ceil(from / MIN) * MIN;
    const out = [];
    for (let t = first; t < NOW && out.length < limit; t += MIN) out.push([t, "1", "1", "1", "1", "0", t + MIN - 1]);
    return out;
  });
}

async function load(binance: ReturnType<typeof fakeBinance>) {
  vi.resetModules();
  vi.doMock("../tools/getCandlesticks", () => ({ getCandleSticks: binance }));
  return (await import("./fetchHistory")).fetchCandlestickHistory;
}

const opens = (c: unknown[][]) => c.map((x) => Number(x[0]));

describe("fetchCandlestickHistory", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../tools/getCandlesticks");
  });

  it("returns a gap-free run of the requested length, fetched in 1000-candle pages", async () => {
    vi.useFakeTimers({ now: NOW });
    const binance = fakeBinance(0);
    const candles = await (await load(binance))("BTCUSDT", "1m", 25_000);
    expect(candles).toHaveLength(25_000);
    expect(binance).toHaveBeenCalledTimes(25);
    const t = opens(candles);
    expect(t.every((x, i) => i === 0 || x - t[i - 1] === MIN)).toBe(true);
    expect(t.at(-1)).toBe(NOW - MIN);
  });

  it("doesn't duplicate bars when the span starts before the market listed", async () => {
    vi.useFakeTimers({ now: NOW });
    const candles = await (await load(fakeBinance(NOW - 2_500 * MIN)))("NEWUSDT", "1m", 10_000);
    expect(candles).toHaveLength(2_500);
    expect(new Set(opens(candles)).size).toBe(2_500);
  });

  it("drops a page that fails twice and everything older, keeping the newest run whole", async () => {
    vi.useFakeTimers({ now: NOW });
    const start = NOW - 5_000 * MIN;
    const binance = fakeBinance(0, new Set([start + 2_000 * MIN]));
    const candles = await (await load(binance))("BTCUSDT", "1m", 5_000);
    expect(candles).toHaveLength(2_000);
    expect(opens(candles)[0]).toBe(start + 3_000 * MIN);
  });
});
