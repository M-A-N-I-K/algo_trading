import Decimal from "decimal.js";
import { OHLC } from "@/indicators/utils";
import {
  calculatePositionSize as calculateRiskBasedSize,
  calculateRiskAmount,
} from "@/domain/risk";
import { EvaluationContext, evaluateConditionNode, evaluateExpressionSeries } from "./evaluation";
import { PositionSizingConfig } from "./positionSizing";
import { StopLossRule, TakeProfitRule } from "./entryExit";
import { StrategyDefinition } from "./definition";
import { TradingSession } from "./session";

export type Direction = "LONG" | "SHORT";

export interface EntrySignal {
  long: boolean;
  short: boolean;
}

export interface OpenPositionInfo {
  direction: Direction;
  entryIndex: number;
  entryPrice: number;
  stopPrice?: number;
  targetPrice?: number;
}

export interface ExitSignal {
  shouldExit: boolean;
  reason?: "STOP" | "TARGET" | "SIGNAL" | "TIME";
}

export interface PositionSizeOutcome {
  quantity: number;
  // The $ amount actually at risk for this sizing method — null for
  // FIXED_QUANTITY/FIXED_CAPITAL, which aren't risk-derived.
  riskAmount: number | null;
  isValidLotSize: boolean;
}

// Determinism (per spec): every function here is pure over its explicit
// arguments — no Date.now(), no module-level mutable state, no randomness.
// The same StrategyDefinition + same candles + same bar index always
// produces the same result.
export interface StrategyInterpreter {
  evaluateEntry(definition: StrategyDefinition, ctx: EvaluationContext, t: number): EntrySignal;
  evaluateExit(definition: StrategyDefinition, ctx: EvaluationContext, t: number, position: OpenPositionInfo): ExitSignal;
  calculateStop(rule: StopLossRule, ctx: EvaluationContext, entryIndex: number, entryPrice: number, direction: Direction): number;
  calculateTarget(rule: TakeProfitRule, entryPrice: number, stopPrice: number, direction: Direction): number;
  calculatePositionSize(
    config: PositionSizingConfig,
    params: { accountSize: number; entryPrice: number; stopPrice: number; lotSize?: number },
  ): PositionSizeOutcome;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC_DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinSession(session: TradingSession | undefined, candle: OHLC): boolean {
  if (!session) return true;

  const date = new Date(candle.openTime);
  const dayName = UTC_DAY_NAMES[date.getUTCDay()];
  if (dayName !== "SUNDAY" && dayName !== "SATURDAY" && !session.days.includes(dayName as (typeof session.days)[number])) {
    return false;
  }
  if (dayName === "SUNDAY" || dayName === "SATURDAY") return false;

  const minutesOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (session.startTime && minutesOfDay < timeToMinutes(session.startTime)) return false;
  if (session.endTime && minutesOfDay > timeToMinutes(session.endTime)) return false;

  if (session.dateRange) {
    const dayStart = Math.floor(candle.openTime / DAY_MS) * DAY_MS;
    const from = new Date(session.dateRange.from).getTime();
    const to = new Date(session.dateRange.to).getTime();
    if (dayStart < from || dayStart > to) return false;
  }

  return true;
}

class DefaultStrategyInterpreter implements StrategyInterpreter {
  evaluateEntry(definition: StrategyDefinition, ctx: EvaluationContext, t: number): EntrySignal {
    const candle = ctx.ohlc[t];
    if (!isWithinSession(definition.session, candle)) return { long: false, short: false };
    if (definition.filters && !evaluateConditionNode(definition.filters, ctx, t)) return { long: false, short: false };

    const canLong = definition.direction === "LONG_ONLY" || definition.direction === "LONG_AND_SHORT";
    const canShort = definition.direction === "SHORT_ONLY" || definition.direction === "LONG_AND_SHORT";

    const long = canLong && !!definition.entry.long && evaluateConditionNode(definition.entry.long.conditions, ctx, t);
    const short = canShort && !!definition.entry.short && evaluateConditionNode(definition.entry.short.conditions, ctx, t);

    return { long, short };
  }

  evaluateExit(definition: StrategyDefinition, ctx: EvaluationContext, t: number, position: OpenPositionInfo): ExitSignal {
    const candle = ctx.ohlc[t];
    const isLong = position.direction === "LONG";

    if (position.stopPrice !== undefined) {
      const stopHit = isLong ? candle.low <= position.stopPrice : candle.high >= position.stopPrice;
      if (stopHit) return { shouldExit: true, reason: "STOP" };
    }
    if (position.targetPrice !== undefined) {
      const targetHit = isLong ? candle.high >= position.targetPrice : candle.low <= position.targetPrice;
      if (targetHit) return { shouldExit: true, reason: "TARGET" };
    }
    if (definition.exit.timeExit) {
      const minutesOfDay = new Date(candle.openTime).getUTCHours() * 60 + new Date(candle.openTime).getUTCMinutes();
      if (minutesOfDay >= timeToMinutes(definition.exit.timeExit.time)) {
        return { shouldExit: true, reason: "TIME" };
      }
    }
    if (definition.exit.signalExit && evaluateConditionNode(definition.exit.signalExit.conditions, ctx, t)) {
      return { shouldExit: true, reason: "SIGNAL" };
    }

    return { shouldExit: false };
  }

  calculateStop(rule: StopLossRule, ctx: EvaluationContext, entryIndex: number, entryPrice: number, direction: Direction): number {
    const sign = direction === "LONG" ? -1 : 1;
    switch (rule.type) {
      case "FIXED_POINTS":
        return entryPrice + sign * rule.points;
      case "PERCENTAGE":
        return entryPrice * (1 + (sign * rule.percent) / 100);
      case "ATR_MULTIPLE": {
        const atrSeries = evaluateExpressionSeries(
          { type: "indicator", indicator: "ATR", parameters: { period: rule.period } },
          ctx,
        );
        return entryPrice + sign * rule.multiplier * atrSeries[entryIndex];
      }
      case "PREVIOUS_SWING": {
        const reference = direction === "LONG" ? "PREVIOUS_SWING_LOW" : "PREVIOUS_SWING_HIGH";
        const series = evaluateExpressionSeries({ type: "reference", reference, parameters: { lookback: rule.lookback } }, ctx);
        return series[entryIndex];
      }
      case "FIXED_PRICE":
        return rule.price;
    }
  }

  calculateTarget(rule: TakeProfitRule, entryPrice: number, stopPrice: number, direction: Direction): number {
    const sign = direction === "LONG" ? 1 : -1;
    switch (rule.type) {
      case "FIXED_POINTS":
        return entryPrice + sign * rule.points;
      case "PERCENTAGE":
        return entryPrice * (1 + (sign * rule.percent) / 100);
      case "R_MULTIPLE": {
        const risk = Math.abs(entryPrice - stopPrice);
        return entryPrice + sign * rule.multiple * risk;
      }
      case "FIXED_PRICE":
        return rule.price;
    }
  }

  // Deliberately reuses the existing risk domain (src/domain/risk) rather
  // than reimplementing risk-based sizing — per the explicit instruction
  // not to duplicate risk calculations.
  calculatePositionSize(
    config: PositionSizingConfig,
    params: { accountSize: number; entryPrice: number; stopPrice: number; lotSize?: number },
  ): PositionSizeOutcome {
    const lotSize = new Decimal(params.lotSize ?? 1);
    const riskPerUnit = new Decimal(Math.abs(params.entryPrice - params.stopPrice));

    switch (config.type) {
      case "FIXED_QUANTITY":
        return { quantity: config.quantity, riskAmount: null, isValidLotSize: true };
      case "FIXED_CAPITAL": {
        const quantity = config.capital / params.entryPrice;
        return { quantity, riskAmount: null, isValidLotSize: true };
      }
      case "RISK_PERCENT": {
        const riskAmount = calculateRiskAmount(new Decimal(params.accountSize), new Decimal(config.percent));
        const sizing = calculateRiskBasedSize(riskAmount, riskPerUnit, lotSize);
        return { quantity: sizing.quantity, riskAmount: riskAmount.toNumber(), isValidLotSize: sizing.isValidLotSize };
      }
      case "RISK_AMOUNT": {
        const riskAmount = new Decimal(config.amount);
        const sizing = calculateRiskBasedSize(riskAmount, riskPerUnit, lotSize);
        return { quantity: sizing.quantity, riskAmount: riskAmount.toNumber(), isValidLotSize: sizing.isValidLotSize };
      }
    }
  }
}

export function getStrategyInterpreter(): StrategyInterpreter {
  return new DefaultStrategyInterpreter();
}
