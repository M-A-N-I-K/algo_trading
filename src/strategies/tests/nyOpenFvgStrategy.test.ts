import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { detectLookAhead, fromCodedStrategy } from "@/domain/backtesting";
import { createNyOpenFvgStrategy, findNyOpenFvgOrders, NyOpenFvgOptions } from "../nyOpenFvgStrategy";

type Row = [number, number, number, number];
const MIN = 60_000;
const M15 = 15 * MIN;
const bars = (rows: Row[], step: number, start: number): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({
    openTime: start + i * step,
    closeTime: start + (i + 1) * step - 1,
    open,
    high,
    low,
    close,
    volume: 1,
  }));
// Mirror prices around 300 so the same chart reads as a short setup.
const mirror = (rows: Row[]): Row[] => rows.map(([o, h, l, c]) => [300 - o, 300 - l, 300 - h, 300 - c]);

// Tuesday 10 Nov 2026, 14:30 UTC = 09:30 in New York (EST).
const NY_OPEN = Date.UTC(2026, 10, 10, 14, 30);

// 15m: swing low 97, swing high 105, higher low 100, then bar 5 closes at
// 105.5 above 105: uptrend, before the session opens.
const HTF: Row[] = [
  [100, 101, 99, 100],
  [100, 100, 97, 99],
  [99, 105, 101, 104],
  [104, 104, 100, 101],
  [101, 103, 101, 102.5],
  [102.5, 106, 102, 105.5],
  [105.5, 106, 104.5, 105],
  [105, 106, 104.5, 105],
  [105, 106, 104.5, 105],
];
const HTF_START = NY_OPEN - 7 * M15;

// 1m from 09:30: swing high 106, lower high 105.3, push off 104.0 closes
// above 105.3 on bar 7 (change of character), bar 8 leaves a fair value gap
// 104.6–105.0 above bar 6. Entry 104.8 (middle), stop 104.3 (bar 7's low),
// target 104.8 + 3 × 0.5 = 106.3. Bar 10 trades back to 104.8: filled.
const LTF: Row[] = [
  [105, 105.5, 104.8, 105.2],
  [105.2, 106, 105, 105.5],
  [105.0, 105.1, 104.5, 104.7],
  [104.7, 105.3, 104.6, 105.0],
  [105.0, 105.1, 104.2, 104.4],
  [104.4, 104.5, 104.0, 104.3],
  [104.3, 104.6, 104.2, 104.5],
  [104.5, 105.8, 104.3, 105.7],
  [105.7, 106.2, 105.0, 106.0],
  [106.0, 106.1, 105.4, 105.5],
  [105.5, 105.6, 104.7, 104.9],
  [104.9, 106.5, 104.9, 106.4],
  [106.4, 106.5, 106.0, 106.2],
];

const BASE: NyOpenFvgOptions = { htfSwingLookback: 1, ltfSwingLookback: 1 };

describe("NY Open FVG strategy", () => {
  it("buys the pullback to the middle of the gap after a 1m change of character in a 15m uptrend", () => {
    const orders = findNyOpenFvgOrders(bars(LTF, MIN, NY_OPEN), bars(HTF, M15, HTF_START), BASE);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ side: "long", chochIdx: 7, fvgIdx: 8, fillIdx: 10, entry: 104.8, stop: 104.3 });
    expect(orders[0].target).toBeCloseTo(106.3, 10);
  });

  it("emits a BUY with the stop and target on the fill bar", () => {
    const s = createNyOpenFvgStrategy({ ...BASE, htfCandles: bars(HTF, M15, HTF_START) });
    const signals = s.generateSignals(bars(LTF, MIN, NY_OPEN));
    expect(signals.indexOf("BUY")).toBe(10);
    expect(signals.filter((x) => x !== "HOLD")).toHaveLength(1);
    expect(s.getTradeTargets!([])[10]).toMatchObject({ stopLoss: 104.3 });
  });

  it("mirrors to a short in a 15m downtrend", () => {
    const orders = findNyOpenFvgOrders(bars(mirror(LTF), MIN, NY_OPEN), bars(mirror(HTF), M15, HTF_START), BASE);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ side: "short", fillIdx: 10 });
    expect(orders[0].entry).toBeCloseTo(195.2, 10);
    expect(orders[0].stop).toBeCloseTo(195.7, 10);
    expect(orders[0].target).toBeCloseTo(193.7, 10);
  });

  it("ignores the same pattern outside the New York window", () => {
    const later = NY_OPEN + 2 * 60 * MIN; // 11:30 New York, after the 90-minute window
    expect(findNyOpenFvgOrders(bars(LTF, MIN, later), bars(HTF, M15, HTF_START), BASE)).toHaveLength(0);
  });

  it("ignores it on a Saturday", () => {
    const saturday = NY_OPEN + 4 * 86_400_000;
    expect(findNyOpenFvgOrders(bars(LTF, MIN, saturday), bars(HTF, M15, saturday - 7 * M15), BASE)).toHaveLength(0);
  });

  it("needs the 15m trend: no higher low, no trade", () => {
    const noHl = HTF.map((r, i): Row => (i === 3 ? [104, 104, 96, 101] : r)); // the pullback undercuts 97
    expect(findNyOpenFvgOrders(bars(LTF, MIN, NY_OPEN), bars(noHl, M15, HTF_START), BASE)).toHaveLength(0);
  });

  it("cancels when price runs to the target before pulling back", () => {
    const runaway = LTF.map((r, i): Row => (i === 9 ? [106.0, 106.4, 105.4, 105.5] : r)); // tags 106.3 first
    expect(findNyOpenFvgOrders(bars(runaway, MIN, NY_OPEN), bars(HTF, M15, HTF_START), BASE)).toHaveLength(0);
  });

  it("has no look-ahead", () => {
    const source = fromCodedStrategy(createNyOpenFvgStrategy({ ...BASE, htfCandles: bars(HTF, M15, HTF_START) }));
    expect(detectLookAhead(source, bars(LTF, MIN, NY_OPEN), { every: 1 }).clean).toBe(true);
  });
});
