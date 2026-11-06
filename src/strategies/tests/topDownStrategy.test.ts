import { describe, expect, it } from "vitest";
import type { OHLC } from "@/indicators/utils";
import { atr } from "@/indicators/atr";
import { detectLookAhead, fromCodedStrategy } from "@/domain/backtesting";
import { createTopDownStrategy, dailyStructure, weeklyBull, type TopDownOptions } from "../topDownStrategy";

const HOUR = 3_600_000;
const FIVE = 300_000;
type Row = [number, number, number, number];
const bars = (rows: Row[], step: number, start = 0): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({ openTime: start + i * step, closeTime: start + (i + 1) * step - 1, open, high, low, close, volume: 1 }));

// 1h: flat around 110, down to a swing low of 100 (bar 14), then up to 120.
const H1: Row[] = [
  ...Array.from({ length: 10 }, (): Row => [110, 111, 109, 110]),
  [110, 110, 107, 107.5], [107.5, 108, 105, 105.5], [105.5, 106, 103, 103.5], [103.5, 104, 101, 101.5],
  [101.5, 102, 100, 101.8],
  ...Array.from({ length: 9 }, (_, i): Row => [102 + 2 * i, 104 + 2 * i, 101 + 2 * i, 103.8 + 2 * i]),
  [118, 120, 117, 118.5], [118.5, 119, 117.5, 118.6],
];
// 5m after the last 1h bar: falls, bounces to a 5m swing high of 114.5,
// dips into the lower half of the 100–120 range (low 108), then closes above 114.5.
const M5: Row[] = [
  [118.5, 119, 118, 118.2], [118, 118.5, 117, 117.2], [117, 118, 116, 116.2], [116, 117.5, 115, 115.5],
  [115.5, 114, 113, 113.2], [113.2, 113.5, 112.5, 113], [113, 113.8, 112.8, 113.5], [113.5, 114.5, 113.2, 113.4],
  [113.4, 113, 111.8, 112], [112, 112, 110.8, 111], [111, 111, 110.2, 110.5], [110.5, 110.6, 109, 109.2],
  [109.2, 109.4, 108.5, 108.8], [108.8, 109, 108, 108.6], [108.6, 109.3, 108.6, 109.2], [109.2, 110.5, 109.1, 110.3],
  [110.3, 111, 110.2, 110.9], [110.9, 115.2, 110.8, 115],
];
const BASE: TopDownOptions = { weeklyBias: false, dailyBias: false, minRr: 0.5 };
const H1_START = 0;
const M5_START = H1.length * HOUR;

function run(h1Rows: Row[], m5Rows: Row[], opts: TopDownOptions) {
  const htfCandles = bars(h1Rows, HOUR, H1_START);
  const candles = bars(m5Rows, FIVE, M5_START);
  const s = createTopDownStrategy({ ...opts, htfCandles });
  const signals = s.generateSignals(candles);
  const targets = s.getTradeTargets!(candles);
  return { signals, targets, htfCandles, candles };
}

const mirror = (rows: Row[]): Row[] => rows.map(([o, h, l, c]) => [220 - o, 220 - l, 220 - h, 220 - c]);

describe("createTopDownStrategy", () => {
  it("buys the 5m break after a pullback into the lower half of the 1h range", () => {
    const { signals, targets, htfCandles } = run(H1, M5, BASE);
    const t = M5.length - 1;
    expect(signals.indexOf("BUY")).toBe(t);
    expect(signals.filter((s) => s !== "HOLD")).toEqual(["BUY"]);
    const a = atr(htfCandles, 14)[H1.length - 1];
    expect(targets[t]!.stopLoss).toBeCloseTo(Math.min(108 - 0.1 * a, 115 - 0.5 * a), 6);
    expect(targets[t]!.takeProfit).toBe(120);
    expect(targets[t]!.partialExits).toBeUndefined(); // no closed weeks: no weekly target, no runner
  });

  it("sells the mirror image", () => {
    const { signals, targets, htfCandles } = run(mirror(H1), mirror(M5), BASE);
    const t = M5.length - 1;
    expect(signals.indexOf("SELL")).toBe(t);
    const a = atr(htfCandles, 14)[H1.length - 1];
    expect(targets[t]!.stopLoss).toBeCloseTo(Math.max(112 + 0.1 * a, 105 + 0.5 * a), 6);
    expect(targets[t]!.takeProfit).toBe(100);
  });

  it("skips the trade when the range high doesn't pay minRr", () => {
    expect(run(H1, M5, { ...BASE, minRr: 3 }).signals.includes("BUY")).toBe(false);
  });

  it("needs the pullback to reach the lower half of the range", () => {
    // Same path, but the dip stops at 110.5: above the 110 midpoint.
    const shallow = M5.map(([o, h, l, c]): Row => [Math.max(o, 110.5), Math.max(h, 110.5), Math.max(l, 110.5), Math.max(c, 110.5)]);
    expect(run(H1, shallow, BASE).signals.includes("BUY")).toBe(false);
  });

  it("drops the range after a 5m close under its low", () => {
    const broke = [...M5.slice(0, 12), [108.8, 109, 99, 99.5] as Row, ...M5.slice(13)];
    expect(run(H1, broke, BASE).signals.includes("BUY")).toBe(false);
  });

  it("takes no trades without a weekly bias", () => {
    // Under a day of data there is no closed week, so no weekly bias.
    expect(run(H1, M5, { ...BASE, weeklyBias: true }).signals.includes("BUY")).toBe(false);
  });

  it("doesn't look ahead", () => {
    const { htfCandles, candles } = run(H1, M5, BASE);
    const source = fromCodedStrategy(createTopDownStrategy({ ...BASE, htfCandles }));
    expect(detectLookAhead(source, candles, { every: 1 }).clean).toBe(true);
  });
});

describe("bias rules", () => {
  it("weekly: bullish only on a green week closing above the prior week's high", () => {
    const weeks = bars([[10, 12, 9, 11], [11, 13, 10, 12.5], [12, 13, 11, 12.9], [12.9, 14, 12.5, 12.6]], 7 * 24 * HOUR);
    expect(weeklyBull(weeks)).toEqual([false, true, false, false]);
  });

  it("daily: up after a close above the last swing high, down after a close below the last swing low", () => {
    const days = bars(
      [[10, 11, 9, 10], [10, 12, 9.5, 11], [11, 15, 10.5, 12], [12, 13, 11, 12], [12, 12.5, 8, 9], [9, 10, 8.5, 9.5], [9.5, 16, 9, 15.5], [15.5, 16, 7, 7.5]],
      24 * HOUR,
    );
    // Swing high 15 (day 2) and swing low 8 (day 4) are confirmed two days later.
    expect(dailyStructure(days)).toEqual([null, null, null, null, null, null, true, false]);
  });
});
