import { ConditionGroup } from "./conditions";
import { StrategyDefinition } from "./definition";
import { Expression } from "./expressions";
import { generateId } from "./ids";

// Templates are structured StrategyDefinitions, built by factory functions
// (not hardcoded into UI components) — selecting one in the UI just calls
// `build()` and hands the result to the same editor used for any other
// strategy. Every template must pass validateStrategyDefinition-adjacent
// schema validation (enforced by a test in tests/templates.test.ts).

const ema = (period: number, source?: Expression): Expression => ({
  type: "indicator",
  indicator: "EMA",
  parameters: { period },
  source,
});
const sma = (period: number, source?: Expression): Expression => ({
  type: "indicator",
  indicator: "SMA",
  parameters: { period },
  source,
});
const rsi = (period: number): Expression => ({ type: "indicator", indicator: "RSI", parameters: { period } });
const atrExpr = (period: number): Expression => ({ type: "indicator", indicator: "ATR", parameters: { period } });
const bollinger = (period: number, stdDevMultiplier: number, output: "upper" | "lower"): Expression => ({
  type: "indicator",
  indicator: "BOLLINGER_BANDS",
  parameters: { period, stdDevMultiplier },
  output,
});
const vwapExpr = (): Expression => ({ type: "indicator", indicator: "VWAP", parameters: {} });
const close: Expression = { type: "price", field: "CLOSE" };
const volume: Expression = { type: "volume" };
const openingRangeHigh = (minutes: number): Expression => ({ type: "reference", reference: "OPENING_RANGE_HIGH", parameters: { minutes } });

function group(operator: "AND" | "OR", conditions: ConditionGroup["conditions"]): ConditionGroup {
  return { type: "group", id: generateId(), operator, negate: false, conditions };
}
type OperatorId =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "CROSSES_ABOVE"
  | "CROSSES_BELOW"
  | "IS_RISING"
  | "IS_FALLING";

function cond(left: Expression, operator: OperatorId, right?: Expression) {
  return { type: "condition" as const, id: generateId(), negate: false, left, operator, right };
}

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  build: () => StrategyDefinition;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "ma_crossover",
    name: "Moving Average Crossover",
    description: "Enter when a fast EMA crosses above a slow EMA; exit on the opposite cross.",
    build: () => ({
      metadata: { name: "Moving Average Crossover", description: "EMA(20)/EMA(50) crossover.", strategyType: "TREND_FOLLOWING" },
      market: { symbol: "NIFTY" },
      timeframe: "1h",
      direction: "LONG_ONLY",
      entry: { long: { conditions: group("AND", [cond(ema(20), "CROSSES_ABOVE", ema(50))]), order: { type: "MARKET" } } },
      exit: {
        stopLoss: { type: "ATR_MULTIPLE", indicator: "ATR", period: 14, multiplier: 2 },
        signalExit: { type: "SIGNAL", conditions: group("AND", [cond(ema(20), "CROSSES_BELOW", ema(50))]) },
      },
      positionSizing: { type: "RISK_PERCENT", percent: 1 },
      risk: { maxRiskPerTradePercent: 2 },
    }),
  },
  {
    id: "rsi_mean_reversion",
    name: "RSI Mean Reversion",
    description: "Buy oversold bounces confirmed by price below the lower Bollinger Band; exit as RSI recovers.",
    build: () => ({
      metadata: { name: "RSI Mean Reversion", description: "RSI(14) < 30 with lower-band confirmation.", strategyType: "MEAN_REVERSION" },
      market: { symbol: "NIFTY" },
      timeframe: "15m",
      direction: "LONG_ONLY",
      entry: {
        long: {
          conditions: group("AND", [cond(rsi(14), "LESS_THAN", { type: "constant", value: 30 }), cond(close, "GREATER_THAN", bollinger(20, 2, "lower"))]),
          order: { type: "MARKET" },
        },
      },
      exit: {
        stopLoss: { type: "ATR_MULTIPLE", indicator: "ATR", period: 14, multiplier: 1.5 },
        takeProfit: { type: "R_MULTIPLE", multiple: 2 },
        signalExit: { type: "SIGNAL", conditions: group("AND", [cond(rsi(14), "GREATER_THAN", { type: "constant", value: 60 })]) },
      },
      positionSizing: { type: "RISK_PERCENT", percent: 1 },
      risk: { maxRiskPerTradePercent: 2 },
    }),
  },
  {
    id: "ema_trend_following",
    name: "EMA Trend Following",
    description: "Trade with the trend on both sides: price and a fast EMA aligned above/below a slow EMA.",
    build: () => ({
      metadata: { name: "EMA Trend Following", description: "Close and EMA(20) aligned with EMA(50) trend.", strategyType: "TREND_FOLLOWING" },
      market: { symbol: "NIFTY" },
      timeframe: "1h",
      direction: "LONG_AND_SHORT",
      entry: {
        long: { conditions: group("AND", [cond(close, "GREATER_THAN", ema(50)), cond(ema(20), "GREATER_THAN", ema(50))]), order: { type: "MARKET" } },
        short: { conditions: group("AND", [cond(close, "LESS_THAN", ema(50)), cond(ema(20), "LESS_THAN", ema(50))]), order: { type: "MARKET" } },
      },
      exit: {
        stopLoss: { type: "ATR_MULTIPLE", indicator: "ATR", period: 14, multiplier: 2 },
        signalExit: { type: "SIGNAL", conditions: group("OR", [cond(close, "CROSSES_BELOW", ema(50)), cond(close, "CROSSES_ABOVE", ema(50))]) },
      },
      positionSizing: { type: "RISK_PERCENT", percent: 1 },
      risk: { maxRiskPerTradePercent: 2 },
    }),
  },
  {
    id: "vwap_reversion",
    name: "VWAP Reversion",
    description: "Buy an oversold dip below session VWAP, exiting as price reverts back to it.",
    build: () => ({
      metadata: { name: "VWAP Reversion", description: "Price below VWAP with RSI oversold, reverting to VWAP.", strategyType: "MEAN_REVERSION" },
      market: { symbol: "NIFTY" },
      timeframe: "5m",
      direction: "LONG_ONLY",
      entry: {
        long: {
          conditions: group("AND", [cond(close, "LESS_THAN", vwapExpr()), cond(rsi(14), "LESS_THAN", { type: "constant", value: 30 })]),
          order: { type: "MARKET" },
        },
      },
      exit: {
        stopLoss: { type: "ATR_MULTIPLE", indicator: "ATR", period: 14, multiplier: 1 },
        signalExit: { type: "SIGNAL", conditions: group("AND", [cond(close, "CROSSES_ABOVE", vwapExpr())]) },
      },
      positionSizing: { type: "RISK_PERCENT", percent: 1 },
      risk: { maxRiskPerTradePercent: 2 },
    }),
  },
  {
    id: "opening_range_breakout",
    name: "Opening Range Breakout",
    description: "Enter on a volume-confirmed breakout of the first 15 minutes' range; flatten by 15:15.",
    build: () => ({
      metadata: { name: "Opening Range Breakout", description: "Close breaks above the opening range high with above-average volume.", strategyType: "BREAKOUT" },
      market: { symbol: "NIFTY" },
      timeframe: "5m",
      direction: "LONG_ONLY",
      entry: {
        long: {
          conditions: group("AND", [
            cond(close, "CROSSES_ABOVE", openingRangeHigh(15)),
            cond(volume, "GREATER_THAN", sma(20, volume)),
          ]),
          order: { type: "MARKET" },
        },
      },
      exit: {
        stopLoss: { type: "ATR_MULTIPLE", indicator: "ATR", period: 14, multiplier: 1 },
        takeProfit: { type: "R_MULTIPLE", multiple: 2 },
        timeExit: { type: "TIME", time: "15:15" },
      },
      positionSizing: { type: "RISK_PERCENT", percent: 1 },
      risk: { maxRiskPerTradePercent: 2 },
      session: { startTime: "09:30", endTime: "15:15", days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"], sessionType: "REGULAR" },
    }),
  },
];

export function getTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === id);
}
