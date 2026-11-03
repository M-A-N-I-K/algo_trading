import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { StrategyDefinition } from "@/domain/strategies/definition";
import { Expression } from "@/domain/strategies/expressions";
import { ConditionGroup } from "@/domain/strategies/conditions";
import { simulate } from "../simulate";
import { fromStrategyDefinition } from "../sources/strategyDefinition";
import { BacktestConfigError } from "../types";

const BAR_MS = 15 * 60 * 1000;
const NINE_AM = 9 * 60 * 60 * 1000;

function fromCloses(closes: number[], startMs = NINE_AM): OHLC[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return {
      openTime: startMs + i * BAR_MS,
      closeTime: startMs + (i + 1) * BAR_MS - 1,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1,
    };
  });
}

const close: Expression = { type: "price", field: "CLOSE" };
const k = (value: number): Expression => ({ type: "constant", value });
const when = (left: Expression, operator: "CROSSES_ABOVE" | "CROSSES_BELOW" | "LESS_THAN" | "GREATER_THAN", right: Expression): ConditionGroup => ({
  type: "group",
  id: "g",
  operator: "AND",
  negate: false,
  conditions: [{ type: "condition", id: "c", negate: false, left, operator, right }],
});

function definition(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    metadata: { name: "Cross 105", description: "", strategyType: "CUSTOM" },
    market: { symbol: "BTCUSDT" },
    timeframe: "15m",
    direction: "LONG_ONLY",
    entry: { long: { conditions: when(close, "CROSSES_ABOVE", k(105)), order: { type: "MARKET" } } },
    exit: {
      stopLoss: { type: "PERCENTAGE", percent: 2 },
      takeProfit: { type: "R_MULTIPLE", multiple: 2 },
    },
    positionSizing: { type: "RISK_PERCENT", percent: 1 },
    risk: {},
    ...overrides,
  };
}

const noCosts = { feeRate: 0, initialCapital: 10_000 };

describe("fromStrategyDefinition", () => {
  it("enters at the next open with stop and target computed from the actual fill, sized by the definition", () => {
    // Bar 2 closes above 105 → fill at bar 3's open (106).
    const candles = fromCloses([100, 100, 106, 107, 111, 111]);
    const result = simulate(candles, fromStrategyDefinition(definition()), noCosts);

    expect(result.strategyName).toBe("Cross 105");
    const [rt] = result.roundTrips;
    expect(rt.entryIndex).toBe(3);
    expect(rt.entryPrice).toBe(106);
    expect(rt.initialStop).toBeCloseTo(103.88, 9);
    expect(rt.exitType).toBe("target");
    expect(rt.exitPrice).toBeCloseTo(106 + 2 * 2.12, 9);
    expect(rt.quantity).toBeCloseTo(100 / 2.12, 9); // 1% of 10 000 over 2.12 risk per unit
  });

  it("closes on the signal exit at the next bar's open", () => {
    const def = definition({
      exit: { signalExit: { type: "SIGNAL", conditions: when(close, "LESS_THAN", k(104)) } },
      positionSizing: { type: "FIXED_QUANTITY", quantity: 1 },
    });
    const candles = fromCloses([100, 100, 106, 107, 103, 102, 102]);
    const [rt] = simulate(candles, fromStrategyDefinition(def), noCosts).roundTrips;
    expect(rt.exitType).toBe("signal");
    expect(rt.exitIndex).toBe(5);
    expect(rt.exitPrice).toBe(103); // bar 5 opens at bar 4's close
  });

  it("closes on the time exit at the first bar opening at or after that time", () => {
    const def = definition({
      entry: { long: { conditions: when(close, "GREATER_THAN", k(0)), order: { type: "MARKET" } } },
      exit: { timeExit: { type: "TIME", time: "10:00" } },
      positionSizing: { type: "FIXED_QUANTITY", quantity: 1 },
    });
    // 09:00, 09:15, ... bar 4 opens at 10:00.
    const candles = fromCloses([100, 100, 100, 100, 100, 100]);
    const [rt] = simulate(candles, fromStrategyDefinition(def), noCosts).roundTrips;
    expect(rt.entryIndex).toBe(1);
    expect(rt.exitType).toBe("time");
    expect(rt.exitIndex).toBe(4);
  });

  it("only takes the sides the definition's direction allows", () => {
    const def = definition({
      direction: "SHORT_ONLY",
      entry: {
        long: { conditions: when(close, "CROSSES_ABOVE", k(105)), order: { type: "MARKET" } },
        short: { conditions: when(close, "CROSSES_BELOW", k(95)), order: { type: "MARKET" } },
      },
    });
    const candles = fromCloses([100, 106, 100, 94, 93, 85, 85]);
    const trips = simulate(candles, fromStrategyDefinition(def), noCosts).roundTrips;
    expect(trips.map((rt) => [rt.side, rt.entryIndex])).toEqual([["SHORT", 4]]);
    expect(trips[0].initialStop).toBeCloseTo(94 * 1.02, 9);
  });

  it("applies the definition's risk guardrails", () => {
    const def = definition({ positionSizing: { type: "RISK_PERCENT", percent: 2 }, risk: { maxRiskPerTradePercent: 1 } });
    const candles = fromCloses([100, 100, 106, 107, 111, 111]);
    const [rt] = simulate(candles, fromStrategyDefinition(def), noCosts).roundTrips;
    expect(rt.quantity).toBeCloseTo(100 / 2.12, 9);
  });

  it("rejects STOP and LIMIT entry orders, which v1 doesn't simulate", () => {
    const def = definition({
      entry: { long: { conditions: when(close, "CROSSES_ABOVE", k(105)), order: { type: "LIMIT", limitPrice: 100 } } },
    });
    expect(() => fromStrategyDefinition(def)).toThrow(BacktestConfigError);
  });
});
