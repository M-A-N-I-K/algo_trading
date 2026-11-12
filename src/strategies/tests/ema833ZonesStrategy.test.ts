import { describe, expect, it } from "vitest";
import type { OHLC } from "../../indicators/utils";
import { runCodedBacktest } from "../../backtest/codedBacktest";
import { createEma833ZonesStrategy, inEma833Session, londonMinute, newYorkMinute } from "../ema833ZonesStrategy";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5, 0); // a Monday in winter

// A steady uptrend with small pullbacks to the 8 EMA, then a strong green candle.
function trend(n: number): OHLC[] {
  const out: OHLC[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    // up, up, a pullback whose wick dips to the 8 EMA, then a big green candle
    const step = [1, 1, -1.5, 2.5][i % 4];
    const open = p, close = p + step;
    const low = Math.min(open, close) - (step < 0 ? 2 : 0.1);
    out.push({ openTime: T0 + i * HOUR, closeTime: T0 + (i + 1) * HOUR - 1, open, close, high: Math.max(open, close) + 0.1, low, volume: 0 });
    p = close;
  }
  return out;
}

describe("8/33 EMA session clock", () => {
  it("knows London and New York summer time", () => {
    expect(londonMinute(Date.UTC(2026, 0, 5, 8))).toBe(8 * 60);
    expect(londonMinute(Date.UTC(2026, 6, 6, 7))).toBe(8 * 60); // BST
    expect(newYorkMinute(Date.UTC(2026, 0, 5, 13))).toBe(8 * 60); // EST
    expect(newYorkMinute(Date.UTC(2026, 6, 6, 12))).toBe(8 * 60); // EDT
  });

  it("takes London or New York hours only", () => {
    expect(inEma833Session(Date.UTC(2026, 0, 5, 9), "both")).toBe(true);
    expect(inEma833Session(Date.UTC(2026, 0, 5, 20), "both")).toBe(true); // 15:00 New York
    expect(inEma833Session(Date.UTC(2026, 0, 5, 23), "both")).toBe(false);
    expect(inEma833Session(Date.UTC(2026, 0, 5, 3), "both")).toBe(false);
    expect(inEma833Session(Date.UTC(2026, 0, 5, 3), "all")).toBe(true);
  });
});

describe("8/33 EMA + swing zones", () => {
  it("only buys in an uptrend, with the stop under the last 5 lows and a stepped trail", () => {
    const candles = trend(400);
    const s = createEma833ZonesStrategy({ session: "all", zones: false, room: false });
    const signals = s.generateSignals(candles);
    const targets = s.getTradeTargets!(candles);
    const buys = signals.flatMap((x, i) => (x === "BUY" ? [i] : []));
    expect(signals).not.toContain("SELL");
    expect(buys.length).toBeGreaterThan(0);
    for (const i of buys) {
      const t = targets[i]!;
      const low5 = Math.min(...candles.slice(i - 4, i + 1).map((c) => c.low));
      expect(t.stopLoss).toBeCloseTo(low5);
      const risk = candles[i].close - t.stopLoss;
      expect(t.takeProfit).toBeCloseTo(candles[i].close + 10 * risk);
      expect(t.trailStepR).toBe(3);
    }
  });

  it("mirrors the rules for shorts", () => {
    const up = trend(400);
    const down = up.map((c) => ({ ...c, open: 1000 - c.open, close: 1000 - c.close, high: 1000 - c.low, low: 1000 - c.high }));
    const opt = { session: "all" as const, zones: false, room: false };
    const a = createEma833ZonesStrategy(opt).generateSignals(up);
    const b = createEma833ZonesStrategy(opt).generateSignals(down);
    expect(b).toEqual(a.map((x) => (x === "BUY" ? "SELL" : x)));
  });

  it("skips signals outside the session", () => {
    const candles = trend(400);
    const signals = createEma833ZonesStrategy({ zones: false, room: false }).generateSignals(candles);
    const all = createEma833ZonesStrategy({ zones: false, room: false, session: "all" }).generateSignals(candles);
    expect(signals).toContain("BUY");
    expect(signals.filter((x) => x !== "HOLD").length).toBeLessThan(all.filter((x) => x !== "HOLD").length);
    signals.forEach((x, i) => {
      if (x !== "HOLD") expect(inEma833Session(candles[i].openTime + HOUR, "both")).toBe(true);
    });
  });
});

describe("stepped trailing stop", () => {
  it("moves the stop to 2R at 3R and exits there on a pullback", () => {
    const bar = (i: number, o: number, h: number, l: number, c: number): OHLC => ({ openTime: i * HOUR, closeTime: (i + 1) * HOUR - 1, open: o, high: h, low: l, close: c, volume: 0 });
    // Enter at 100 (stop 90, risk 10); price reaches 131 (3.1R), then falls to 115.
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 105, 99, 104), bar(2, 104, 131, 103, 130), bar(3, 130, 130, 115, 116), bar(4, 116, 117, 110, 112)];
    const res = runCodedBacktest(candles, {
      name: "stub",
      generateSignals: () => ["BUY", "HOLD", "HOLD", "HOLD", "HOLD"],
      getTradeTargets: () => [{ stopLoss: 90, takeProfit: 200, trailStepR: 3 }, null, null, null, null],
    }, { initialBalance: 10_000, positionSizePercent: 1, maxRiskPercent: 0.02, feeRate: 0 });
    const t = res.roundTrips[0];
    expect(t.exitType).toBe("trailing-stop");
    expect(t.exitPrice).toBe(120);
  });
});
