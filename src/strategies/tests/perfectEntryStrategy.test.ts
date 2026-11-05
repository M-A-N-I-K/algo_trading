import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { detectLookAhead, fromCodedStrategy } from "@/domain/backtesting";
import { createPerfectEntryStrategy, PerfectEntryOptions } from "../perfectEntryStrategy";

type Row = [number, number, number, number];
const HOUR = 3_600_000;
const series = (rows: Row[], barMs: number, start = 0): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({
    openTime: start + i * barMs,
    closeTime: start + (i + 1) * barMs - 1,
    open,
    high,
    low,
    close,
    volume: 1,
  }));

// 4h context. Swing high 105 (bar 1). Bar 3 is the last bearish candle at
// the protected low 94. Bar 5 closes above 105: uptrend. The impulse runs
// to 113; the pullback low at bar 7 (104) is an internal low.
const HTF: Row[] = [
  [100, 102, 99, 101],
  [101, 105, 100, 104], // 1: swing high
  [104, 104.5, 97, 98],
  [98, 99, 94, 95], // 3: demand candle, protected low 94
  [95, 101, 94.5, 100],
  [100, 107, 99.5, 106], // 5: break of structure
  [106, 112, 105.5, 111],
  [111, 111.5, 104, 105], // 7: internal low 104
  [105, 113, 104.5, 112], // 8: impulse high 113
  [112, 113, 110, 111],
];

// 1h execution, starting after the 4h candles. Bar 2 is a 1h swing high
// (108.7). Bar 4 sweeps the internal low (103 < 104) and is the last bearish
// candle at the sweep low: zone 103–104.5. Bar 6 closes above 108.7: the
// confirmation. Bar 8 pulls back into the zone and closes back above it.
const LTF: Row[] = [
  [110, 110.5, 108, 108.5],
  [108.5, 108.6, 106, 106.5],
  [106.5, 108.7, 106.2, 108], // 2: 1h swing high
  [108, 108.1, 104.4, 104.5],
  [104.5, 104.8, 103, 103.5], // 4: sweep of the internal low, zone candle
  [103.5, 105, 103.2, 104.8],
  [104.8, 109.5, 104.6, 109.2], // 6: confirmation close
  [109.2, 110, 107.5, 108],
  [108, 108.2, 104.3, 104.8], // 8: into the zone, close back above 104.5
  [104.8, 106, 104.6, 105.5],
];

const BASE: PerfectEntryOptions = { htfSwingLookback: 1, ltfSwingLookback: 1, stopBufferAtr: 0 };
const mirror = (rows: Row[]) => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as Row);

function run(htf: Row[], ltf: Row[], options: PerfectEntryOptions = BASE) {
  const htfCandles = series(htf, 4 * HOUR);
  const candles = series(ltf, HOUR, htf.length * 4 * HOUR);
  const strategy = createPerfectEntryStrategy({ ...options, htfCandles });
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets!(candles);
  return signals.flatMap((s, t) => (s === "HOLD" ? [] : [{ t, signal: s, ...targets[t] }]));
}

describe("perfect entry", () => {
  it("buys the 1h zone after a sweep of the 4h internal low and a 1h shift, stop under the sweep, target the 4h impulse high", () => {
    expect(run(HTF, LTF)).toEqual([{ t: 8, signal: "BUY", stopLoss: 103, takeProfit: 113 }]);
  });

  it("sells the mirror image in a downtrend", () => {
    expect(run(mirror(HTF), mirror(LTF))).toEqual([{ t: 8, signal: "SELL", stopLoss: 97, takeProfit: 87 }]);
  });

  it("skips the trade when the target pays under minRr", () => {
    // Risk 1.8, reward 8.2: 4.6R.
    expect(run(HTF, LTF, { ...BASE, minRr: 5 })).toEqual([]);
  });

  it("does nothing without the confirmation close", () => {
    const noShift = LTF.map((r, i) => (i === 6 ? ([104.8, 108.5, 104.6, 108.4] as Row) : r));
    expect(run(HTF, noShift)).toEqual([]);
  });

  it("cancels the setup when a candle closes below the zone", () => {
    const failed = LTF.map((r, i) => (i === 8 ? ([108, 108.2, 102.5, 102.8] as Row) : r));
    expect(run(HTF, failed)).toEqual([]);
  });

  it("doesn't use future candles", () => {
    const htfCandles = series(HTF, 4 * HOUR);
    const candles = series(LTF, HOUR, HTF.length * 4 * HOUR);
    const source = fromCodedStrategy(createPerfectEntryStrategy({ ...BASE, htfCandles }));
    expect(detectLookAhead(source, candles, { every: 1 }).clean).toBe(true);
  });
});
