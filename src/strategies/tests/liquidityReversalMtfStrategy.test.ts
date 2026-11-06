import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { detectLookAhead, fromCodedStrategy } from "@/domain/backtesting";
import { createLiquidityReversalMtfStrategy, LiquidityReversalMtfOptions } from "../liquidityReversalMtfStrategy";

type Row = [number, number, number, number];
const HOUR = 3_600_000;
const FIVE = 300_000;
const bars = (rows: Row[], step: number, start = 0): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({
    openTime: start + i * step,
    closeTime: start + (i + 1) * step - 1,
    open,
    high,
    low,
    close,
    volume: 1,
  }));

// The 1h setup from the Liquidity Reversal tests: equal lows at 98 swept to
// 96 (demand 96–99), structure shifts up when bar 12 closes above 102.
// Swing high 110 is the target.
const HTF: Row[] = [
  [100, 101, 99, 100],
  [100, 110, 100, 109],
  [109, 109, 103, 104],
  [104, 105, 100, 101],
  [101, 102, 98, 101.5],
  [101.5, 104, 100, 103],
  [103, 103.5, 99, 99.5],
  [99.5, 100, 98, 99.8],
  [99.8, 102, 99.5, 101.5],
  [101.5, 101.5, 98.5, 99],
  [99, 99.2, 96, 96.5],
  [96.5, 99, 96.2, 98.8],
  [98.8, 103, 98.5, 102.5],
];

// 5m bars from the close of that 1h bar: a 5m swing high at 102 (bar 2),
// a pullback into demand to 98.6 (bar 4), then bar 6 closes above 102: buy.
const LTF: Row[] = [
  [102.5, 103, 102, 102.2],
  [102.2, 101.5, 100.8, 101],
  [101, 102, 100.9, 101.5], // 2: 5m swing high
  [101.5, 100.8, 99.5, 99.8],
  [99.8, 99.5, 98.6, 99.2], // 4: into demand, the pullback low
  [99.2, 100.5, 98.9, 100],
  [100, 102.5, 99.9, 102.3], // 6: closes above 102
];

const BASE: LiquidityReversalMtfOptions = {
  ltfSwingLookback: 1,
  minRr: 1,
  htfOptions: { swingLookback: 1, atrPeriod: 3, stopBufferAtr: 0 },
};
const flip = (rows: Row[]) => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as Row);

function run(htf: Row[], ltf: Row[], options: LiquidityReversalMtfOptions = BASE) {
  const htfCandles = bars(htf, HOUR);
  const candles = bars(ltf, FIVE, htf.length * HOUR);
  const strategy = createLiquidityReversalMtfStrategy({ ...options, htfCandles });
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets!(candles);
  return signals.flatMap((s, t) => (s === "HOLD" ? [] : [{ t, signal: s, ...targets[t] }]));
}

describe("liquidity reversal MTF", () => {
  it("buys the 5m break inside the 1h demand zone, with the 1h stop and target", () => {
    expect(run(HTF, LTF)).toEqual([{ t: 6, signal: "BUY", stopLoss: 96, takeProfit: 110 }]);
  });

  it("sells the mirror image", () => {
    expect(run(flip(HTF), flip(LTF))).toEqual([{ t: 6, signal: "SELL", stopLoss: 104, takeProfit: 90 }]);
  });

  it("waits for the 5m break", () => {
    const noBreak = LTF.map((r, i) => (i === 6 ? ([100, 101.9, 99.9, 101.8] as Row) : r));
    expect(run(HTF, noBreak)).toEqual([]);
  });

  it("needs price to come back into the 1h zone first", () => {
    const noPullback = LTF.map(([o, h, l, c]) => [o + 3, h + 3, l + 3, c + 3] as Row);
    expect(run(HTF, noPullback)).toEqual([]);
  });

  it("drops the zone once a 5m candle closes under the 1h sweep low", () => {
    const broken = LTF.map((r, i) => (i === 4 ? ([99.8, 99.5, 95, 95.5] as Row) : i === 5 ? ([95.5, 100.5, 95.4, 100] as Row) : r));
    expect(run(HTF, broken)).toEqual([]);
  });

  it("does nothing without a 1h setup", () => {
    const noShift = HTF.map((r, i) => (i === 12 ? ([98.8, 101.8, 98.5, 101.5] as Row) : r));
    expect(run(noShift, LTF)).toEqual([]);
  });

  it("skips the trade when no 1h swing pays minRr", () => {
    // Entry 102.3, stop 96: 2R needs 114.9, nothing up there.
    expect(run(HTF, LTF, { ...BASE, minRr: 2 })).toEqual([]);
  });

  it("doesn't look ahead", () => {
    const htfCandles = bars(HTF, HOUR);
    const candles = bars(LTF, FIVE, HTF.length * HOUR);
    const source = fromCodedStrategy(createLiquidityReversalMtfStrategy({ ...BASE, htfCandles }));
    expect(detectLookAhead(source, candles, { every: 1 }).clean).toBe(true);
  });
});
