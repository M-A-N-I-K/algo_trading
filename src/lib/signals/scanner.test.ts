import { afterEach, describe, expect, it, vi } from "vitest";
import { playbookExtraTargets, scanTargets } from "./scanner";

describe("scanTargets", () => {
  const targets = scanTargets();

  it("never scans 1m strategies live (too many candles for Binance's rate limit)", () => {
    expect(targets.some((t) => t.interval === "1m")).toBe(false);
    expect(targets.some((t) => t.strategyKey === "ny-open-fvg")).toBe(false);
  });

  it("still scans the 5m and higher-timeframe strategies", () => {
    expect(targets).toContainEqual({ strategyKey: "liquidity-reversal-mtf", interval: "5m" });
    expect(targets).toContainEqual({ strategyKey: "liquidity-reversal", interval: "1h" });
  });

  it("scans a playbook setup's own timeframe on just its market", () => {
    const extras = playbookExtraTargets(targets);
    expect(extras).toContainEqual({ strategyKey: "ema833-zones", symbol: "NAS100", interval: "5m" });
    for (const e of extras) expect(targets).not.toContainEqual({ strategyKey: e.strategyKey, interval: e.interval });
  });
});

describe("loadSeries with the MT5 feed", () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 10, 11, 10, 30);

  // One web candle per market at 07:00 UTC (price 1); the feed has NAS100
  // (NDX100) hourly bars up to 09:00 UTC at price 2xxx.
  async function setup() {
    vi.resetModules();
    const { mkdtempSync, writeFileSync, utimesSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "pbfeed-scan-"));
    const lines = ["<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>"];
    for (let h = 0; h < 10; h++) lines.push(`2026.11.11\t${String(h + 2).padStart(2, "0")}:00:00\t2000\t2010\t1990\t${2000 + h}\t5\t0\t1`);
    writeFileSync(join(dir, "NDX100_H1.csv"), lines.join("\n"));
    writeFileSync(join(dir, "heartbeat.txt"), "");
    vi.stubEnv("MT5_FEED_DIR", dir);
    const web = vi.fn(async () => [[now - 3.5 * HOUR, "1", "1", "1", "1", "0", now - 2.5 * HOUR - 1]]);
    vi.doMock("@/backtest/fetchHistory", async (orig) => ({ ...(await orig<object>()), fetchCandlestickHistory: web }));
    vi.doMock("@/tools/getCandlesticks", () => ({ getCandleSticks: vi.fn(async () => null) }));
    const g = globalThis as { __signalScanner?: unknown; __mt5Feed?: unknown };
    delete g.__signalScanner;
    delete g.__mt5Feed;
    const scanner = await import("./scanner");
    return { scanner, web, beat: (t: number) => utimesSync(join(dir, "heartbeat.txt"), new Date(t), new Date(t)) };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/backtest/fetchHistory");
    vi.doUnmock("@/tools/getCandlesticks");
  });

  it("uses the terminal's candles while the heartbeat is fresh, and the web for the rest", async () => {
    const { scanner, web, beat } = await setup();
    beat(now - 10_000);
    const { series } = await scanner.loadSeries("1h", now);
    const nas = series.get("NAS100")!;
    expect(nas).toHaveLength(10);
    expect(nas[nas.length - 1]).toMatchObject({ openTime: Date.UTC(2026, 10, 11, 9), close: 2009 });
    expect(series.get("EURUSD")![0].close).toBe(1);
    expect(web).not.toHaveBeenCalledWith("NAS100", expect.anything(), expect.anything());
    expect(scanner.candleSources()).toMatchObject({ NAS100: "mt5", EURUSD: "web" });
  });

  it("falls back to a fresh web download (not a top-up) once the feed stops", async () => {
    const { scanner, web, beat } = await setup();
    beat(now - 10_000);
    await scanner.loadSeries("1h", now);
    beat(now - 10 * 60_000);
    const later = now + HOUR;
    const { series } = await scanner.loadSeries("1h", later);
    expect(series.get("NAS100")![0].close).toBe(1);
    expect(web).toHaveBeenCalledWith("NAS100", "1h", expect.any(Number));
    expect(scanner.candleSources().NAS100).toBe("web");
  });
});
