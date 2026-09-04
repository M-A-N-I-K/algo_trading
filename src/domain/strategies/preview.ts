import { ConditionNode, Condition } from "./conditions";
import { StrategyDefinition } from "./definition";
import { Expression } from "./expressions";
import { PRICE_FIELD_LABELS, getReferenceDefinition } from "./expressionRegistry";
import { getIndicatorDefinition } from "./indicators";
import { getOperatorDefinition } from "./operators";
import { PositionSizingConfig } from "./positionSizing";
import { StopLossRule, TakeProfitRule } from "./entryExit";

// Every string in this module is *derived* from the StrategyDefinition —
// there is no second, manually-maintained copy of the strategy's meaning.
// If the definition changes, calling these functions again is the only
// thing needed to keep the preview in sync.

export function describeExpression(expr: Expression): string {
  switch (expr.type) {
    case "price":
      return PRICE_FIELD_LABELS[expr.field];
    case "volume":
      return "Volume";
    case "constant":
      return formatNumber(expr.value);
    case "time":
      return "Time of Day";
    case "dayOfWeek":
      return "Day of Week";
    case "reference":
      return getReferenceDefinition(expr.reference).label;
    case "indicator": {
      const def = getIndicatorDefinition(expr.indicator);
      const isDefaultSource = !expr.source || (expr.source.type === "price" && expr.source.field === "CLOSE");
      const sourcePart = def.requiresSource && !isDefaultSource ? `${describeExpression(expr.source!)}, ` : "";
      const paramsPart = def.parameters.map((p) => formatNumber(expr.parameters[p.name] ?? p.default)).join(", ");
      const outputDef = expr.output ? def.outputs.find((o) => o.id === expr.output) : undefined;
      const outputSuffix = outputDef && def.outputs.length > 1 ? ` (${outputDef.label})` : "";
      return `${def.label}(${sourcePart}${paramsPart})${outputSuffix}`;
    }
  }
}

export function describeCondition(condition: Condition): string {
  const opDef = getOperatorDefinition(condition.operator);
  const prefix = condition.negate ? "NOT " : "";
  const left = describeExpression(condition.left);
  if (opDef.arity === "unary") return `${prefix}${left} ${opDef.label}`;
  const right = condition.right ? describeExpression(condition.right) : "(missing value)";
  return `${prefix}${left} ${opDef.label} ${right}`;
}

export function describeConditionNode(node: ConditionNode): string {
  if (node.type === "condition") return describeCondition(node);

  const prefix = node.negate ? "NOT " : "";
  if (node.conditions.length === 0) return `${prefix}(empty group)`;
  if (node.conditions.length === 1) return `${prefix}${describeConditionNode(node.conditions[0])}`;

  const parts = node.conditions.map(describeConditionNode);
  return `${prefix}(${parts.join(` ${node.operator} `)})`;
}

export function describeStopLoss(rule: StopLossRule): string {
  switch (rule.type) {
    case "FIXED_POINTS":
      return `${formatNumber(rule.points)} points`;
    case "PERCENTAGE":
      return `${formatNumber(rule.percent)}%`;
    case "ATR_MULTIPLE":
      return `${formatNumber(rule.multiplier)} ATR(${rule.period})`;
    case "PREVIOUS_SWING":
      return `Previous swing (${rule.lookback}-bar lookback)`;
    case "FIXED_PRICE":
      return `Fixed price ${formatNumber(rule.price)}`;
  }
}

export function describeTakeProfit(rule: TakeProfitRule): string {
  switch (rule.type) {
    case "FIXED_POINTS":
      return `${formatNumber(rule.points)} points`;
    case "PERCENTAGE":
      return `${formatNumber(rule.percent)}%`;
    case "R_MULTIPLE":
      return `${formatNumber(rule.multiple)}R`;
    case "FIXED_PRICE":
      return `Fixed price ${formatNumber(rule.price)}`;
  }
}

export function describePositionSizing(config: PositionSizingConfig): string {
  switch (config.type) {
    case "FIXED_QUANTITY":
      return `${formatNumber(config.quantity)} units`;
    case "FIXED_CAPITAL":
      return `${formatNumber(config.capital)} capital`;
    case "RISK_PERCENT":
      return `${formatNumber(config.percent)}% of account`;
    case "RISK_AMOUNT":
      return `${formatNumber(config.amount)} risk`;
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export interface StrategySummary {
  title: string;
  directionLabel: string;
  entryLong: string | null;
  entryShort: string | null;
  stop: string | null;
  target: string | null;
  timeExit: string | null;
  signalExit: string | null;
  positionSizing: string;
  session: string | null;
  // Only populated when it's actually derivable from the configured rules
  // (take-profit expressed as an R-multiple) — never an approximation, and
  // never a backtest statistic (see the module-level note below).
  estimatedRiskReward: string | null;
}

const DIRECTION_LABELS: Record<StrategyDefinition["direction"], string> = {
  LONG_ONLY: "LONG ONLY",
  SHORT_ONLY: "SHORT ONLY",
  LONG_AND_SHORT: "LONG + SHORT",
};

// This function describes the CONFIGURED RULES only. It must never surface
// a performance statistic (win rate, profit factor, ...) — those only
// exist once the backtesting engine has actually run, and belong to a
// BacktestResult, not a StrategyDefinition summary.
export function summarizeStrategy(definition: StrategyDefinition): StrategySummary {
  return {
    title: `${definition.market.symbol} ${definition.metadata.name || "(unnamed strategy)"}`.trim(),
    directionLabel: DIRECTION_LABELS[definition.direction],
    entryLong: definition.entry.long ? describeConditionNode(definition.entry.long.conditions) : null,
    entryShort: definition.entry.short ? describeConditionNode(definition.entry.short.conditions) : null,
    stop: definition.exit.stopLoss ? describeStopLoss(definition.exit.stopLoss) : null,
    target: definition.exit.takeProfit ? describeTakeProfit(definition.exit.takeProfit) : null,
    timeExit: definition.exit.timeExit ? definition.exit.timeExit.time : null,
    signalExit: definition.exit.signalExit ? describeConditionNode(definition.exit.signalExit.conditions) : null,
    positionSizing: describePositionSizing(definition.positionSizing),
    session: definition.session
      ? `${definition.session.startTime ?? "open"}–${definition.session.endTime ?? "close"}`
      : null,
    estimatedRiskReward: definition.exit.takeProfit?.type === "R_MULTIPLE" ? `1:${formatNumber(definition.exit.takeProfit.multiple)}` : null,
  };
}

// Renders the box-drawing plain-text preview shown in the builder's
// preview panel.
export function renderStrategyPreviewText(definition: StrategyDefinition): string {
  const s = summarizeStrategy(definition);
  const divider = "━".repeat(24);
  const lines: string[] = [divider, s.title, "", s.directionLabel, ""];

  if (s.entryLong) lines.push("ENTRY LONG", `When ${s.entryLong}`, "");
  if (s.entryShort) lines.push("ENTRY SHORT", `When ${s.entryShort}`, "");

  if (s.stop) lines.push("STOP", s.stop, "");
  if (s.target) lines.push("TARGET", s.target, "");
  if (s.timeExit) lines.push("TIME EXIT", s.timeExit, "");
  if (s.signalExit) lines.push("SIGNAL EXIT", s.signalExit, "");

  lines.push("RISK", s.positionSizing, "");
  if (s.estimatedRiskReward) lines.push("ESTIMATED R:R", s.estimatedRiskReward, "");
  if (s.session) lines.push("SESSION", s.session, "");

  lines.push(divider);
  return lines.join("\n");
}
