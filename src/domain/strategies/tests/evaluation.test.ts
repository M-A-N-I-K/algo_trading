import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { createEvaluationContext, evaluateCondition, evaluateConditionNode, evaluateExpressionSeries } from "../evaluation";
import { Condition, ConditionGroup } from "../conditions";
import { Expression } from "../expressions";

const HOUR_MS = 60 * 60 * 1000;

// Builds a simple OHLC series from a list of close prices; open/high/low
// derived trivially, volume fixed unless overridden.
function buildOhlc(closes: number[], volumes?: number[]): OHLC[] {
  return closes.map((close, i) => ({
    openTime: i * HOUR_MS,
    closeTime: i * HOUR_MS,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: volumes?.[i] ?? 1000,
  }));
}

function cond(left: Expression, operator: Condition["operator"], right?: Expression, negate = false): Condition {
  return { type: "condition", id: "c1", negate, left, operator, right };
}

function group(operator: "AND" | "OR", conditions: ConditionGroup["conditions"], negate = false): ConditionGroup {
  return { type: "group", id: "g1", operator, negate, conditions };
}

const CLOSE: Expression = { type: "price", field: "CLOSE" };

describe("expressions", () => {
  it("price expression returns the raw close series", () => {
    const ohlc = buildOhlc([10, 20, 30]);
    const ctx = createEvaluationContext(ohlc);
    expect(evaluateExpressionSeries(CLOSE, ctx)).toEqual([10, 20, 30]);
  });

  it("volume expression returns the raw volume series", () => {
    const ohlc = buildOhlc([1, 2, 3], [100, 200, 300]);
    const ctx = createEvaluationContext(ohlc);
    expect(evaluateExpressionSeries({ type: "volume" }, ctx)).toEqual([100, 200, 300]);
  });

  it("constant expression is the same value at every bar", () => {
    const ohlc = buildOhlc([1, 2, 3]);
    const ctx = createEvaluationContext(ohlc);
    expect(evaluateExpressionSeries({ type: "constant", value: 42 }, ctx)).toEqual([42, 42, 42]);
  });

  it("indicator expression (SMA) produces a non-NaN value once warmed up", () => {
    const ohlc = buildOhlc([1, 2, 3, 4, 5]);
    const ctx = createEvaluationContext(ohlc);
    const series = evaluateExpressionSeries({ type: "indicator", indicator: "SMA", parameters: { period: 3 } }, ctx);
    expect(series[1]).toBeNaN();
    expect(series[2]).toBeCloseTo(2, 5); // avg(1,2,3)
    expect(series[4]).toBeCloseTo(4, 5); // avg(3,4,5)
  });

  it("caches repeated evaluations of the same expression", () => {
    const ohlc = buildOhlc([1, 2, 3]);
    const ctx = createEvaluationContext(ohlc);
    const expr: Expression = { type: "indicator", indicator: "EMA", parameters: { period: 2 } };
    const first = evaluateExpressionSeries(expr, ctx);
    const second = evaluateExpressionSeries({ ...expr }, ctx); // structurally identical, different object
    expect(second).toBe(first); // same cached array reference
  });
});

describe("conditions — comparison operators", () => {
  it("greater than", () => {
    const ohlc = buildOhlc([1]);
    const ctx = createEvaluationContext(ohlc);
    const c = cond({ type: "constant", value: 10 }, "GREATER_THAN", { type: "constant", value: 5 });
    expect(evaluateCondition(c, ctx, 0)).toBe(true);
  });

  it("less than", () => {
    const ohlc = buildOhlc([1]);
    const ctx = createEvaluationContext(ohlc);
    const c = cond({ type: "constant", value: 3 }, "LESS_THAN", { type: "constant", value: 5 });
    expect(evaluateCondition(c, ctx, 0)).toBe(true);
  });

  it("crosses above: close moving from below to above a constant", () => {
    const ohlc = buildOhlc([95, 98, 102, 105]);
    const ctx = createEvaluationContext(ohlc);
    const c = cond(CLOSE, "CROSSES_ABOVE", { type: "constant", value: 100 });
    expect(evaluateCondition(c, ctx, 0)).toBe(false); // no previous bar
    expect(evaluateCondition(c, ctx, 1)).toBe(false); // 98 -> still below
    expect(evaluateCondition(c, ctx, 2)).toBe(true); // 98 -> 102: crosses above 100
    expect(evaluateCondition(c, ctx, 3)).toBe(false); // 102 -> 105: already above, not a fresh cross
  });

  it("crosses below: close moving from above to below a constant", () => {
    const ohlc = buildOhlc([105, 102, 98, 95]);
    const ctx = createEvaluationContext(ohlc);
    const c = cond(CLOSE, "CROSSES_BELOW", { type: "constant", value: 100 });
    expect(evaluateCondition(c, ctx, 2)).toBe(true); // 102 -> 98: crosses below 100
    expect(evaluateCondition(c, ctx, 3)).toBe(false); // already below
  });

  it("is rising / is falling", () => {
    const ohlc = buildOhlc([10, 20, 15]);
    const ctx = createEvaluationContext(ohlc);
    expect(evaluateCondition(cond(CLOSE, "IS_RISING"), ctx, 1)).toBe(true); // 10 -> 20
    expect(evaluateCondition(cond(CLOSE, "IS_FALLING"), ctx, 2)).toBe(true); // 20 -> 15
    expect(evaluateCondition(cond(CLOSE, "IS_RISING"), ctx, 2)).toBe(false);
  });

  it("negate flips the result", () => {
    const ohlc = buildOhlc([1]);
    const ctx = createEvaluationContext(ohlc);
    const c = cond({ type: "constant", value: 10 }, "GREATER_THAN", { type: "constant", value: 5 }, true);
    expect(evaluateCondition(c, ctx, 0)).toBe(false);
  });

  it("NaN inputs (warmup) never spuriously satisfy a condition", () => {
    const ohlc = buildOhlc([1, 2, 3]);
    const ctx = createEvaluationContext(ohlc);
    const c = cond({ type: "indicator", indicator: "SMA", parameters: { period: 5 } }, "GREATER_THAN", { type: "constant", value: 0 });
    expect(evaluateCondition(c, ctx, 0)).toBe(false);
  });
});

describe("groups — AND / OR / NOT / nested", () => {
  const ohlc = buildOhlc([1]);
  const ctx = createEvaluationContext(ohlc);
  const T = cond({ type: "constant", value: 1 }, "EQUALS", { type: "constant", value: 1 }); // always true
  const F = cond({ type: "constant", value: 1 }, "EQUALS", { type: "constant", value: 2 }); // always false

  it("AND requires every condition", () => {
    expect(evaluateConditionNode(group("AND", [T, T]), ctx, 0)).toBe(true);
    expect(evaluateConditionNode(group("AND", [T, F]), ctx, 0)).toBe(false);
  });

  it("OR requires at least one condition", () => {
    expect(evaluateConditionNode(group("OR", [F, F]), ctx, 0)).toBe(false);
    expect(evaluateConditionNode(group("OR", [F, T]), ctx, 0)).toBe(true);
  });

  it("NOT negates the group result", () => {
    expect(evaluateConditionNode(group("AND", [T], true), ctx, 0)).toBe(false);
    expect(evaluateConditionNode(group("AND", [F], true), ctx, 0)).toBe(true);
  });

  it("nested groups evaluate recursively", () => {
    // (T AND F) OR (T AND T) -> false OR true -> true
    const nested = group("OR", [group("AND", [T, F]), group("AND", [T, T])]);
    expect(evaluateConditionNode(nested, ctx, 0)).toBe(true);
  });

  it("an empty group never evaluates true", () => {
    expect(evaluateConditionNode(group("AND", []), ctx, 0)).toBe(false);
    expect(evaluateConditionNode(group("OR", []), ctx, 0)).toBe(false);
  });
});
