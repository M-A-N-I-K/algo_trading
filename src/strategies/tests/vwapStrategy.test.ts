import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { vwap } from "@/indicators/vwap";
import { createVwapStrategy, VwapOptions } from "../vwapStrategy";

type Row = [number, number, number, number];
const M5 = 300_000;
const DAY = 86_400_000;
const bars = (rows: Row[], start = 0): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({ openTime: start + i * M5, closeTime: start + (i + 1) * M5 - 1, open, high, low, close, volume: 1 }));
const mirror = (rows: Row[]) => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as Row);

// Below VWAP for four candles, bar 4 closes above it (the breakout), bar 6
// dips to touch VWAP (99.76) and closes back above it (the retest).
const RETEST: Row[] = [
  [100, 100.5, 99.5, 100],
  [100, 100.2, 98.8, 99],
  [99, 99.2, 98, 98.5],
  [98.5, 99, 98.2, 98.8],
  [98.8, 101, 98.7, 100.8], // 4: breakout
  [100.8, 101.5, 100.2, 101.2],
  [101.2, 101.3, 99.6, 100.9], // 6: retest
];

// A sell-off well below VWAP. Bar 4's low (95.5) is a swing low; bar 7
// wicks under it and closes back above it, with VWAP more than 2R away.
const SWEEP: Row[] = [
  [100, 100.5, 99.5, 100],
  [100, 100.2, 98.8, 99],
  [99, 99.2, 97, 97.5],
  [97.5, 98, 96, 96.5],
  [96.5, 97, 95.5, 96], // 4: swing low
  [96, 96.8, 95.8, 96.4],
  [96.4, 96.6, 95.9, 96.2],
  [96.2, 96.3, 95.2, 95.6], // 7: sweep
];

const BASE: VwapOptions = { sessionWarmupBars: 0, atrPeriod: 3, swingLookback: 1, stopBufferAtr: 0, minStopAtr: 0 };

function run(candles: OHLC[], options: VwapOptions = BASE) {
  const strategy = createVwapStrategy(options);
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets!(candles);
  return signals.flatMap((s, t) => (s === "HOLD" ? [] : [{ t, signal: s, ...targets[t] }]));
}

describe("vwap strategy", () => {
  it("buys the retest of VWAP after a breakout, not the breakout itself: stop under the retest low, target 2R", () => {
    const [hit, ...rest] = run(bars(RETEST), { ...BASE, setups: ["retest"] });
    expect(rest).toEqual([]);
    expect(hit.t).toBe(6);
    expect(hit.signal).toBe("BUY");
    expect(hit.stopLoss).toBe(99.6);
    expect(hit.takeProfit).toBeCloseTo(100.9 + 2 * 1.3);
  });

  it("sells the mirror image", () => {
    const [hit] = run(bars(mirror(RETEST)), { ...BASE, setups: ["retest"] });
    expect(hit.t).toBe(6);
    expect(hit.signal).toBe("SELL");
    expect(hit.stopLoss).toBeCloseTo(100.4);
    expect(hit.takeProfit).toBeCloseTo(99.1 - 2 * 1.3);
  });

  it("cancels the breakout when a candle closes back below VWAP before the retest", () => {
    const failed = RETEST.map((r, i) => (i === 5 ? ([100.8, 100.9, 99, 99.2] as Row) : r));
    expect(run(bars(failed), { ...BASE, setups: ["retest"] }).filter((h) => h.signal === "BUY")).toEqual([]);
  });

  it("forgets a breakout from the previous session", () => {
    // The retest candle opens the next UTC day, where VWAP starts again.
    const candles = bars(RETEST);
    candles[6] = { ...candles[6], openTime: DAY, closeTime: DAY + M5 - 1 };
    expect(run(candles, { ...BASE, setups: ["retest"] })).toEqual([]);
  });

  it("buys a sweep below VWAP with VWAP as the target when it is at least 2R away", () => {
    const candles = bars(SWEEP);
    const target = vwap(candles)[7];
    expect(run(candles, { ...BASE, setups: ["sweep"] })).toEqual([{ t: 7, signal: "BUY", stopLoss: 95.2, takeProfit: target }]);
    // Risk 0.4: VWAP is about 1.7 away, short of 5R.
    expect(run(candles, { ...BASE, setups: ["sweep"], minRr: 5 })).toEqual([]);
  });

  it("buys a sweep above VWAP with a 2R target", () => {
    // Same shape, shifted up so the sweep closes above the session's VWAP.
    const rows = SWEEP.map((r, i) => (i < 2 ? ([90, 90.5, 89.5, 90] as Row) : r));
    const [hit] = run(bars(rows), { ...BASE, setups: ["sweep"] });
    expect(vwap(bars(rows))[7]).toBeLessThan(95.6);
    expect(hit).toEqual({ t: 7, signal: "BUY", stopLoss: 95.2, takeProfit: expect.closeTo(95.6 + 2 * 0.4) });
  });

  it("waits out the session warm-up and respects the per-session cap", () => {
    expect(run(bars(RETEST), { ...BASE, setups: ["retest"], sessionWarmupBars: 7 })).toEqual([]);
    expect(run(bars(SWEEP), { ...BASE, setups: ["sweep"], maxTradesPerSession: 0 })).toEqual([]);
  });

  it("uses only past candles", () => {
    const candles = bars([...RETEST, ...SWEEP.map(([o, h, l, c]) => [o + 5, h + 5, l + 5, c + 5] as Row)]);
    const full = run(candles);
    for (let t = 0; t < candles.length; t++) {
      expect(run(candles.slice(0, t + 1)).filter((h) => h.t === t)).toEqual(full.filter((h) => h.t === t));
    }
  });
});
