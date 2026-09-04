import { ConditionNode } from "./conditions";
import { StrategyDefinition } from "./definition";
import { Expression } from "./expressions";
import { getIndicatorDefinition } from "./indicators";
import { getOperatorDefinition } from "./operators";

export interface StrategyValidationIssue {
  path: string;
  message: string;
}

export interface StrategyValidationCheck {
  id: string;
  label: string;
  passed: boolean;
}

export interface StrategyValidationResult {
  isReady: boolean;
  issues: StrategyValidationIssue[];
  checks: StrategyValidationCheck[];
}

// This validator assumes `definition` already conforms to
// StrategyDefinitionSchema (structural correctness — types, positive
// numbers, required discriminant fields) — Zod already guarantees that at
// the API/form boundary, for BOTH draft and ready strategies alike (a
// period of 0 is never meaningful, draft or not).
//
// What this checks instead is completeness/business-rule validity: is
// there enough here to actually trade? Per the Draft/Ready model, a DRAFT
// can be incomplete; only a definition that passes every check here is
// allowed to become READY.
export function validateStrategyDefinition(definition: StrategyDefinition): StrategyValidationResult {
  const issues: StrategyValidationIssue[] = [];
  const checks: StrategyValidationCheck[] = [];

  const pushCheck = (id: string, label: string, passed: boolean, path: string, message: string) => {
    checks.push({ id, label, passed });
    if (!passed) issues.push({ path, message });
  };

  pushCheck("name", "Strategy name set", definition.metadata.name.trim().length > 0, "metadata.name", "Strategy name is required.");
  pushCheck("instrument", "Instrument selected", definition.market.symbol.trim().length > 0, "market.symbol", "An instrument/symbol is required.");
  pushCheck("timeframe", "Timeframe selected", !!definition.timeframe, "timeframe", "A timeframe is required.");

  // --- Entry -----------------------------------------------------------
  const longConfigured = !!definition.entry.long && hasAtLeastOneCondition(definition.entry.long.conditions);
  const shortConfigured = !!definition.entry.short && hasAtLeastOneCondition(definition.entry.short.conditions);
  let entryOk: boolean;
  if (definition.direction === "LONG_ONLY") entryOk = longConfigured;
  else if (definition.direction === "SHORT_ONLY") entryOk = shortConfigured;
  else entryOk = longConfigured || shortConfigured;
  pushCheck("entry", "Entry conditions valid", entryOk, "entry", "Strategy must contain at least one entry condition.");

  // --- Structural condition-tree checks (not covered by the Expression
  // schema, since "right is required for binary operators" and "group
  // must be non-empty" are cross-field business rules) ------------------
  const validateTree = (node: ConditionNode, path: string) => {
    if (node.type === "condition") {
      const opDef = getOperatorDefinition(node.operator);
      if (opDef.arity === "binary" && !node.right) {
        issues.push({ path, message: `"${opDef.label}" requires a right-hand value.` });
      }
      validateExpressionTree(node.left, `${path}.left`);
      if (node.right) validateExpressionTree(node.right, `${path}.right`);
    } else {
      if (node.conditions.length === 0) {
        issues.push({ path, message: "Condition group cannot be empty." });
      }
      node.conditions.forEach((child, i) => validateTree(child, `${path}.conditions[${i}]`));
    }
  };

  const validateExpressionTree = (expr: Expression, path: string) => {
    if (expr.type === "indicator") {
      const def = getIndicatorDefinition(expr.indicator);
      for (const paramDef of def.parameters) {
        const value = expr.parameters[paramDef.name];
        if (value === undefined || value <= 0 || (paramDef.min !== undefined && value < paramDef.min)) {
          issues.push({ path: `${path}.parameters.${paramDef.name}`, message: `${def.label} ${paramDef.label.toLowerCase()} must be greater than 0.` });
        }
      }
      if (expr.source) validateExpressionTree(expr.source, `${path}.source`);
    }
  };

  if (definition.entry.long) validateTree(definition.entry.long.conditions, "entry.long.conditions");
  if (definition.entry.short) validateTree(definition.entry.short.conditions, "entry.short.conditions");
  if (definition.exit.signalExit) validateTree(definition.exit.signalExit.conditions, "exit.signalExit.conditions");
  if (definition.filters) validateTree(definition.filters, "filters");

  // --- Stop loss ---------------------------------------------------------
  pushCheck(
    "stopLoss",
    "Stop loss configured",
    !!definition.exit.stopLoss,
    "exit.stopLoss",
    `A ${definition.direction === "SHORT_ONLY" ? "short" : "long"} strategy requires a valid stop-loss configuration.`,
  );

  // --- Take profit (recommended, not required — a strategy may exit
  // purely on signal/time) -------------------------------------------------
  checks.push({
    id: "takeProfit",
    label: "Take profit configured",
    passed: !!definition.exit.takeProfit,
  });

  // --- Position sizing -----------------------------------------------------
  pushCheck("positionSizing", "Position sizing configured", !!definition.positionSizing, "positionSizing", "Position sizing is required.");

  // --- Risk vs. configured maximum ------------------------------------------
  if (definition.risk.maxRiskPerTradePercent !== undefined) {
    const configuredRiskPercent =
      definition.positionSizing.type === "RISK_PERCENT" ? definition.positionSizing.percent : null;
    const riskOk = configuredRiskPercent === null || configuredRiskPercent <= definition.risk.maxRiskPerTradePercent;
    pushCheck(
      "riskLimit",
      "Risk within configured maximum",
      riskOk,
      "positionSizing",
      `Risk per trade cannot exceed the account risk limit (${definition.risk.maxRiskPerTradePercent}%).`,
    );
  } else {
    checks.push({ id: "riskLimit", label: "Risk within configured maximum", passed: true });
  }

  // --- Trading session (recommended, not required) ---------------------------
  checks.push({ id: "session", label: "Trading session specified", passed: !!definition.session });

  const isReady = issues.length === 0;
  return { isReady, issues, checks };
}

function hasAtLeastOneCondition(node: ConditionNode): boolean {
  if (node.type === "condition") return true;
  return node.conditions.length > 0 && node.conditions.some(hasAtLeastOneCondition);
}
