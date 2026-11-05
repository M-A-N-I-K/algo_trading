import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { createLiquiditySweepStrategy, LiquiditySweepOptions } from "../liquiditySweepStrategy";

type Row = [number, number, number, number];
const HOUR = 3_600_000;
const bars = (rows: Row[]): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({ openTime: i * HOUR, closeTime: (i + 1) * HOUR - 1, open, high, low, close, volume: 1 }));

// Swing high 104 (bar 1). A flat consolidation (highs all 100) with equal
// lows at 98.5 (bars 4 and 8) and a deep wick to 95 between them (bar 6):
// the low of the move and the last candle before the impulse, demand zone
// 95–100. Bar 10 closes above 104: uptrend. The impulse tops at 113, then
// bar 13 sweeps the equal lows (98 < 98.5) into the zone and bar 14 closes
// back above 100.
const UPTREND: Row[] = [
  [100, 101, 99, 100.5],
  [100.5, 104, 100, 103.5], // 1: swing high
  [103.5, 103.8, 101, 101.5],
  [101.5, 102, 99, 99.5],
  [99.5, 100, 98.5, 99.8], // 4: equal low
  [99.8, 100, 99.2, 99.6],
  [99.6, 100, 95, 99.4], // 6: demand zone 95–100
  [99.4, 100, 99.1, 99.7],
  [99.7, 100, 98.5, 99.5], // 8: equal low
  [99.5, 100, 99.3, 99.9],
  [99.9, 106, 99.8, 105.5], // 10: break of structure
  [105.5, 113, 105, 111], // 11: impulse high
  [111, 111.5, 102, 102.5],
  [102.5, 103, 98, 98.8], // 13: sweep of the equal lows, into the zone
  [98.8, 101, 98.6, 100.6], // 14: close back above the zone
];

const BASE: LiquiditySweepOptions = { swingLookback: 1, atrPeriod: 3, stopBufferAtr: 0 };
const mirror = (rows: Row[]) => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as Row);

function run(rows: Row[], options: LiquiditySweepOptions = BASE) {
  const candles = bars(rows);
  const strategy = createLiquiditySweepStrategy(options);
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets!(candles);
  return signals.flatMap((s, t) => (s === "HOLD" ? [] : [{ t, signal: s, ...targets[t] }]));
}

describe("liquidity sweep", () => {
  it("buys the close back above demand after a sweep of equal lows, stop under the zone, target the leg's high", () => {
    expect(run(UPTREND)).toEqual([{ t: 14, signal: "BUY", stopLoss: 95, takeProfit: 113 }]);
  });

  it("sells the mirror image in a downtrend", () => {
    expect(run(mirror(UPTREND))).toEqual([{ t: 14, signal: "SELL", stopLoss: 105, takeProfit: 87 }]);
  });

  it("does nothing when the equal lows aren't swept", () => {
    const noSweep = UPTREND.map((r, i) => (i === 13 ? ([102.5, 103, 98.7, 98.8] as Row) : r));
    expect(run(noSweep)).toEqual([]);
  });

  it("skips the trade when the target pays under minRr", () => {
    // Risk 5.6, reward 12.4: 2.2R.
    expect(run(UPTREND, { ...BASE, minRr: 3 })).toEqual([]);
  });
});
