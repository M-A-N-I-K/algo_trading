import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { createLiquidityReversalStrategy, LiquidityReversalOptions } from "../liquidityReversalStrategy";

type Row = [number, number, number, number];
const HOUR = 3_600_000;
const bars = (rows: Row[]): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({ openTime: i * HOUR, closeTime: (i + 1) * HOUR - 1, open, high, low, close, volume: 1 }));

// Swing high 110 (bar 1) is the liquidity above. Equal lows at 98 (bars 4
// and 7), a lower high at 102 (bar 8). Bar 10 sweeps the lows to 96 (a down
// candle opening at 99: demand 96–99). Bar 12 closes above 102: structure
// shifts up. Bar 14 dips back into demand and closes above 99: buy.
const SETUP: Row[] = [
  [100, 101, 99, 100],
  [100, 110, 100, 109], // 1: swing high, the target
  [109, 109, 103, 104],
  [104, 105, 100, 101],
  [101, 102, 98, 101.5], // 4: equal low
  [101.5, 104, 100, 103],
  [103, 103.5, 99, 99.5],
  [99.5, 100, 98, 99.8], // 7: equal low
  [99.8, 102, 99.5, 101.5], // 8: lower high
  [101.5, 101.5, 98.5, 99],
  [99, 99.2, 96, 96.5], // 10: sweep, demand candle
  [96.5, 99, 96.2, 98.8],
  [98.8, 103, 98.5, 102.5], // 12: close above 102
  [102.5, 103.5, 100, 100.5],
  [100.5, 101, 98.8, 99.5], // 14: back into demand, close above 99
];

const BASE: LiquidityReversalOptions = { swingLookback: 1, atrPeriod: 3, stopBufferAtr: 0 };
const mirror = (rows: Row[]) => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as Row);

function run(rows: Row[], options: LiquidityReversalOptions = BASE) {
  const candles = bars(rows);
  const strategy = createLiquidityReversalStrategy(options);
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets!(candles);
  return signals.flatMap((s, t) => (s === "HOLD" ? [] : [{ t, signal: s, ...targets[t] }]));
}

describe("liquidity reversal", () => {
  it("buys the retest of demand after a sweep of equal lows and a break above the lower high", () => {
    expect(run(SETUP)).toEqual([{ t: 14, signal: "BUY", stopLoss: 96, takeProfit: 110 }]);
  });

  it("sells the mirror image", () => {
    expect(run(mirror(SETUP))).toEqual([{ t: 14, signal: "SELL", stopLoss: 104, takeProfit: 90 }]);
  });

  it("does nothing without a sweep", () => {
    const noSweep = SETUP.map((r, i) =>
      i === 10 ? ([99, 99.2, 98.2, 98.5] as Row) : i === 11 ? ([98.5, 99, 98.3, 98.8] as Row) : r,
    );
    expect(run(noSweep)).toEqual([]);
  });

  it("does nothing until structure breaks", () => {
    const noBreak = SETUP.map((r, i) => (i === 12 ? ([98.8, 101.8, 98.5, 101.5] as Row) : r));
    expect(run(noBreak)).toEqual([]);
  });

  it("skips the trade when no liquidity above pays minRr", () => {
    // Entry 99.5, stop 96: 4R needs 113.5, nothing up there.
    expect(run(SETUP, { ...BASE, minRr: 4 })).toEqual([]);
  });
});
