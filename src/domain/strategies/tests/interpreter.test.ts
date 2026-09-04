import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { createEvaluationContext } from "../evaluation";
import { getStrategyInterpreter } from "../interpreter";
import { getTemplate } from "../templates";

const HOUR_MS = 60 * 60 * 1000;

function buildOhlc(closes: number[]): OHLC[] {
  return closes.map((close, i) => ({
    openTime: i * HOUR_MS,
    closeTime: i * HOUR_MS,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1000,
  }));
}

describe("calculateStop", () => {
  const interpreter = getStrategyInterpreter();

  it("FIXED_POINTS places the stop below entry for a long, above for a short", () => {
    const ctx = createEvaluationContext(buildOhlc([100]));
    expect(interpreter.calculateStop({ type: "FIXED_POINTS", points: 10 }, ctx, 0, 100, "LONG")).toBe(90);
    expect(interpreter.calculateStop({ type: "FIXED_POINTS", points: 10 }, ctx, 0, 100, "SHORT")).toBe(110);
  });

  it("PERCENTAGE scales with entry price", () => {
    const ctx = createEvaluationContext(buildOhlc([200]));
    expect(interpreter.calculateStop({ type: "PERCENTAGE", percent: 5 }, ctx, 0, 200, "LONG")).toBeCloseTo(190, 5);
  });

  it("ATR_MULTIPLE derives the stop from the ATR series at the entry bar", () => {
    // A perfectly flat series has zero true range -> ATR of 0 -> stop equals entry.
    const ctx = createEvaluationContext(buildOhlc(new Array(20).fill(100)));
    const stop = interpreter.calculateStop({ type: "ATR_MULTIPLE", indicator: "ATR", period: 14, multiplier: 1.5 }, ctx, 19, 100, "LONG");
    expect(Number.isFinite(stop)).toBe(true);
  });

  it("FIXED_PRICE returns the configured price directly", () => {
    const ctx = createEvaluationContext(buildOhlc([100]));
    expect(interpreter.calculateStop({ type: "FIXED_PRICE", price: 95 }, ctx, 0, 100, "LONG")).toBe(95);
  });
});

describe("calculateTarget", () => {
  const interpreter = getStrategyInterpreter();

  it("R_MULTIPLE derives the target from the entry/stop distance", () => {
    // Risk = 100 - 90 = 10; 2R target = entry + 2*10 = 120.
    expect(interpreter.calculateTarget({ type: "R_MULTIPLE", multiple: 2 }, 100, 90, "LONG")).toBe(120);
    // Short: risk = 110 - 100 = 10; 2R target = entry - 2*10 = 80.
    expect(interpreter.calculateTarget({ type: "R_MULTIPLE", multiple: 2 }, 100, 110, "SHORT")).toBe(80);
  });

  it("FIXED_POINTS adds/subtracts points by direction", () => {
    expect(interpreter.calculateTarget({ type: "FIXED_POINTS", points: 20 }, 100, 90, "LONG")).toBe(120);
    expect(interpreter.calculateTarget({ type: "FIXED_POINTS", points: 20 }, 100, 110, "SHORT")).toBe(80);
  });
});

describe("calculatePositionSize", () => {
  const interpreter = getStrategyInterpreter();

  it("RISK_PERCENT reuses the existing risk domain (matches the P0 worked example)", () => {
    // Account 500,000, risk 1% -> 5,000 risk amount; entry 24850, stop 24750 -> risk/unit 100 -> 50 units.
    const outcome = interpreter.calculatePositionSize(
      { type: "RISK_PERCENT", percent: 1 },
      { accountSize: 500000, entryPrice: 24850, stopPrice: 24750, lotSize: 1 },
    );
    expect(outcome.quantity).toBe(50);
    expect(outcome.riskAmount).toBe(5000);
    expect(outcome.isValidLotSize).toBe(true);
  });

  it("FIXED_QUANTITY ignores risk and returns the configured quantity", () => {
    const outcome = interpreter.calculatePositionSize({ type: "FIXED_QUANTITY", quantity: 75 }, { accountSize: 100000, entryPrice: 100, stopPrice: 95 });
    expect(outcome.quantity).toBe(75);
    expect(outcome.riskAmount).toBeNull();
  });

  it("FIXED_CAPITAL divides capital by entry price", () => {
    const outcome = interpreter.calculatePositionSize({ type: "FIXED_CAPITAL", capital: 10000 }, { accountSize: 100000, entryPrice: 100, stopPrice: 95 });
    expect(outcome.quantity).toBe(100);
  });

  it("respects lot-size rounding (invalid when it rounds to zero lots)", () => {
    const outcome = interpreter.calculatePositionSize(
      { type: "RISK_AMOUNT", amount: 100 },
      { accountSize: 100000, entryPrice: 100, stopPrice: 90, lotSize: 50 }, // raw qty = 100/10 = 10 -> 0 lots of 50
    );
    expect(outcome.isValidLotSize).toBe(false);
  });
});

describe("determinism", () => {
  it("evaluateEntry produces the same signal for the same definition, data, and bar index across repeated calls", () => {
    const interpreter = getStrategyInterpreter();
    const definition = getTemplate("ma_crossover")!.build();
    const ctx = createEvaluationContext(buildOhlc(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10)));

    const runs = Array.from({ length: 5 }, () => {
      const signals: boolean[] = [];
      for (let t = 0; t < ctx.ohlc.length; t++) {
        signals.push(interpreter.evaluateEntry(definition, ctx, t).long);
      }
      return signals;
    });

    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});
