import { RiskSettings, TradingStyle } from "./types";

// "Suggested starting settings — customize according to your tested
// strategy." These are reasonable, commonly-cited starting points, not
// universal truths, and every value remains fully editable.
export const TRADING_STYLE_PRESETS: Record<Exclude<TradingStyle, "custom">, Omit<RiskSettings, "tradingStyle">> = {
  scalping: {
    riskPerTradePct: 0.25,
    minRiskPct: 0.1,
    maxRiskPct: 0.5,
    targetRR: 1.5,
    minRR: 1.2,
    maxRR: 2.5,
    maxTradesPerDay: 6,
    maxDailyLossPct: 1.5,
    maxDailyLossAmount: null,
    maxConsecutiveLosses: 3,
    dailyProfitTargetPct: 2,
    dailyProfitTargetAmount: null,
  },
  day: {
    riskPerTradePct: 0.5,
    minRiskPct: 0.25,
    maxRiskPct: 1,
    targetRR: 2,
    minRR: 1.5,
    maxRR: 3,
    maxTradesPerDay: 5,
    maxDailyLossPct: 2,
    maxDailyLossAmount: null,
    maxConsecutiveLosses: 3,
    dailyProfitTargetPct: 3,
    dailyProfitTargetAmount: null,
  },
  swing: {
    riskPerTradePct: 1,
    minRiskPct: 0.5,
    maxRiskPct: 1.5,
    targetRR: 3,
    minRR: 2,
    maxRR: 5,
    maxTradesPerDay: 2,
    maxDailyLossPct: 3,
    maxDailyLossAmount: null,
    maxConsecutiveLosses: 3,
    dailyProfitTargetPct: null,
    dailyProfitTargetAmount: null,
  },
};

export const CUSTOM_DEFAULT: Omit<RiskSettings, "tradingStyle"> = {
  ...TRADING_STYLE_PRESETS.day,
};

export function getPresetForStyle(style: TradingStyle): Omit<RiskSettings, "tradingStyle"> {
  if (style === "custom") return CUSTOM_DEFAULT;
  return TRADING_STYLE_PRESETS[style];
}

export const STYLE_LABELS: Record<TradingStyle, string> = {
  scalping: "Scalping",
  day: "Day Trading",
  swing: "Swing Trading",
  custom: "Custom",
};

export const STYLE_DESCRIPTIONS: Record<TradingStyle, string> = {
  scalping: "Lower risk per trade, higher trade frequency, tight daily loss limits.",
  day: "Moderate risk, moderate trade limit, defined daily loss limit.",
  swing: "Lower trade frequency, larger stop-loss distances, risk still controlled as % of capital.",
  custom: "Fully manual — configure every value yourself.",
};
