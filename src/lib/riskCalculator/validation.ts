import { safeNumber } from "./format";
import { RiskCalculatorState } from "./types";

export interface FieldIssue {
  field: string;
  message: string;
}

// Validates the account/risk settings as a whole and returns field-level
// issues. This never throws and never produces NaN/Infinity — callers
// should treat an empty return as "safe to calculate with."
export function validateState(state: RiskCalculatorState): FieldIssue[] {
  const { account, risk, daily } = state;
  const issues: FieldIssue[] = [];

  const capital = safeNumber(account.capital, NaN);
  if (!Number.isFinite(capital) || capital <= 0) {
    issues.push({ field: "capital", message: "Capital must be a positive number." });
  }

  if (safeNumber(account.currentEquity, 0) < 0) {
    issues.push({ field: "currentEquity", message: "Current equity cannot be negative." });
  }

  if (account.maxDrawdownPct !== null) {
    const dd = safeNumber(account.maxDrawdownPct, NaN);
    if (!Number.isFinite(dd) || dd <= 0 || dd > 100) {
      issues.push({ field: "maxDrawdownPct", message: "Maximum drawdown must be between 0% and 100%." });
    }
  }
  if (safeNumber(account.currentDrawdownAmount, 0) < 0) {
    issues.push({ field: "currentDrawdownAmount", message: "Current drawdown cannot be negative." });
  }

  if (safeNumber(risk.minRiskPct, NaN) < 0) {
    issues.push({ field: "minRiskPct", message: "Minimum risk % cannot be negative." });
  }
  if (safeNumber(risk.maxRiskPct, NaN) <= 0) {
    issues.push({ field: "maxRiskPct", message: "Maximum risk % must be greater than zero." });
  }
  if (safeNumber(risk.minRiskPct) > safeNumber(risk.maxRiskPct)) {
    issues.push({ field: "minRiskPct", message: "Minimum risk % cannot be greater than maximum risk %." });
  }
  if (safeNumber(risk.riskPerTradePct, NaN) <= 0) {
    issues.push({ field: "riskPerTradePct", message: "Risk per trade must be greater than zero." });
  }

  if (safeNumber(risk.minRR, NaN) <= 0) {
    issues.push({ field: "minRR", message: "Minimum Risk:Reward must be greater than zero." });
  }
  if (safeNumber(risk.targetRR, NaN) <= 0) {
    issues.push({ field: "targetRR", message: "Target Risk:Reward must be greater than zero." });
  }
  if (safeNumber(risk.maxRR, NaN) <= 0) {
    issues.push({ field: "maxRR", message: "Maximum Risk:Reward must be greater than zero." });
  }
  if (safeNumber(risk.minRR) > safeNumber(risk.maxRR)) {
    issues.push({ field: "minRR", message: "Minimum R:R cannot be greater than maximum R:R." });
  }

  const maxTrades = Math.floor(safeNumber(risk.maxTradesPerDay, NaN));
  if (!Number.isFinite(maxTrades) || maxTrades < 1) {
    issues.push({ field: "maxTradesPerDay", message: "Maximum trades per day must be at least 1." });
  }

  const maxConsecutive = Math.floor(safeNumber(risk.maxConsecutiveLosses, NaN));
  if (!Number.isFinite(maxConsecutive) || maxConsecutive < 1) {
    issues.push({ field: "maxConsecutiveLosses", message: "Maximum consecutive losses must be at least 1." });
  }

  if (safeNumber(risk.maxDailyLossPct, NaN) <= 0 && risk.maxDailyLossAmount === null) {
    issues.push({ field: "maxDailyLossPct", message: "Set a maximum daily loss % or amount." });
  }
  if (risk.maxDailyLossAmount !== null && risk.maxDailyLossAmount > Math.max(0, capital)) {
    issues.push({ field: "maxDailyLossAmount", message: "Maximum daily loss amount cannot exceed your capital." });
  }

  if (safeNumber(daily.lossesToday, 0) < 0) {
    issues.push({ field: "lossesToday", message: "Losses today cannot be negative." });
  }

  return issues;
}

export function validateWinRate(winRatePct: number): string | null {
  const w = safeNumber(winRatePct, NaN);
  if (!Number.isFinite(w) || w < 0 || w > 100) {
    return "Win rate must be between 0% and 100%.";
  }
  return null;
}
