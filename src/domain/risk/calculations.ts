import Decimal from "decimal.js";
import { RiskValidationError, riskError } from "./errors";
import { RiskCalculationInput, RiskCalculationInputSchema } from "./schemas";
import { PositionSizeResult, RiskCalculationOutcome, RiskCalculationResult, RiskWarning } from "./types";

// ---------------------------------------------------------------------------
// Precision policy (documented per the "Financial Precision" requirement):
//
// - All intermediate arithmetic uses Decimal (decimal.js), never JS `number`
//   math, to avoid float artifacts compounding across a chain of
//   multiplications/divisions.
// - Rounding happens exactly once, at the very end, when a Decimal is
//   converted to the `number` fields on RiskCalculationResult:
//     - currency amounts -> 2 decimal places
//     - price-derived per-unit values -> 8 decimal places (supports both
//       paise-level equities and crypto-level instruments)
//     - quantity -> rounded DOWN (floor) to the nearest valid multiple of
//       the instrument's lot size, never up — rounding up would silently
//       risk more than the trader configured.
// ---------------------------------------------------------------------------
const CURRENCY_DP = 2;
const PRICE_DP = 8;

function toCurrency(d: Decimal): number {
  return d.toDecimalPlaces(CURRENCY_DP, Decimal.ROUND_HALF_UP).toNumber();
}

function toPrice(d: Decimal): number {
  return d.toDecimalPlaces(PRICE_DP, Decimal.ROUND_HALF_UP).toNumber();
}

// ---------------------------------------------------------------------------
// Individual pure calculation functions — each independently unit-testable.
// ---------------------------------------------------------------------------

export function calculateRiskAmount(accountSize: Decimal, riskPerTradePercent: Decimal): Decimal {
  return accountSize.mul(riskPerTradePercent).div(100);
}

export function calculateRiskPerUnit(entryPrice: Decimal, stopLoss: Decimal, direction: "LONG" | "SHORT"): Decimal {
  return direction === "LONG" ? entryPrice.minus(stopLoss) : stopLoss.minus(entryPrice);
}

export function calculateRewardPerUnit(
  entryPrice: Decimal,
  takeProfit: Decimal | null,
  direction: "LONG" | "SHORT",
): Decimal | null {
  if (takeProfit === null) return null;
  return direction === "LONG" ? takeProfit.minus(entryPrice) : entryPrice.minus(takeProfit);
}

export function calculateRiskRewardRatio(riskPerUnit: Decimal, rewardPerUnit: Decimal | null): Decimal | null {
  if (rewardPerUnit === null || riskPerUnit.lte(0)) return null;
  return rewardPerUnit.div(riskPerUnit);
}

// Rounds DOWN to the nearest whole multiple of lotSize. A raw quantity that
// rounds down to zero lots is flagged invalid rather than silently
// returning zero — the caller (the orchestrator) turns that into a
// structured INVALID_POSITION_SIZE error.
export function calculatePositionSize(riskAmount: Decimal, riskPerUnit: Decimal, lotSize: Decimal): PositionSizeResult {
  if (riskPerUnit.lte(0) || lotSize.lte(0)) {
    return { rawQuantity: 0, quantity: 0, lots: 0, isValidLotSize: false };
  }
  const rawQuantity = riskAmount.div(riskPerUnit);
  const lots = rawQuantity.div(lotSize).floor();
  const quantity = lots.mul(lotSize);
  return {
    rawQuantity: toPrice(rawQuantity),
    quantity: toPrice(quantity),
    lots: lots.toNumber(),
    isValidLotSize: lots.gte(1),
  };
}

// A quantity is only tradable if it's an exact whole multiple of the
// instrument's lot size — e.g. lot size 50: 49 and 125 are invalid, 50 and
// 100 are valid. Used to validate any manually-entered quantity, separate
// from the auto-sized `calculatePositionSize` flow above.
export function isValidLotQuantity(quantity: Decimal, lotSize: Decimal): boolean {
  if (lotSize.lte(0) || quantity.lte(0)) return false;
  return quantity.div(lotSize).isInteger();
}

export function calculateCapitalRequired(quantity: Decimal, entryPrice: Decimal, contractMultiplier: Decimal): Decimal {
  return quantity.mul(entryPrice).mul(contractMultiplier);
}

// Round-trip commission: FLAT is a fixed currency amount; PERCENT is a
// percentage of the position's notional value.
export function calculateCommission(
  notionalValue: Decimal,
  commissionType: "FLAT" | "PERCENT",
  commissionValue: Decimal,
): Decimal {
  if (commissionType === "PERCENT") {
    return notionalValue.mul(commissionValue).div(100);
  }
  return commissionValue;
}

// Slippage is expressed in instrument ticks and applied once at entry and
// once at exit (hence x2), scaled by quantity and the contract multiplier.
export function calculateSlippageCost(
  quantity: Decimal,
  tickSize: Decimal,
  slippageTicks: Decimal,
  contractMultiplier: Decimal,
): Decimal {
  return quantity.mul(tickSize).mul(slippageTicks).mul(2).mul(contractMultiplier);
}

export function calculateMaxLoss(quantity: Decimal, riskPerUnit: Decimal, contractMultiplier: Decimal, totalCosts: Decimal): Decimal {
  return quantity.mul(riskPerUnit).mul(contractMultiplier).plus(totalCosts);
}

export function calculatePotentialProfit(
  quantity: Decimal,
  rewardPerUnit: Decimal | null,
  contractMultiplier: Decimal,
  totalCosts: Decimal,
): Decimal | null {
  if (rewardPerUnit === null) return null;
  const gross = quantity.mul(rewardPerUnit).mul(contractMultiplier);
  return gross.minus(totalCosts);
}

// The win rate at which this trade's R:R breaks even, ignoring costs:
// breakEvenWinRate = 1 / (1 + R:R).
export function calculateBreakEvenWinRate(riskRewardRatio: Decimal | null): Decimal | null {
  if (riskRewardRatio === null || riskRewardRatio.lte(0)) return null;
  return new Decimal(1).div(new Decimal(1).plus(riskRewardRatio)).mul(100);
}

export function calculatePortfolioRisk(
  existingOpenRiskAmount: Decimal,
  newRiskAmount: Decimal,
  accountSize: Decimal,
): { totalRiskAmount: Decimal; totalRiskPercent: Decimal } {
  const totalRiskAmount = existingOpenRiskAmount.plus(newRiskAmount);
  const totalRiskPercent = accountSize.gt(0) ? totalRiskAmount.div(accountSize).mul(100) : new Decimal(0);
  return { totalRiskAmount, totalRiskPercent };
}

export function calculateDailyRiskUtilization(
  todaysRealizedLoss: Decimal,
  newRiskAmount: Decimal,
  maxDailyLossAmount: Decimal | null,
): Decimal | null {
  if (maxDailyLossAmount === null || maxDailyLossAmount.lte(0)) return null;
  return todaysRealizedLoss.plus(newRiskAmount).div(maxDailyLossAmount).mul(100);
}

// ---------------------------------------------------------------------------
// Orchestrator: validates input (Zod for shape, domain rules for business
// logic with specific error codes), then composes the pure functions above.
// Never throws for bad input, never returns NaN/Infinity.
// ---------------------------------------------------------------------------
export function calculateRiskProfile(rawInput: unknown): RiskCalculationOutcome {
  const parsed = RiskCalculationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) =>
        riskError("INVALID_INPUT", issue.path.join(".") || "input", issue.message),
      ),
    };
  }
  return calculateRiskProfileFromValidated(parsed.data);
}

// Same as calculateRiskProfile but accepts already-Zod-validated input
// directly — used internally and by callers that have already parsed the
// input (e.g. an API route that wants to validate before calling a service).
export function calculateRiskProfileFromValidated(input: RiskCalculationInput): RiskCalculationOutcome {
  const errors: RiskValidationError[] = [];

  const accountSize = new Decimal(input.account.accountSize);
  const riskPerTradePercent = new Decimal(input.account.riskPerTradePercent);
  const entryPrice = new Decimal(input.trade.entryPrice);
  const stopLoss = new Decimal(input.trade.stopLoss);
  const takeProfit = input.trade.takeProfit !== undefined ? new Decimal(input.trade.takeProfit) : null;
  const tickSize = new Decimal(input.instrument.tickSize);
  const lotSize = new Decimal(input.instrument.lotSize);
  const contractMultiplier = new Decimal(input.instrument.contractMultiplier);

  if (!accountSize.isFinite() || accountSize.lte(0)) {
    errors.push(riskError("INVALID_ACCOUNT_SIZE", "account.accountSize", "Account size must be greater than zero."));
  }
  if (!riskPerTradePercent.isFinite() || riskPerTradePercent.lte(0)) {
    errors.push(riskError("INVALID_RISK_PERCENT", "account.riskPerTradePercent", "Risk per trade % must be greater than zero."));
  }
  if (riskPerTradePercent.gt(100)) {
    errors.push(riskError("INVALID_RISK_PERCENT", "account.riskPerTradePercent", "Risk per trade % cannot exceed 100%."));
  }
  if (!entryPrice.isFinite() || entryPrice.lte(0)) {
    errors.push(riskError("INVALID_PRICE", "trade.entryPrice", "Entry price must be greater than zero."));
  }
  if (!stopLoss.isFinite() || stopLoss.lte(0)) {
    errors.push(riskError("INVALID_PRICE", "trade.stopLoss", "Stop-loss price must be greater than zero."));
  }
  if (takeProfit !== null && (!takeProfit.isFinite() || takeProfit.lte(0))) {
    errors.push(riskError("INVALID_PRICE", "trade.takeProfit", "Take-profit price must be greater than zero."));
  }
  if (!tickSize.isFinite() || tickSize.lte(0)) {
    errors.push(riskError("INVALID_INSTRUMENT", "instrument.tickSize", "Tick size must be greater than zero."));
  }
  if (!lotSize.isFinite() || lotSize.lte(0)) {
    errors.push(riskError("INVALID_INSTRUMENT", "instrument.lotSize", "Lot size must be greater than zero."));
  }

  // Stop-loss / entry relationship checks only make sense once the base
  // prices themselves are valid.
  if (errors.length === 0) {
    if (stopLoss.eq(entryPrice)) {
      errors.push(riskError("INVALID_STOP", "trade.stopLoss", "Stop-loss cannot equal entry price."));
    } else if (input.trade.direction === "LONG" && stopLoss.gt(entryPrice)) {
      errors.push(riskError("INVALID_STOP", "trade.stopLoss", "For a long position, the stop-loss must be below the entry price."));
    } else if (input.trade.direction === "SHORT" && stopLoss.lt(entryPrice)) {
      errors.push(riskError("INVALID_STOP", "trade.stopLoss", "For a short position, the stop-loss must be above the entry price."));
    }

    if (takeProfit !== null) {
      if (input.trade.direction === "LONG" && takeProfit.lte(entryPrice)) {
        errors.push(riskError("INVALID_TAKE_PROFIT", "trade.takeProfit", "For a long position, the take-profit must be above the entry price."));
      } else if (input.trade.direction === "SHORT" && takeProfit.gte(entryPrice)) {
        errors.push(riskError("INVALID_TAKE_PROFIT", "trade.takeProfit", "For a short position, the take-profit must be below the entry price."));
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const riskAmount = calculateRiskAmount(accountSize, riskPerTradePercent);
  const riskPerUnit = calculateRiskPerUnit(entryPrice, stopLoss, input.trade.direction);
  const rewardPerUnit = calculateRewardPerUnit(entryPrice, takeProfit, input.trade.direction);
  const riskRewardRatio = calculateRiskRewardRatio(riskPerUnit, rewardPerUnit);

  const position = calculatePositionSize(riskAmount, riskPerUnit, lotSize);
  if (!position.isValidLotSize) {
    return {
      success: false,
      errors: [
        riskError(
          "INVALID_POSITION_SIZE",
          "instrument.lotSize",
          `The computed position size (${position.rawQuantity} units) rounds down to less than one lot (lot size ${lotSize.toString()}). Increase risk %, widen the account size, or use a tighter stop.`,
        ),
      ],
    };
  }

  const quantityD = new Decimal(position.quantity);
  const capitalRequired = calculateCapitalRequired(quantityD, entryPrice, contractMultiplier);
  const notionalValue = capitalRequired;

  const commissionValue = new Decimal(input.costs.commissionValue);
  if (!commissionValue.isFinite() || commissionValue.lt(0)) {
    return { success: false, errors: [riskError("INVALID_COSTS", "costs.commissionValue", "Commission value cannot be negative.")] };
  }
  const commissionCost = calculateCommission(notionalValue, input.costs.commissionType, commissionValue);
  const slippageCost = calculateSlippageCost(quantityD, tickSize, new Decimal(input.costs.slippageTicks), contractMultiplier);
  const totalCosts = commissionCost.plus(slippageCost);

  const maxLoss = calculateMaxLoss(quantityD, riskPerUnit, contractMultiplier, totalCosts);
  const potentialProfit = calculatePotentialProfit(quantityD, rewardPerUnit, contractMultiplier, totalCosts);
  const breakEvenWinRate = calculateBreakEvenWinRate(riskRewardRatio);

  const positionExposurePercent = accountSize.gt(0) ? capitalRequired.div(accountSize).mul(100) : new Decimal(0);

  const existingOpenRiskAmount = new Decimal(input.existingOpenRiskAmount);
  const { totalRiskAmount: portfolioRiskAmount, totalRiskPercent: portfolioRiskPercent } = calculatePortfolioRisk(
    existingOpenRiskAmount,
    riskAmount,
    accountSize,
  );

  const maxDailyLossAmount =
    input.account.maxDailyLossPercent !== undefined ? accountSize.mul(input.account.maxDailyLossPercent).div(100) : null;
  const dailyRiskUtilizationPercent = calculateDailyRiskUtilization(
    new Decimal(input.todaysRealizedLoss),
    riskAmount,
    maxDailyLossAmount,
  );

  // Deterministic warnings — each backed by an explicit, documented rule.
  const warnings: RiskWarning[] = [];
  if (riskPerUnit.lt(tickSize.mul(3))) {
    warnings.push({
      code: "STOP_TOO_TIGHT",
      message: `Stop distance is extremely small (${riskPerUnit.toString()}, under 3 ticks of ${tickSize.toString()}) — a normal price wiggle could stop you out.`,
    });
  }
  if (capitalRequired.gt(accountSize)) {
    warnings.push({
      code: "EXPOSURE_EXCEEDS_ACCOUNT",
      message: `Position exceeds account exposure limit — capital required (${toCurrency(capitalRequired)}) is greater than account size (${toCurrency(accountSize)}).`,
    });
  }
  if (dailyRiskUtilizationPercent !== null && dailyRiskUtilizationPercent.gte(100)) {
    warnings.push({
      code: "DAILY_LOSS_LIMIT_EXCEEDED",
      message: "Daily risk limit exceeded — today's realized loss plus this trade's risk would breach your configured maximum daily loss.",
    });
  }
  if (input.account.maxPortfolioRiskPercent !== undefined && portfolioRiskPercent.gt(input.account.maxPortfolioRiskPercent)) {
    warnings.push({
      code: "PORTFOLIO_RISK_EXCEEDED",
      message: `Portfolio risk exceeded — total open risk (${toPrice(portfolioRiskPercent)}%) is above your configured maximum (${input.account.maxPortfolioRiskPercent}%).`,
    });
  }

  const result: RiskCalculationResult = {
    riskAmount: toCurrency(riskAmount),
    riskPerUnit: toPrice(riskPerUnit),
    rewardPerUnit: rewardPerUnit !== null ? toPrice(rewardPerUnit) : null,
    riskRewardRatio: riskRewardRatio !== null ? toPrice(riskRewardRatio) : null,
    position,
    capitalRequired: toCurrency(capitalRequired),
    commissionCost: toCurrency(commissionCost),
    slippageCost: toCurrency(slippageCost),
    totalCosts: toCurrency(totalCosts),
    maxLoss: toCurrency(maxLoss),
    potentialProfit: potentialProfit !== null ? toCurrency(potentialProfit) : null,
    breakEvenWinRatePercent: breakEvenWinRate !== null ? toPrice(breakEvenWinRate) : null,
    positionExposurePercent: toPrice(positionExposurePercent),
    portfolioRiskAmount: toCurrency(portfolioRiskAmount),
    portfolioRiskPercent: toPrice(portfolioRiskPercent),
    dailyRiskUtilizationPercent: dailyRiskUtilizationPercent !== null ? toPrice(dailyRiskUtilizationPercent) : null,
    warnings,
  };

  return { success: true, data: result };
}
