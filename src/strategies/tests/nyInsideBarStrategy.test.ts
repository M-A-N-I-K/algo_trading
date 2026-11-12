import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { createNyInsideBarStrategy, findNyInsideBarTrades } from "../nyInsideBarStrategy";
import { runCodedBacktest } from "@/backtest/codedBacktest";

const M15 = 15 * 60_000;
// Tue 13 Jan 2026: New York is UTC-5, so 09:30 ET = 14:30 UTC and 16:00 ET = 21:00 UTC.
const OPEN = Date.UTC(2026, 0, 13, 14, 30);

// [open, high, low, close] from 14:00 UTC (two candles before the open).
function day(rows: [number, number, number, number][]): OHLC[] {
  const start = OPEN - 2 * M15;
  return rows.map(([open, high, low, close], i) => ({ openTime: start + i * M15, closeTime: start + (i + 1) * M15 - 1, open, high, low, close, volume: 1 }));
}

const PRE: [number, number, number, number][] = [
  [100, 101, 99, 100],
  [100, 101, 99, 100],
];
const UP_RANGE: [number, number, number, number][] = [
  [100, 102, 99.5, 101.5], // 09:30
  [101.5, 104.5, 101, 104], // 09:45: range green, so longs only
];

describe("ny-inside-bar", () => {
  it("places a buy stop above an inside candle on a green opening range", () => {
    const candles = day([
      ...PRE,
      ...UP_RANGE,
      [104, 108.5, 102, 108], // 10:00 outer candle, body 104–108
      [107, 107.5, 104.5, 105], // 10:15 inside: body 105–107
      // Three candles that break neither side and aren't inside candles themselves.
      [104.6, 106.8, 104.55, 106.5],
      [106.6, 107, 106, 106.8],
      [106.9, 107.2, 106.2, 106.3],
    ]);
    const s = createNyInsideBarStrategy();
    const signals = s.generateSignals(candles);
    const targets = s.getTradeTargets!(candles);
    // Live for the 3 candles after the inside candle, then gone.
    expect(signals.slice(0, 5).every((x) => x === "HOLD")).toBe(true);
    expect(signals.slice(5, 8)).toEqual(["BUY", "BUY", "BUY"]);
    expect(signals[8]).toBe("HOLD");
    expect(targets[5]).toEqual({ stopLoss: 102, takeProfit: 113, entryStop: 107.5, cancelEntryAt: 104.5, exitAt: Date.UTC(2026, 0, 13, 21, 0) });
  });

  it("fills on the break and takes the 1:1 target in the backtest", () => {
    const candles = day([
      ...PRE,
      ...UP_RANGE,
      [104, 108.5, 102, 108],
      [107, 107.5, 104.5, 105],
      [105, 109, 104.8, 108.5], // breaks 107.5
      [108.5, 113.5, 108, 113], // target 113
      [113, 114, 112, 113],
    ]);
    const { trades } = findNyInsideBarTrades(candles);
    expect(trades).toEqual([{ side: "long", insideIdx: 5, fillIdx: 6, entry: 107.5, stop: 102, target: 113, exitIdx: 7 }]);

    const result = runCodedBacktest(candles, createNyInsideBarStrategy(), { feeRate: 0 });
    expect(result.roundTrips).toHaveLength(1);
    const [rt] = result.roundTrips;
    expect(rt.entryIndex).toBe(6);
    expect(rt.entryPrice).toBe(107.5);
    expect(rt.exitType).toBe("target");
    expect(rt.exitPrice).toBeCloseTo(113, 9);
  });

  it("drops the order when price breaks the other side first", () => {
    const candles = day([
      ...PRE,
      ...UP_RANGE,
      [104, 108.5, 102, 108],
      [107, 107.5, 104.5, 105],
      [105, 105.5, 104, 104.2], // breaks the inside candle's low
      [104.2, 108, 104, 107.8], // would have broken the high
      [107.8, 109, 107, 108],
    ]);
    const s = createNyInsideBarStrategy();
    expect(s.generateSignals(candles).slice(6)).toEqual(["HOLD", "HOLD", "HOLD"]);
    expect(runCodedBacktest(candles, createNyInsideBarStrategy(), { feeRate: 0 }).roundTrips).toHaveLength(0);
  });

  it("sells below the inside candle on a red opening range", () => {
    const candles = day([
      ...PRE,
      [100, 100.5, 98, 98.5],
      [98.5, 99, 96, 96.5], // range red: shorts only
      [96.5, 97, 92, 92.5], // outer candle, body 92.5–96.5
      [93, 95, 92.8, 94], // inside: body 93–94
      [94, 94.5, 93.5, 94],
    ]);
    const s = createNyInsideBarStrategy();
    const signals = s.generateSignals(candles);
    expect(signals[5]).toBe("SELL");
    expect(s.getTradeTargets!(candles)[5]).toMatchObject({ entryStop: 92.8, cancelEntryAt: 95, stopLoss: 97 });
  });

  it("drops an order at the 15:00 cutoff, so its own trade list matches the engine", () => {
    // 10:00 to 14:15: bodies that keep growing, so none is an inside candle.
    const grow: [number, number, number, number][] = Array.from({ length: 18 }, (_, k) => [104, 104.5 + k * 0.01, 103.5, 104.2 + k * 0.01]);
    const candles = day([
      ...PRE,
      ...UP_RANGE,
      ...grow,
      [104, 108.5, 102, 108], // 14:30 outer candle
      [107, 107.5, 104.5, 105], // 14:45 inside: the next candle starts at 15:00
      [105, 109, 104.8, 108.5], // 15:00 breaks 107.5, but no order is live
      [108.5, 113.5, 108, 113],
    ]);
    expect(createNyInsideBarStrategy().generateSignals(candles).every((x) => x === "HOLD")).toBe(true);
    expect(findNyInsideBarTrades(candles).trades).toEqual([]);
    expect(runCodedBacktest(candles, createNyInsideBarStrategy(), { feeRate: 0 }).roundTrips).toHaveLength(0);
  });

  it("does nothing before the opening range has closed", () => {
    // An inside candle at 09:45 inside the 09:30 candle: still the range.
    const candles = day([...PRE, [100, 104, 99, 103], [102, 103, 101, 102.5]]);
    expect(createNyInsideBarStrategy().generateSignals(candles).every((x) => x === "HOLD")).toBe(true);
  });
});
