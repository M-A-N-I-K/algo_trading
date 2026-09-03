import { clamp, roundTo, safeNumber } from "./format";
import { AccountSettings, PositionSide, RiskCalculatorState, RiskLevel, RiskSettings, SourcedValue, Warning } from "./types";

// ---------------------------------------------------------------------------
// Source-of-truth resolution: when both a % and a $ amount are configured for
// the same parameter, the $ amount wins (it's more precise / already
// account-size-aware). The caller is told which one was actually used so the
// UI can label it.
// ---------------------------------------------------------------------------
export function resolveAmountOrPercent(
  capital: number,
  pct: number | null,
  amountOverride: number | null,
): SourcedValue {
  if (amountOverride !== null && amountOverride !== undefined && amountOverride > 0) {
    return { value: amountOverride, source: "amount" };
  }
  const pctValue = safeNumber(pct);
  return { value: (safeNumber(capital) * pctValue) / 100, source: "percent" };
}

// ---------------------------------------------------------------------------
// 3/4. Risk range + risk per trade
// ---------------------------------------------------------------------------
export interface RiskRange {
  minRisk: number;
  recommendedRisk: number;
  maxRisk: number;
}

export function computeRiskRange(capital: number, risk: RiskSettings): RiskRange {
  const cap = Math.max(0, safeNumber(capital));
  return {
    minRisk: roundTo((cap * Math.max(0, safeNumber(risk.minRiskPct))) / 100, 2),
    recommendedRisk: roundTo((cap * Math.max(0, safeNumber(risk.riskPerTradePct))) / 100, 2),
    maxRisk: roundTo((cap * Math.max(0, safeNumber(risk.maxRiskPct))) / 100, 2),
  };
}

// ---------------------------------------------------------------------------
// 5. Reward range (built from the risk range x configured R:R bounds)
// ---------------------------------------------------------------------------
export interface RewardRange {
  minReward: number;
  recommendedReward: number;
  maxReward: number;
}

export function computeRewardRange(riskRange: RiskRange, risk: RiskSettings): RewardRange {
  const minRR = Math.max(0, safeNumber(risk.minRR));
  const targetRR = Math.max(0, safeNumber(risk.targetRR));
  const maxRR = Math.max(0, safeNumber(risk.maxRR));
  return {
    minReward: roundTo(riskRange.minRisk * minRR, 2),
    recommendedReward: roundTo(riskRange.recommendedRisk * targetRR, 2),
    maxReward: roundTo(riskRange.maxRisk * maxRR, 2),
  };
}

// ---------------------------------------------------------------------------
// 6/7. Max trades per day + daily risk budget
// ---------------------------------------------------------------------------
export interface DailyRiskBudget {
  maxDailyLoss: SourcedValue;
  riskPerTrade: number;
  lossBasedTrades: number; // how many full-risk losses would exhaust the daily loss limit
  configuredMaxTrades: number;
  maxConsecutiveLosses: number;
  finalMaxTrades: number;
  bindingConstraint: "loss-limit" | "configured-limit" | "consecutive-loss-limit";
  reason: string;
  lossesToday: number;
  remainingDailyRisk: number;
  remainingFullRiskTrades: number;
  isLocked: boolean;
}

export function computeDailyRiskBudget(state: RiskCalculatorState): DailyRiskBudget {
  const { account, risk, daily } = state;
  const capital = Math.max(0, safeNumber(account.capital));
  const riskPerTrade = roundTo((capital * Math.max(0, safeNumber(risk.riskPerTradePct))) / 100, 2);
  const maxDailyLoss = resolveAmountOrPercent(capital, risk.maxDailyLossPct, risk.maxDailyLossAmount);

  const lossBasedTrades =
    riskPerTrade > 0 ? Math.max(0, Math.floor(maxDailyLoss.value / riskPerTrade)) : 0;
  const configuredMaxTrades = Math.max(1, Math.floor(safeNumber(risk.maxTradesPerDay, 1)));
  const maxConsecutiveLosses = Math.max(1, Math.floor(safeNumber(risk.maxConsecutiveLosses, 1)));

  const candidates: { value: number; key: DailyRiskBudget["bindingConstraint"] }[] = [
    { value: lossBasedTrades, key: "loss-limit" },
    { value: configuredMaxTrades, key: "configured-limit" },
    { value: maxConsecutiveLosses, key: "consecutive-loss-limit" },
  ];
  candidates.sort((a, b) => a.value - b.value);
  const binding = candidates[0];
  const finalMaxTrades = Math.max(0, binding.value);

  const reasonMap: Record<DailyRiskBudget["bindingConstraint"], string> = {
    "loss-limit": `${finalMaxTrades} consecutive losses at ${riskPerTrade > 0 ? "your risk per trade" : "the configured risk"} would reach your daily loss limit.`,
    "configured-limit": `Capped by your own configured maximum of ${configuredMaxTrades} trades/day.`,
    "consecutive-loss-limit": `Capped by your maximum consecutive losses tolerance of ${maxConsecutiveLosses}.`,
  };

  const lossesToday = Math.max(0, safeNumber(daily.lossesToday));
  const remainingDailyRisk = roundTo(Math.max(0, maxDailyLoss.value - lossesToday), 2);
  const remainingFullRiskTrades = riskPerTrade > 0 ? Math.floor(remainingDailyRisk / riskPerTrade) : 0;
  const isLocked = lossesToday >= maxDailyLoss.value && maxDailyLoss.value > 0;

  return {
    maxDailyLoss,
    riskPerTrade,
    lossBasedTrades,
    configuredMaxTrades,
    maxConsecutiveLosses,
    finalMaxTrades,
    bindingConstraint: binding.key,
    reason: reasonMap[binding.key],
    lossesToday,
    remainingDailyRisk,
    remainingFullRiskTrades,
    isLocked,
  };
}

// ---------------------------------------------------------------------------
// 8. Consecutive loss protection table (flat $ risk per loss, not
// re-percentaged off the shrinking balance — matches how a fixed
// pre-trade risk amount actually behaves intraday).
// ---------------------------------------------------------------------------
export interface ConsecutiveLossRow {
  losses: number;
  cumulativeLoss: number;
  remainingCapital: number;
  remainingCapitalPct: number;
}

export function computeConsecutiveLossTable(
  capital: number,
  riskAmount: number,
  maxConsecutiveLosses: number,
): ConsecutiveLossRow[] {
  const cap = Math.max(0, safeNumber(capital));
  const risk = Math.max(0, safeNumber(riskAmount));
  const rows = Math.max(1, Math.min(20, Math.floor(safeNumber(maxConsecutiveLosses, 1)) + 2));

  const table: ConsecutiveLossRow[] = [];
  for (let i = 1; i <= rows; i++) {
    const cumulativeLoss = roundTo(risk * i, 2);
    const remainingCapital = roundTo(cap - cumulativeLoss, 2);
    table.push({
      losses: i,
      cumulativeLoss,
      remainingCapital,
      remainingCapitalPct: cap > 0 ? roundTo((remainingCapital / cap) * 100, 2) : 0,
    });
  }
  return table;
}

// ---------------------------------------------------------------------------
// 9. Drawdown protection
// ---------------------------------------------------------------------------
export interface DrawdownProtection {
  enabled: boolean;
  maxDrawdownAmount: number;
  currentDrawdownAmount: number;
  remainingDrawdown: number;
  remainingDrawdownPct: number;
  approxRemainingLosses: number;
  isApproachingLimit: boolean; // >=75% of drawdown used
  isAtLimit: boolean;
}

export function computeDrawdownProtection(account: AccountSettings, riskAmount: number): DrawdownProtection {
  const capital = Math.max(0, safeNumber(account.capital));
  const risk = Math.max(0, safeNumber(riskAmount));
  const enabled = account.maxDrawdownPct !== null && account.maxDrawdownPct !== undefined && account.maxDrawdownPct > 0;

  if (!enabled) {
    return {
      enabled: false,
      maxDrawdownAmount: 0,
      currentDrawdownAmount: 0,
      remainingDrawdown: 0,
      remainingDrawdownPct: 0,
      approxRemainingLosses: 0,
      isApproachingLimit: false,
      isAtLimit: false,
    };
  }

  const maxDrawdownAmount = roundTo((capital * safeNumber(account.maxDrawdownPct)) / 100, 2);
  const currentDrawdownAmount = Math.max(0, safeNumber(account.currentDrawdownAmount));
  const remainingDrawdown = roundTo(Math.max(0, maxDrawdownAmount - currentDrawdownAmount), 2);
  const remainingDrawdownPct = maxDrawdownAmount > 0 ? roundTo((remainingDrawdown / maxDrawdownAmount) * 100, 2) : 0;
  const approxRemainingLosses = risk > 0 ? Math.floor(remainingDrawdown / risk) : 0;

  return {
    enabled: true,
    maxDrawdownAmount,
    currentDrawdownAmount,
    remainingDrawdown,
    remainingDrawdownPct,
    approxRemainingLosses,
    isApproachingLimit: maxDrawdownAmount > 0 && currentDrawdownAmount / maxDrawdownAmount >= 0.75,
    isAtLimit: maxDrawdownAmount > 0 && currentDrawdownAmount >= maxDrawdownAmount,
  };
}

// ---------------------------------------------------------------------------
// 10. Position sizing
// ---------------------------------------------------------------------------
export interface PositionSizeInputs {
  entryPrice: number;
  stopLossPrice: number;
  riskAmount: number;
  leverage: number | null;
  feePct: number | null; // round-trip fee/slippage estimate, %
  side: PositionSide;
}

export interface PositionSizeResult {
  valid: boolean;
  error: string | null;
  stopDistance: number;
  stopDistancePct: number;
  positionSizeUnits: number;
  positionValue: number;
  riskAmount: number;
  marginRequired: number | null;
  estimatedFeeCost: number | null;
}

export function computePositionSize(inputs: PositionSizeInputs): PositionSizeResult {
  const entry = safeNumber(inputs.entryPrice);
  const stop = safeNumber(inputs.stopLossPrice);
  const risk = Math.max(0, safeNumber(inputs.riskAmount));

  const empty: PositionSizeResult = {
    valid: false,
    error: null,
    stopDistance: 0,
    stopDistancePct: 0,
    positionSizeUnits: 0,
    positionValue: 0,
    riskAmount: risk,
    marginRequired: null,
    estimatedFeeCost: null,
  };

  if (entry <= 0) return { ...empty, error: "Entry price must be greater than zero." };
  if (stop <= 0) return { ...empty, error: "Stop-loss price must be greater than zero." };
  if (stop === entry) return { ...empty, error: "Stop-loss cannot equal entry price." };
  if (risk <= 0) return { ...empty, error: "Risk amount must be greater than zero." };

  if (inputs.side === "LONG" && stop >= entry) {
    return { ...empty, error: "For a long position, the stop-loss must be below the entry price." };
  }
  if (inputs.side === "SHORT" && stop <= entry) {
    return { ...empty, error: "For a short position, the stop-loss must be above the entry price." };
  }

  const stopDistance = Math.abs(entry - stop);
  const positionSizeUnits = roundTo(risk / stopDistance, 8);
  const positionValue = roundTo(positionSizeUnits * entry, 2);
  const stopDistancePct = roundTo((stopDistance / entry) * 100, 4);

  const leverage = inputs.leverage && inputs.leverage > 0 ? inputs.leverage : null;
  const marginRequired = leverage ? roundTo(positionValue / leverage, 2) : null;

  const feePct = inputs.feePct && inputs.feePct > 0 ? inputs.feePct : null;
  const estimatedFeeCost = feePct ? roundTo(positionValue * (feePct / 100) * 2, 2) : null;

  return {
    valid: true,
    error: null,
    stopDistance: roundTo(stopDistance, 8),
    stopDistancePct,
    positionSizeUnits,
    positionValue,
    riskAmount: risk,
    marginRequired,
    estimatedFeeCost,
  };
}

// ---------------------------------------------------------------------------
// 11. Risk/Reward calculator
// ---------------------------------------------------------------------------
export interface RiskRewardInputs {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  side: PositionSide;
}

export interface RiskRewardResult {
  valid: boolean;
  error: string | null;
  riskPerUnit: number;
  rewardPerUnit: number;
  riskPct: number;
  rewardPct: number;
  rrRatio: number;
}

export function computeRiskReward(inputs: RiskRewardInputs): RiskRewardResult {
  const entry = safeNumber(inputs.entryPrice);
  const stop = safeNumber(inputs.stopLossPrice);
  const target = safeNumber(inputs.takeProfitPrice);

  const empty: RiskRewardResult = {
    valid: false,
    error: null,
    riskPerUnit: 0,
    rewardPerUnit: 0,
    riskPct: 0,
    rewardPct: 0,
    rrRatio: 0,
  };

  if (entry <= 0) return { ...empty, error: "Entry price must be greater than zero." };
  if (stop <= 0) return { ...empty, error: "Stop-loss price must be greater than zero." };
  if (target <= 0) return { ...empty, error: "Take-profit price must be greater than zero." };
  if (stop === entry) return { ...empty, error: "Stop-loss cannot equal entry price." };

  let riskPerUnit: number;
  let rewardPerUnit: number;

  if (inputs.side === "LONG") {
    if (stop >= entry) return { ...empty, error: "For a long position, the stop-loss must be below the entry price." };
    if (target <= entry) return { ...empty, error: "For a long position, the take-profit must be above the entry price." };
    riskPerUnit = entry - stop;
    rewardPerUnit = target - entry;
  } else {
    if (stop <= entry) return { ...empty, error: "For a short position, the stop-loss must be above the entry price." };
    if (target >= entry) return { ...empty, error: "For a short position, the take-profit must be below the entry price." };
    riskPerUnit = stop - entry;
    rewardPerUnit = entry - target;
  }

  return {
    valid: true,
    error: null,
    riskPerUnit: roundTo(riskPerUnit, 8),
    rewardPerUnit: roundTo(rewardPerUnit, 8),
    riskPct: roundTo((riskPerUnit / entry) * 100, 4),
    rewardPct: roundTo((rewardPerUnit / entry) * 100, 4),
    rrRatio: riskPerUnit > 0 ? roundTo(rewardPerUnit / riskPerUnit, 2) : 0,
  };
}

// ---------------------------------------------------------------------------
// 14. Expectancy calculator
// ---------------------------------------------------------------------------
export interface ExpectancyInputs {
  winRatePct: number;
  avgWinR: number;
  avgLossR: number;
  numTrades: number;
  riskAmount: number;
}

export interface ExpectancyResult {
  valid: boolean;
  error: string | null;
  expectancyR: number;
  expectedValuePerTrade: number;
  estimatedResultOverN: number;
}

export function computeExpectancy(inputs: ExpectancyInputs): ExpectancyResult {
  const winRate = safeNumber(inputs.winRatePct);
  const avgWin = Math.max(0, safeNumber(inputs.avgWinR));
  const avgLoss = Math.max(0, safeNumber(inputs.avgLossR));
  const n = Math.max(0, Math.floor(safeNumber(inputs.numTrades)));
  const riskAmount = Math.max(0, safeNumber(inputs.riskAmount));

  if (winRate < 0 || winRate > 100) {
    return { valid: false, error: "Win rate must be between 0% and 100%.", expectancyR: 0, expectedValuePerTrade: 0, estimatedResultOverN: 0 };
  }

  const w = winRate / 100;
  const expectancyR = roundTo(w * avgWin - (1 - w) * avgLoss, 4);
  const expectedValuePerTrade = roundTo(expectancyR * riskAmount, 2);
  const estimatedResultOverN = roundTo(expectedValuePerTrade * n, 2);

  return { valid: true, error: null, expectancyR, expectedValuePerTrade, estimatedResultOverN };
}

// ---------------------------------------------------------------------------
// 16. What-if scenario simulator
// ---------------------------------------------------------------------------
export interface WhatIfInputs {
  startingCapital: number;
  riskPct: number;
  rrRatio: number;
  winRatePct: number;
}

export interface WhatIfRow {
  trades: number;
  bestCase: number;
  expected: number;
  worstCase: number;
}

const WHAT_IF_TRADE_COUNTS = [5, 10, 20, 50, 100];

export function computeWhatIfScenarios(inputs: WhatIfInputs): WhatIfRow[] {
  const capital = Math.max(0, safeNumber(inputs.startingCapital));
  const riskAmount = (capital * Math.max(0, safeNumber(inputs.riskPct))) / 100;
  const rr = Math.max(0, safeNumber(inputs.rrRatio));
  const winRate = clampWinRate(safeNumber(inputs.winRatePct));
  const w = winRate / 100;
  const expectancyR = w * rr - (1 - w) * 1;

  return WHAT_IF_TRADE_COUNTS.map((trades) => ({
    trades,
    bestCase: roundTo(capital + trades * rr * riskAmount, 2),
    expected: roundTo(capital + trades * expectancyR * riskAmount, 2),
    worstCase: roundTo(Math.max(0, capital - trades * riskAmount), 2),
  }));
}

function clampWinRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// 13. Risk level indicator — derived purely from the user's own configured
// thresholds, never an arbitrary external claim.
// ---------------------------------------------------------------------------
export function computeRiskLevel(state: RiskCalculatorState): RiskLevel {
  const { account, risk } = state;
  const riskPct = safeNumber(risk.riskPerTradePct);
  const minPct = safeNumber(risk.minRiskPct);
  const maxPct = safeNumber(risk.maxRiskPct);
  const span = Math.max(0.0001, maxPct - minPct);

  const dailyBudget = computeDailyRiskBudget(state);
  const drawdown = computeDrawdownProtection(account, dailyBudget.riskPerTrade);

  const overMaxRisk = riskPct > maxPct;
  const belowMinRR = safeNumber(risk.targetRR) < safeNumber(risk.minRR);
  const dailyLossBreached = dailyBudget.isLocked;
  const drawdownAtLimit = drawdown.enabled && drawdown.isAtLimit;

  if (overMaxRisk || belowMinRR || dailyLossBreached || drawdownAtLimit) {
    return "aggressive";
  }

  const riskFraction = clamp((riskPct - minPct) / span, 0, 1);
  const conservativeRisk = riskFraction <= 0.3;
  const rrHealthy = safeNumber(risk.targetRR) >= safeNumber(risk.minRR);
  const drawdownSafe = !drawdown.enabled || drawdown.currentDrawdownAmount / Math.max(1, drawdown.maxDrawdownAmount) <= 0.3;

  if (conservativeRisk && rrHealthy && drawdownSafe && !drawdown.isApproachingLimit) {
    return "conservative";
  }

  return "moderate";
}

// ---------------------------------------------------------------------------
// 17. Dynamic warnings / guardrails
// ---------------------------------------------------------------------------
export function generateWarnings(state: RiskCalculatorState): Warning[] {
  const { account, risk } = state;
  const warnings: Warning[] = [];

  const riskPct = safeNumber(risk.riskPerTradePct);
  if (riskPct > safeNumber(risk.maxRiskPct)) {
    warnings.push({ severity: "warning", message: "Your risk per trade exceeds your configured maximum." });
  }
  if (riskPct < safeNumber(risk.minRiskPct)) {
    warnings.push({ severity: "warning", message: "Your risk per trade is below your configured minimum — you may be under-risking relative to your own plan." });
  }
  if (safeNumber(risk.targetRR) < safeNumber(risk.minRR)) {
    warnings.push({ severity: "warning", message: "Your selected Risk:Reward is below your minimum acceptable ratio." });
  }
  if (safeNumber(risk.targetRR) > safeNumber(risk.maxRR)) {
    warnings.push({ severity: "warning", message: "Your target Risk:Reward is above your own configured maximum — double-check it's realistic for this setup." });
  }

  const dailyBudget = computeDailyRiskBudget(state);
  if (dailyBudget.isLocked) {
    warnings.push({ severity: "critical", message: "Daily risk limit reached. No additional full-risk trades should be taken today." });
  } else if (
    dailyBudget.maxDailyLoss.value > 0 &&
    dailyBudget.lossesToday / dailyBudget.maxDailyLoss.value >= 0.8
  ) {
    warnings.push({ severity: "warning", message: "Your configured daily loss limit would be exceeded if your next trade loses at full risk." });
  }
  if (dailyBudget.configuredMaxTrades > dailyBudget.lossBasedTrades) {
    warnings.push({ severity: "warning", message: "Your planned number of trades exceeds your daily risk budget." });
  }

  const drawdown = computeDrawdownProtection(account, dailyBudget.riskPerTrade);
  if (drawdown.enabled) {
    if (drawdown.isAtLimit) {
      warnings.push({ severity: "critical", message: "You have reached your maximum account drawdown." });
    } else if (drawdown.isApproachingLimit) {
      warnings.push({ severity: "warning", message: "You are approaching your maximum account drawdown." });
    }
  }

  const maxDailyLossAmount = dailyBudget.maxDailyLoss.value;
  if (maxDailyLossAmount > Math.max(0, safeNumber(account.capital))) {
    warnings.push({ severity: "warning", message: "Your maximum daily loss amount is larger than your account capital." });
  }

  return warnings;
}
