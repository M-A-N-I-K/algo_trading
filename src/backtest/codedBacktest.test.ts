import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 17, 12);

// An MT5 bar export: `n` hourly bars ending at the last closed hour, in
// server time (Athens, UTC+2 in November).
function h1File(n: number) {
  const pad = (x: number) => String(x).padStart(2, "0");
  const rows = ["<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>"];
  for (let i = n; i >= 1; i--) {
    const d = new Date(NOW - i * HOUR + 2 * HOUR);
    const p = 100 + Math.sin(i / 5) * 5;
    rows.push(`${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}\t${pad(d.getUTCHours())}:00:00\t${p}\t${p + 1}\t${p - 1}\t${p + 0.5}\t10\t0\t5`);
  }
  return rows.join("\n");
}

async function load(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "feed-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  vi.resetModules();
  vi.stubEnv("MT5_FEED_DIR", dir);
  const web = vi.fn(async (_s: string, _i: string, n: number) =>
    Array.from({ length: n }, (_, k) => {
      const t = NOW - (n - k) * HOUR;
      return [t, "1", "2", "0.5", "1.5", "0", t + HOUR - 1];
    }),
  );
  vi.doMock("./fetchHistory", async (orig) => ({ ...(await orig<object>()), fetchCandlestickHistory: web }));
  const { loadCodedStrategy } = await import("./codedBacktest");
  return { loadCodedStrategy, web };
}

describe("loadCodedStrategy candle source", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("./fetchHistory");
  });

  it("uses the MT5 bar file when it carries the market, capped at what it holds", async () => {
    const { loadCodedStrategy, web } = await load({ "XAUUSD_H1.csv": h1File(300) });
    const loaded = await loadCodedStrategy("ema833-zones", "XAUUSDT", "1h", 1000, { preferMt5: true, now: NOW });
    expect(loaded?.data).toMatchObject({ source: "MT5", requested: 1000, candles: 300 });
    expect(loaded?.data.to).toBe(NOW - HOUR);
    expect(web).not.toHaveBeenCalled();
  });

  it("builds 4h from the H1 file", async () => {
    const { loadCodedStrategy } = await load({ "XAUUSD_H1.csv": h1File(400) });
    const loaded = await loadCodedStrategy("smc", "XAUUSDT", "4h", 50, { preferMt5: true, now: NOW });
    expect(loaded?.data).toMatchObject({ source: "MT5", candles: 50 });
    expect(loaded!.candles[1].openTime - loaded!.candles[0].openTime).toBe(4 * HOUR);
  });

  it("falls back to the web for a market or timeframe the files don't carry", async () => {
    const { loadCodedStrategy, web } = await load({ "XAUUSD_H1.csv": h1File(300) });
    expect((await loadCodedStrategy("ema833-zones", "DOGEUSDT", "1h", 200, { preferMt5: true, now: NOW }))?.data.source).toBe("Binance");
    expect((await loadCodedStrategy("ema833-zones", "XAUUSDT", "1d", 200, { preferMt5: true, now: NOW }))?.data.source).toBe("Binance");
    expect((await loadCodedStrategy("ema833-zones", "EURUSD", "1h", 200, { preferMt5: true, now: NOW }))?.data.source).toBe("Yahoo");
    expect(web).toHaveBeenCalledTimes(3);
  });

  it("doesn't mix sources: a missing higher timeframe sends the whole run to the web", async () => {
    // extreme-order-block runs on 15m with a 1h bias; only the H1 file exists.
    const { loadCodedStrategy, web } = await load({ "XAUUSD_H1.csv": h1File(300) });
    const loaded = await loadCodedStrategy("extreme-order-block", "XAUUSDT", "15m", 200, { preferMt5: true, now: NOW });
    expect(loaded?.data.source).toBe("Binance");
    expect(web).toHaveBeenCalledTimes(2);
  });

  it("ignores the files unless asked to", async () => {
    const { loadCodedStrategy } = await load({ "XAUUSD_H1.csv": h1File(300) });
    expect((await loadCodedStrategy("ema833-zones", "XAUUSDT", "1h", 200, { now: NOW }))?.data.source).toBe("Binance");
  });
});
