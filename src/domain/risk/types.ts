import { RiskValidationError } from "./errors";

export * from "./schemas";
export * from "./errors";

export type RiskWarningCode =
  | "STOP_TOO_TIGHT"
  | "EXPOSURE_EXCEEDS_ACCOUNT"
  | "DAILY_LOSS_LIMIT_EXCEEDED"
  | "PORTFOLIO_RISK_EXCEEDED";

export interface RiskWarning {
  code: RiskWarningCode;
  message: string;
}

export interface PositionSizeResult {
  rawQuantity: number; // before lot-size rounding
  quantity: number; // rounded down to a valid multiple of lot size
  lots: number;
  isValidLotSize: boolean;
}

export interface RiskCalculationResult {
  riskAmount: number;
  riskPerUnit: number;
  rewardPerUnit: number | null;
  riskRewardRatio: number | null;
  position: PositionSizeResult;
  capitalRequired: number;
  commissionCost: number;
  slippageCost: number;
  totalCosts: number;
  maxLoss: number; // gross risk + costs
  potentialProfit: number | null; // gross reward - costs
  breakEvenWinRatePercent: number | null;
  positionExposurePercent: number; // capitalRequired / accountSize * 100
  portfolioRiskAmount: number; // existingOpenRiskAmount + this trade's riskAmount
  portfolioRiskPercent: number;
  dailyRiskUtilizationPercent: number | null; // (todaysRealizedLoss + riskAmount) / maxDailyLossAmount * 100
  warnings: RiskWarning[];
}

export type RiskCalculationOutcome =
  | { success: true; data: RiskCalculationResult }
  | { success: false; errors: RiskValidationError[] };

// Explicit type-guard functions rather than relying on implicit
// control-flow narrowing of `outcome.success` — this repo's tsconfig has
// `strict: false` (no `strictNullChecks`), under which TypeScript's
// discriminated-union narrowing via plain `if (outcome.success)` does not
// reliably narrow the union. A `x is T` type predicate narrows correctly
// regardless of that setting, so every call site should use these instead.
export function isRiskCalculationSuccess(
  outcome: RiskCalculationOutcome,
): outcome is { success: true; data: RiskCalculationResult } {
  return outcome.success === true;
}

export function isRiskCalculationFailure(
  outcome: RiskCalculationOutcome,
): outcome is { success: false; errors: RiskValidationError[] } {
  return outcome.success === false;
}
