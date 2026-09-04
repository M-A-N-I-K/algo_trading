import { atr, bollingerBands, ema, macd, rsi, sma, vwap } from "@/indicators";
import { OHLC } from "@/indicators/utils";
import { Condition, ConditionNode } from "./conditions";
import { Expression, IndicatorExpression, PriceField, ReferenceExpression } from "./expressions";
import { getReferenceDefinition } from "./expressionRegistry";

const DAY_MS = 24 * 60 * 60 * 1000;

// Precomputes/caches per-expression series across a full evaluation run.
// Keyed by a canonical JSON encoding of the expression, so e.g. "EMA(20)"
// referenced from three different conditions is only computed once.
export interface EvaluationContext {
  ohlc: OHLC[];
  cache: Map<string, number[]>;
}

export function createEvaluationContext(ohlc: OHLC[]): EvaluationContext {
  return { ohlc, cache: new Map() };
}

function priceField(candle: OHLC, field: PriceField): number {
  switch (field) {
    case "OPEN":
      return candle.open;
    case "HIGH":
      return candle.high;
    case "LOW":
      return candle.low;
    case "CLOSE":
      return candle.close;
    case "TYPICAL":
      return (candle.high + candle.low + candle.close) / 3;
  }
}

function minutesSinceMidnightUtc(epochMs: number): number {
  const d = new Date(epochMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Session/day boundaries use UTC, matching this codebase's existing
// convention (see src/indicators/vwap.ts's session anchor).
function utcDayKey(epochMs: number): number {
  return Math.floor(epochMs / DAY_MS);
}

function evaluateReferenceSeries(expr: ReferenceExpression, ctx: EvaluationContext): number[] {
  const { ohlc } = ctx;
  const n = ohlc.length;
  const result = new Array<number>(n).fill(NaN);
  const def = getReferenceDefinition(expr.reference);
  const params = { ...Object.fromEntries(def.parameters.map((p) => [p.name, p.default])), ...expr.parameters };

  if (expr.reference === "OPENING_RANGE_HIGH" || expr.reference === "OPENING_RANGE_LOW") {
    const minutes = params.minutes;
    let day = -1;
    let rangeHigh = -Infinity;
    let rangeLow = Infinity;
    let rangeClosed = false;
    let dayStartMs = 0;

    for (let i = 0; i < n; i++) {
      const candle = ohlc[i];
      const candleDay = utcDayKey(candle.openTime);
      if (candleDay !== day) {
        day = candleDay;
        rangeHigh = -Infinity;
        rangeLow = Infinity;
        rangeClosed = false;
        dayStartMs = day * DAY_MS;
      }
      const minutesIntoDay = (candle.openTime - dayStartMs) / 60000;
      if (minutesIntoDay < minutes) {
        rangeHigh = Math.max(rangeHigh, candle.high);
        rangeLow = Math.min(rangeLow, candle.low);
      } else {
        rangeClosed = true;
      }
      result[i] = rangeClosed ? (expr.reference === "OPENING_RANGE_HIGH" ? rangeHigh : rangeLow) : NaN;
    }
    return result;
  }

  if (expr.reference === "PREVIOUS_DAY_HIGH" || expr.reference === "PREVIOUS_DAY_LOW" || expr.reference === "PREVIOUS_DAY_CLOSE") {
    // First pass: aggregate each day's H/L/C.
    const dayAgg = new Map<number, { high: number; low: number; close: number }>();
    for (const candle of ohlc) {
      const day = utcDayKey(candle.openTime);
      const agg = dayAgg.get(day);
      if (!agg) {
        dayAgg.set(day, { high: candle.high, low: candle.low, close: candle.close });
      } else {
        agg.high = Math.max(agg.high, candle.high);
        agg.low = Math.min(agg.low, candle.low);
        agg.close = candle.close; // last close seen for the day, in series order
      }
    }
    const days = [...dayAgg.keys()].sort((a, b) => a - b);
    let prevDayIdx = -1;
    for (let i = 0; i < n; i++) {
      const day = utcDayKey(ohlc[i].openTime);
      while (prevDayIdx + 1 < days.length && days[prevDayIdx + 1] < day) prevDayIdx++;
      const prevDay = prevDayIdx >= 0 ? days[prevDayIdx] : undefined;
      if (prevDay !== undefined && prevDay < day) {
        const agg = dayAgg.get(prevDay)!;
        result[i] = expr.reference === "PREVIOUS_DAY_HIGH" ? agg.high : expr.reference === "PREVIOUS_DAY_LOW" ? agg.low : agg.close;
      }
    }
    return result;
  }

  // PREVIOUS_SWING_HIGH / PREVIOUS_SWING_LOW — a confirmed fractal swing
  // point (lookback bars on both sides), carried forward until superseded.
  const lookback = params.lookback;
  let lastSwingHigh = NaN;
  let lastSwingLow = NaN;
  for (let i = 0; i < n; i++) {
    const revealIdx = i - lookback;
    if (revealIdx >= lookback) {
      let isHigh = true;
      let isLow = true;
      for (let j = revealIdx - lookback; j <= revealIdx + lookback; j++) {
        if (j === revealIdx || j < 0 || j >= n) continue;
        if (ohlc[j].high >= ohlc[revealIdx].high) isHigh = false;
        if (ohlc[j].low <= ohlc[revealIdx].low) isLow = false;
      }
      if (isHigh) lastSwingHigh = ohlc[revealIdx].high;
      if (isLow) lastSwingLow = ohlc[revealIdx].low;
    }
    result[i] = expr.reference === "PREVIOUS_SWING_HIGH" ? lastSwingHigh : lastSwingLow;
  }
  return result;
}

function evaluateIndicatorSeries(expr: IndicatorExpression, ctx: EvaluationContext): number[] {
  const sourceExpr: Expression = expr.source ?? { type: "price", field: "CLOSE" };
  const source = expr.indicator === "ATR" || expr.indicator === "VWAP" ? null : evaluateExpressionSeries(sourceExpr, ctx);

  switch (expr.indicator) {
    case "SMA":
      return sma(source!, expr.parameters.period ?? 20);
    case "EMA":
      return ema(source!, expr.parameters.period ?? 20);
    case "RSI":
      return rsi(source!, expr.parameters.period ?? 14);
    case "ATR":
      return atr(ctx.ohlc, expr.parameters.period ?? 14);
    case "VWAP":
      return vwap(ctx.ohlc);
    case "MACD": {
      const { macdLine, signalLine, histogram } = macd(
        source!,
        expr.parameters.fastPeriod ?? 12,
        expr.parameters.slowPeriod ?? 26,
        expr.parameters.signalPeriod ?? 9,
      );
      return expr.output === "signalLine" ? signalLine : expr.output === "histogram" ? histogram : macdLine;
    }
    case "BOLLINGER_BANDS": {
      const { upper, middle, lower } = bollingerBands(source!, expr.parameters.period ?? 20, expr.parameters.stdDevMultiplier ?? 2);
      return expr.output === "upper" ? upper : expr.output === "lower" ? lower : middle;
    }
  }
}

// Computes the full series for any Expression, caching by a canonical
// JSON key so the same expression referenced multiple times in a strategy
// (e.g. EMA(20) used in both an entry condition and a chart overlay) is
// only computed once per evaluation run.
export function evaluateExpressionSeries(expr: Expression, ctx: EvaluationContext): number[] {
  const key = JSON.stringify(expr);
  const cached = ctx.cache.get(key);
  if (cached) return cached;

  let result: number[];
  switch (expr.type) {
    case "price":
      result = ctx.ohlc.map((c) => priceField(c, expr.field));
      break;
    case "volume":
      result = ctx.ohlc.map((c) => c.volume);
      break;
    case "constant":
      result = ctx.ohlc.map(() => expr.value);
      break;
    case "time":
      result = ctx.ohlc.map((c) => minutesSinceMidnightUtc(c.openTime));
      break;
    case "dayOfWeek":
      result = ctx.ohlc.map((c) => new Date(c.openTime).getUTCDay());
      break;
    case "indicator":
      result = evaluateIndicatorSeries(expr, ctx);
      break;
    case "reference":
      result = evaluateReferenceSeries(expr, ctx);
      break;
  }

  ctx.cache.set(key, result);
  return result;
}

// Evaluates a single Condition at bar `t`. NaN inputs (warmup periods,
// references not yet available) naturally fail every comparison operator
// in JS (`NaN > x` is always false) — no special-casing needed, and it
// gives the semantically correct behavior: "not enough data yet" never
// spuriously fires a signal.
export function evaluateCondition(condition: Condition, ctx: EvaluationContext, t: number): boolean {
  const leftSeries = evaluateExpressionSeries(condition.left, ctx);
  const leftNow = leftSeries[t];
  const leftPrev = t > 0 ? leftSeries[t - 1] : NaN;

  let result: boolean;

  if (condition.operator === "IS_RISING") {
    result = leftNow > leftPrev;
  } else if (condition.operator === "IS_FALLING") {
    result = leftNow < leftPrev;
  } else {
    const rightSeries = condition.right ? evaluateExpressionSeries(condition.right, ctx) : null;
    const rightNow = rightSeries ? rightSeries[t] : NaN;
    const rightPrev = rightSeries && t > 0 ? rightSeries[t - 1] : NaN;

    switch (condition.operator) {
      case "EQUALS":
        result = leftNow === rightNow;
        break;
      case "NOT_EQUALS":
        result = leftNow !== rightNow;
        break;
      case "GREATER_THAN":
        result = leftNow > rightNow;
        break;
      case "GREATER_THAN_OR_EQUAL":
        result = leftNow >= rightNow;
        break;
      case "LESS_THAN":
        result = leftNow < rightNow;
        break;
      case "LESS_THAN_OR_EQUAL":
        result = leftNow <= rightNow;
        break;
      case "CROSSES_ABOVE":
        result = leftPrev <= rightPrev && leftNow > rightNow;
        break;
      case "CROSSES_BELOW":
        result = leftPrev >= rightPrev && leftNow < rightNow;
        break;
      default:
        result = false;
    }
  }

  return condition.negate ? !result : result;
}

// Evaluates a full condition tree (Condition | ConditionGroup) at bar `t`.
// An empty group evaluates to false regardless of AND/OR — an incomplete
// rule should never silently signal true.
export function evaluateConditionNode(node: ConditionNode, ctx: EvaluationContext, t: number): boolean {
  if (node.type === "condition") return evaluateCondition(node, ctx, t);

  if (node.conditions.length === 0) return node.negate ? true : false;

  const results = node.conditions.map((child) => evaluateConditionNode(child, ctx, t));
  const result = node.operator === "AND" ? results.every(Boolean) : results.some(Boolean);
  return node.negate ? !result : result;
}
