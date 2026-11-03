import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { Signal, Strategy, TradeTarget } from "@/types/strategy";
import { simulate } from "../simulate";
import { fromCodedStrategy } from "../sources/codedStrategy";
import { detectLookAhead } from "../lookAhead";

const BAR_MS = 15 * 60 * 1000;

function bars(rows: [number, number, number, number][]): OHLC[] {
  return rows.map(([open, high, low, close], i) => ({
    openTime: i * BAR_MS,
    closeTime: (i + 1) * BAR_MS - 1,
    open,
    high,
    low,
    close,
    volume: 1,
  }));
}
const flat = (n: number, p = 100): [number, number, number, number][] => Array.from({ length: n }, () => [p, p + 1, p - 1, p]);

// A coded strategy scripted by bar index.
function coded(signals: Record<number, Signal>, targets?: Record<number, TradeTarget>): Strategy {
  return {
    name: "coded",
    generateSignals: (candles) => candles.map((_, i) => signals[i] ?? "HOLD"),
    getTradeTargets: targets ? (candles) => candles.map((_, i) => targets[i] ?? null) : undefined,
  };
}

const noCosts = { feeRate: 0, initialCapital: 10_000 };

describe("fromCodedStrategy", () => {
  it("uses the strategy's absolute stop and target, filling at the next open", () => {
    const candles = bars([...flat(2), [100, 111, 99, 110], ...flat(1, 110)]);
    const strategy = coded({ 0: "BUY" }, { 0: { stopLoss: 95, takeProfit: 110 } });
    const [rt] = simulate(candles, fromCodedStrategy(strategy), noCosts).roundTrips;
    expect(rt.entryIndex).toBe(1);
    expect(rt.initialStop).toBe(95);
    expect(rt.exitType).toBe("target");
    expect(rt.exitPrice).toBe(110);
  });

  it("only enters when a signal comes with a target", () => {
    const strategy = coded({ 0: "BUY", 2: "BUY" }, { 2: { stopLoss: 95, takeProfit: 110 } });
    const [rt] = simulate(bars(flat(5)), fromCodedStrategy(strategy), noCosts).roundTrips;
    expect(rt.entryIndex).toBe(3);
  });

  it("checks minimum reward-to-risk against the actual fill, not the signal bar's close", () => {
    // Signal close 100 (R:R 2), but bar 1 opens at 103: risk 8, reward 7.
    const candles = bars([[100, 101, 99, 100], [103, 104, 102, 103], ...flat(2, 103)]);
    const strategy = coded({ 0: "BUY" }, { 0: { stopLoss: 95, takeProfit: 110 } });
    const result = simulate(candles, fromCodedStrategy(strategy), { ...noCosts, minRiskReward: 1.5 });
    expect(result.roundTrips).toHaveLength(0);
  });

  it("passes partial exits and trailing stops through", () => {
    const candles = bars([...flat(2), [100, 106, 99, 105], [105, 111, 104, 110], ...flat(1, 110)]);
    const strategy = coded(
      { 0: "BUY" },
      { 0: { stopLoss: 95, takeProfit: 110, partialExits: [{ price: 105, portion: 0.5 }], trailTriggerR: 10, trailDistance: 1 } },
    );
    const [rt] = simulate(candles, fromCodedStrategy(strategy), noCosts).roundTrips;
    expect(rt.legs.map((l) => l.exitType)).toEqual(["partial", "target"]);
  });

  it("stays in the market for target-less strategies: an opposite signal closes and reverses", () => {
    const strategy = coded({ 0: "BUY", 2: "SELL" });
    const trips = simulate(bars(flat(5)), fromCodedStrategy(strategy), noCosts).roundTrips;
    expect(trips.map((rt) => [rt.side, rt.entryIndex, rt.exitType])).toEqual([
      ["LONG", 1, "signal"],
      ["SHORT", 3, "end-of-data"],
    ]);
  });
});

describe("detectLookAhead", () => {
  const candles = bars(Array.from({ length: 60 }, (_, i) => [100 + i, 101 + i, 99 + i, 100 + (i % 7)]));

  it("flags a strategy whose signal at bar t depends on bar t+1", () => {
    const peeking: Strategy = {
      name: "peeking",
      generateSignals: (cs) => cs.map((c, i) => (i + 1 < cs.length && cs[i + 1].close > c.close ? "BUY" : "HOLD")),
    };
    const report = detectLookAhead(fromCodedStrategy(peeking), candles, { from: 10, every: 1 });
    expect(report.clean).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });

  it("passes a strategy that only uses bars up to t", () => {
    const honest: Strategy = {
      name: "honest",
      generateSignals: (cs) => cs.map((c, i) => (i > 0 && c.close > cs[i - 1].close ? "BUY" : "HOLD")),
    };
    expect(detectLookAhead(fromCodedStrategy(honest), candles, { from: 10, every: 1 }).clean).toBe(true);
  });
});
