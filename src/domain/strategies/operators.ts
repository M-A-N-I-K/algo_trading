import { z } from "zod";
import { ExpressionKind } from "./expressions";

export const OperatorIdSchema = z.enum([
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "CROSSES_ABOVE",
  "CROSSES_BELOW",
  "IS_RISING",
  "IS_FALLING",
]);
export type OperatorId = z.infer<typeof OperatorIdSchema>;

export interface OperatorDefinition {
  id: OperatorId;
  label: string;
  // Unary operators (IS_RISING/IS_FALLING) only need `left` — the
  // condition builder hides the right-hand expression picker for these.
  arity: "unary" | "binary";
  // Which expression kinds make sense on the left-hand side. Constants
  // don't move over time, so "is rising"/"crosses above" on a constant is
  // meaningless — the UI filters the operator dropdown using this.
  supportedLeftKinds: ExpressionKind[] | "all";
}

const TIME_SERIES_KINDS: ExpressionKind[] = ["price", "volume", "indicator", "reference"];

// The Operator Registry — the condition builder reads this instead of a
// hardcoded switch to decide which operators to offer for a given
// left-hand expression, and whether to render a right-hand picker at all.
export const OPERATOR_REGISTRY: Record<OperatorId, OperatorDefinition> = {
  EQUALS: { id: "EQUALS", label: "equals", arity: "binary", supportedLeftKinds: "all" },
  NOT_EQUALS: { id: "NOT_EQUALS", label: "not equals", arity: "binary", supportedLeftKinds: "all" },
  GREATER_THAN: { id: "GREATER_THAN", label: "greater than", arity: "binary", supportedLeftKinds: "all" },
  GREATER_THAN_OR_EQUAL: { id: "GREATER_THAN_OR_EQUAL", label: "greater than or equal", arity: "binary", supportedLeftKinds: "all" },
  LESS_THAN: { id: "LESS_THAN", label: "less than", arity: "binary", supportedLeftKinds: "all" },
  LESS_THAN_OR_EQUAL: { id: "LESS_THAN_OR_EQUAL", label: "less than or equal", arity: "binary", supportedLeftKinds: "all" },
  CROSSES_ABOVE: { id: "CROSSES_ABOVE", label: "crosses above", arity: "binary", supportedLeftKinds: TIME_SERIES_KINDS },
  CROSSES_BELOW: { id: "CROSSES_BELOW", label: "crosses below", arity: "binary", supportedLeftKinds: TIME_SERIES_KINDS },
  IS_RISING: { id: "IS_RISING", label: "is rising", arity: "unary", supportedLeftKinds: TIME_SERIES_KINDS },
  IS_FALLING: { id: "IS_FALLING", label: "is falling", arity: "unary", supportedLeftKinds: TIME_SERIES_KINDS },
};

export function getOperatorDefinition(id: OperatorId): OperatorDefinition {
  return OPERATOR_REGISTRY[id];
}

export function listOperators(): OperatorDefinition[] {
  return Object.values(OPERATOR_REGISTRY);
}

export function operatorsSupportingLeft(kind: ExpressionKind): OperatorDefinition[] {
  return listOperators().filter((op) => op.supportedLeftKinds === "all" || op.supportedLeftKinds.includes(kind));
}
