import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculatePositionSize,
  calculateRiskProfile,
  calculateRiskProfileFromValidated,
  isValidLotQuantity,
} from "../calculations";
import { RiskValidationError, isRiskCalculationFailure, isRiskCalculationSuccess } from "../types";
import { RiskCalculationInput } from "../schemas";

function baseInput(overrides: Partial<RiskCalculationInput> = {}): RiskCalculationInput {
  return {
    account: { accountSize: 500000, riskPerTradePercent: 1 },
    trade: { symbol: "NIFTY", direction: "LONG", entryPrice: 24850, stopLoss: 24750, takeProfit: 25050 },
    instrument: { tickSize: 0.05, lotSize: 1, contractMultiplier: 1 },
    costs: { commissionType: "FLAT", commissionValue: 0, slippageTicks: 0 },
    existingOpenRiskAmount: 0,
    todaysRealizedLoss: 0,
    ...overrides,
  };
}

// Small helpers so each test reads as "compute, then assert" without
// repeating the discriminated-union guard everywhere. See the comment on
// isRiskCalculationSuccess/Failure in ../types.ts for why an explicit type
// predicate is required here (this repo's tsconfig has strict: false).
function assertSuccess(outcome: ReturnType<typeof calculateRiskProfileFromValidated>) {
  if (!isRiskCalculationSuccess(outcome)) {
    throw new Error(`Expected a successful calculation but got errors: ${JSON.stringify((outcome as { errors?: unknown }).errors)}`);
  }
  return outcome.data;
}

function assertFailure(outcome: ReturnType<typeof calculateRiskProfileFromValidated>): RiskValidationError[] {
  if (!isRiskCalculationFailure(outcome)) {
    throw new Error("Expected the calculation to fail, but it succeeded.");
  }
  return outcome.errors;
}

describe("1% risk calculation (spec worked example)", () => {
  it("matches: 500,000 capital, 1% risk -> 5,000 risk amount, 50 units, 1:2 R:R", () => {
    const data = assertSuccess(calculateRiskProfileFromValidated(baseInput()));
    expect(data.riskAmount).toBe(5000);
    expect(data.riskPerUnit).toBe(100);
    expect(data.rewardPerUnit).toBe(200);
    expect(data.riskRewardRatio).toBe(2);
    expect(data.position.quantity).toBe(50);
    expect(data.position.lots).toBe(50);
  });
});

describe("long position", () => {
  it("risk/reward measured in the correct direction", () => {
    const data = assertSuccess(
      calculateRiskProfileFromValidated(
        baseInput({ trade: { symbol: "X", direction: "LONG", entryPrice: 100, stopLoss: 95, takeProfit: 115 } }),
      ),
    );
    expect(data.riskPerUnit).toBe(5);
    expect(data.rewardPerUnit).toBe(15);
    expect(data.riskRewardRatio).toBe(3);
  });
});

describe("short position", () => {
  it("risk/reward measured in the correct (mirrored) direction", () => {
    const data = assertSuccess(
      calculateRiskProfileFromValidated(
        baseInput({ trade: { symbol: "X", direction: "SHORT", entryPrice: 100, stopLoss: 105, takeProfit: 85 } }),
      ),
    );
    expect(data.riskPerUnit).toBe(5);
    expect(data.rewardPerUnit).toBe(15);
    expect(data.riskRewardRatio).toBe(3);
  });
});

describe("R:R calculation", () => {
  it("computes reward/risk and break-even win rate consistently", () => {
    const data = assertSuccess(calculateRiskProfileFromValidated(baseInput()));
    // 1:2 R:R -> break-even win rate = 1 / (1 + 2) = 33.33%
    expect(data.breakEvenWinRatePercent).toBeCloseTo(33.33, 1);
  });
});

describe("position sizing", () => {
  it("floors raw quantity to a whole number of lots", () => {
    const result = calculatePositionSize(new Decimal(5000), new Decimal(100), new Decimal(1));
    expect(result.rawQuantity).toBe(50);
    expect(result.quantity).toBe(50);
    expect(result.isValidLotSize).toBe(true);
  });
});

describe("lot-size rounding (spec example: lot size = 50)", () => {
  it.each([
    [49, false],
    [50, true],
    [100, true],
    [125, false],
  ])("quantity %i -> valid=%s", (qty, expected) => {
    expect(isValidLotQuantity(new Decimal(qty), new Decimal(50))).toBe(expected);
  });

  it("auto-sizing rounds DOWN to the nearest valid lot multiple, never up", () => {
    // riskAmount=12500, riskPerUnit=100 -> raw 125 units, lot size 50 -> floors to 100 (2 lots), not 150.
    const result = calculatePositionSize(new Decimal(12500), new Decimal(100), new Decimal(50));
    expect(result.rawQuantity).toBe(125);
    expect(result.quantity).toBe(100);
    expect(result.lots).toBe(2);
  });

  it("returns invalid when the raw quantity rounds down to zero lots", () => {
    // riskAmount=4900, riskPerUnit=100 -> raw 49 units, lot size 50 -> 0 lots.
    const sizing = calculatePositionSize(new Decimal(4900), new Decimal(100), new Decimal(50));
    expect(sizing.isValidLotSize).toBe(false);
    expect(sizing.lots).toBe(0);
  });

  it("the orchestrator surfaces this as a structured INVALID_POSITION_SIZE error", () => {
    const errors = assertFailure(
      calculateRiskProfileFromValidated(
        baseInput({
          account: { accountSize: 4900, riskPerTradePercent: 100 },
          trade: { symbol: "X", direction: "LONG", entryPrice: 100, stopLoss: 0.01 },
          instrument: { tickSize: 0.05, lotSize: 50, contractMultiplier: 1 },
        }),
      ),
    );
    expect(errors.some((e) => e.code === "INVALID_POSITION_SIZE")).toBe(true);
  });
});

describe("fees (commission)", () => {
  it("FLAT commission is subtracted from potential profit and added to max loss", () => {
    const noFees = assertSuccess(calculateRiskProfileFromValidated(baseInput()));
    const withFees = assertSuccess(
      calculateRiskProfileFromValidated(baseInput({ costs: { commissionType: "FLAT", commissionValue: 100, slippageTicks: 0 } })),
    );
    expect(withFees.commissionCost).toBe(100);
    expect(withFees.potentialProfit).toBe((noFees.potentialProfit as number) - 100);
    expect(withFees.maxLoss).toBe(noFees.maxLoss + 100);
  });

  it("PERCENT commission scales with notional position value", () => {
    const data = assertSuccess(
      calculateRiskProfileFromValidated(baseInput({ costs: { commissionType: "PERCENT", commissionValue: 1, slippageTicks: 0 } })),
    );
    // capitalRequired = 50 units * 24850 = 1,242,500; 1% = 12,425
    expect(data.capitalRequired).toBe(1242500);
    expect(data.commissionCost).toBe(12425);
  });
});

describe("slippage", () => {
  it("applies slippage ticks on both entry and exit (x2)", () => {
    const data = assertSuccess(
      calculateRiskProfileFromValidated(
        baseInput({
          instrument: { tickSize: 0.05, lotSize: 1, contractMultiplier: 1 },
          costs: { commissionType: "FLAT", commissionValue: 0, slippageTicks: 2 },
        }),
      ),
    );
    // 50 units * 0.05 tick * 2 slippage ticks * 2 (entry+exit) = 10
    expect(data.slippageCost).toBe(10);
  });
});

describe("invalid stop", () => {
  it("rejects stop-loss equal to entry price", () => {
    const errors = assertFailure(
      calculateRiskProfileFromValidated(baseInput({ trade: { symbol: "X", direction: "LONG", entryPrice: 100, stopLoss: 100 } })),
    );
    expect(errors.some((e) => e.code === "INVALID_STOP")).toBe(true);
  });

  it("rejects a long stop placed above entry", () => {
    const errors = assertFailure(
      calculateRiskProfileFromValidated(baseInput({ trade: { symbol: "X", direction: "LONG", entryPrice: 100, stopLoss: 105 } })),
    );
    expect(errors.some((e) => e.code === "INVALID_STOP")).toBe(true);
  });

  it("rejects a short stop placed below entry", () => {
    const errors = assertFailure(
      calculateRiskProfileFromValidated(baseInput({ trade: { symbol: "X", direction: "SHORT", entryPrice: 100, stopLoss: 95 } })),
    );
    expect(errors.some((e) => e.code === "INVALID_STOP")).toBe(true);
  });

  it("rejects negative prices without ever producing NaN/Infinity", () => {
    const outcome = calculateRiskProfileFromValidated(
      baseInput({ trade: { symbol: "X", direction: "LONG", entryPrice: -100, stopLoss: 95 } }),
    );
    expect(isRiskCalculationFailure(outcome)).toBe(true);
  });
});

describe("zero account balance", () => {
  it("rejects zero account size with a structured error, not NaN", () => {
    const errors = assertFailure(
      calculateRiskProfileFromValidated(baseInput({ account: { accountSize: 0, riskPerTradePercent: 1 } })),
    );
    expect(errors.some((e) => e.code === "INVALID_ACCOUNT_SIZE")).toBe(true);
  });
});

describe("zero risk percentage", () => {
  it("rejects zero risk % with a structured error", () => {
    const errors = assertFailure(
      calculateRiskProfileFromValidated(baseInput({ account: { accountSize: 500000, riskPerTradePercent: 0 } })),
    );
    expect(errors.some((e) => e.code === "INVALID_RISK_PERCENT")).toBe(true);
  });
});

describe("large account values", () => {
  it("stays precise at large magnitudes (no float drift)", () => {
    const data = assertSuccess(
      calculateRiskProfileFromValidated(baseInput({ account: { accountSize: 500_000_000, riskPerTradePercent: 1 } })),
    );
    expect(data.riskAmount).toBe(5_000_000);
  });
});

describe("decimal prices", () => {
  it("handles fractional/decimal price levels without rounding error", () => {
    const data = assertSuccess(
      calculateRiskProfileFromValidated(
        baseInput({
          trade: { symbol: "X", direction: "LONG", entryPrice: 24850.35, stopLoss: 24750.15, takeProfit: 25050.75 },
          instrument: { tickSize: 0.05, lotSize: 1, contractMultiplier: 1 },
        }),
      ),
    );
    expect(data.riskPerUnit).toBeCloseTo(100.2, 5);
    expect(data.rewardPerUnit).toBeCloseTo(200.4, 5);
  });
});

describe("top-level calculateRiskProfile (unknown/unparsed input)", () => {
  it("returns structured Zod-shape errors for malformed input rather than throwing", () => {
    const errors = assertFailure(calculateRiskProfile({ not: "a valid shape" }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("INVALID_INPUT");
  });

  it("succeeds for well-formed input passed as unknown", () => {
    assertSuccess(calculateRiskProfile(baseInput()));
  });
});
