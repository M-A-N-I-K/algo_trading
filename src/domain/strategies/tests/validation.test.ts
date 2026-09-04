import { describe, expect, it } from "vitest";
import { StrategyDefinition } from "../definition";
import { getTemplate } from "../templates";
import { validateStrategyDefinition } from "../validation";

function validDefinition(): StrategyDefinition {
  // Deep-clone so tests can freely mutate without affecting other tests.
  return JSON.parse(JSON.stringify(getTemplate("opening_range_breakout")!.build()));
}

describe("strategy validation — valid strategy", () => {
  it("a fully configured strategy is READY with no issues", () => {
    const result = validateStrategyDefinition(validDefinition());
    expect(result.isReady).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });
});

describe("strategy validation — missing entry", () => {
  it("rejects a strategy with no entry conditions on the required side", () => {
    const def = validDefinition();
    def.entry.long = undefined;
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.path === "entry")).toBe(true);
  });

  it("rejects an entry with an empty condition group", () => {
    const def = validDefinition();
    def.entry.long!.conditions = { type: "group", id: "g", operator: "AND", negate: false, conditions: [] };
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.message.includes("empty"))).toBe(true);
  });
});

describe("strategy validation — invalid indicator parameters", () => {
  it("rejects an EMA period of 0", () => {
    const def = validDefinition();
    def.entry.long!.conditions = {
      type: "group",
      id: "g",
      operator: "AND",
      negate: false,
      conditions: [
        {
          type: "condition",
          id: "c",
          negate: false,
          left: { type: "indicator", indicator: "EMA", parameters: { period: 0 } },
          operator: "GREATER_THAN",
          right: { type: "constant", value: 100 },
        },
      ],
    };
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.message.includes("EMA") && i.message.includes("greater than 0"))).toBe(true);
  });
});

describe("strategy validation — invalid risk", () => {
  it("rejects risk-percent sizing above the configured maximum", () => {
    const def = validDefinition();
    def.positionSizing = { type: "RISK_PERCENT", percent: 5 };
    def.risk.maxRiskPerTradePercent = 2;
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.message.includes("account risk limit"))).toBe(true);
  });

  it("accepts risk-percent sizing within the configured maximum", () => {
    const def = validDefinition();
    def.positionSizing = { type: "RISK_PERCENT", percent: 1 };
    def.risk.maxRiskPerTradePercent = 2;
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(true);
  });
});

describe("strategy validation — missing stop loss", () => {
  it("rejects a strategy with no stop-loss configured", () => {
    const def = validDefinition();
    def.exit.stopLoss = undefined;
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.path === "exit.stopLoss")).toBe(true);
  });
});

describe("strategy validation — missing name/instrument", () => {
  it("rejects an empty strategy name", () => {
    const def = validDefinition();
    def.metadata.name = "";
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.path === "metadata.name")).toBe(true);
  });

  it("rejects an empty symbol", () => {
    const def = validDefinition();
    def.market.symbol = "";
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.path === "market.symbol")).toBe(true);
  });
});

describe("strategy validation — binary operator requires a right-hand value", () => {
  it("rejects a GREATER_THAN condition with no right expression", () => {
    const def = validDefinition();
    def.entry.long!.conditions = {
      type: "group",
      id: "g",
      operator: "AND",
      negate: false,
      conditions: [{ type: "condition", id: "c", negate: false, left: { type: "price", field: "CLOSE" }, operator: "GREATER_THAN" }],
    };
    const result = validateStrategyDefinition(def);
    expect(result.isReady).toBe(false);
    expect(result.issues.some((i) => i.message.includes("right-hand value"))).toBe(true);
  });

  it("allows a unary operator (IS_RISING) with no right expression", () => {
    const def = validDefinition();
    def.entry.long!.conditions = {
      type: "group",
      id: "g",
      operator: "AND",
      negate: false,
      conditions: [{ type: "condition", id: "c", negate: false, left: { type: "price", field: "CLOSE" }, operator: "IS_RISING" }],
    };
    const result = validateStrategyDefinition(def);
    expect(result.issues.some((i) => i.message.includes("right-hand value"))).toBe(false);
  });
});
