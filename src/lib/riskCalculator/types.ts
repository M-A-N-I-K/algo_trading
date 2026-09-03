export type Currency = "INR" | "USDT";
export type TradingStyle = "scalping" | "day" | "swing" | "custom";
export type PositionSide = "LONG" | "SHORT";
export type RiskLevel = "conservative" | "moderate" | "aggressive";
export type WarningSeverity = "warning" | "critical";

export interface AccountSettings {
  currency: Currency;
  capital: number; // starting/current capital
  currentEquity: number; // current account balance/equity
  maxDrawdownPct: number | null; // optional
  currentDrawdownAmount: number; // how much of that drawdown has already happened
}

export interface RiskSettings {
  tradingStyle: TradingStyle;
  riskPerTradePct: number; // the selected/recommended risk %
  minRiskPct: number;
  maxRiskPct: number;
  targetRR: number; // e.g. 3 means 1:3
  minRR: number;
  maxRR: number;
  maxTradesPerDay: number; // configured by user
  maxDailyLossPct: number;
  maxDailyLossAmount: number | null; // if set, overrides the % as source of truth
  maxConsecutiveLosses: number;
  dailyProfitTargetPct: number | null;
  dailyProfitTargetAmount: number | null;
}

export interface DailyState {
  lossesToday: number; // $ amount already lost today
  tradesTakenToday: number;
}

export interface RiskCalculatorState {
  account: AccountSettings;
  risk: RiskSettings;
  daily: DailyState;
}

export interface SourcedValue {
  value: number;
  source: "amount" | "percent";
}

export interface Warning {
  severity: WarningSeverity;
  message: string;
}
