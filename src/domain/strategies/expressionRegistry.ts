import { ExpressionKind, PriceField, ReferenceId } from "./expressions";

export interface ExpressionKindDefinition {
  kind: ExpressionKind;
  label: string;
  description: string;
}

// Drives the top-level "what kind of value is this?" picker in
// ExpressionBuilder — the condition builder iterates this registry instead
// of a hardcoded list of expression-kind options.
export const EXPRESSION_KIND_REGISTRY: Record<ExpressionKind, ExpressionKindDefinition> = {
  price: { kind: "price", label: "Price", description: "A price field of the current bar (open/high/low/close/typical)." },
  volume: { kind: "volume", label: "Volume", description: "The current bar's traded volume." },
  indicator: { kind: "indicator", label: "Indicator", description: "The value of a configured indicator." },
  constant: { kind: "constant", label: "Fixed Number", description: "A fixed numeric value you enter." },
  time: { kind: "time", label: "Time of Day", description: "The current bar's time of day." },
  dayOfWeek: { kind: "dayOfWeek", label: "Day of Week", description: "The current bar's day of week." },
  reference: { kind: "reference", label: "Reference Level", description: "A calendar/session-relative price level." },
};

export function listExpressionKinds(): ExpressionKindDefinition[] {
  return Object.values(EXPRESSION_KIND_REGISTRY);
}

export const PRICE_FIELD_LABELS: Record<PriceField, string> = {
  OPEN: "Open",
  HIGH: "High",
  LOW: "Low",
  CLOSE: "Close",
  TYPICAL: "Typical Price",
};

export interface ReferenceDefinition {
  id: ReferenceId;
  label: string;
  description: string;
  parameters: { name: string; label: string; default: number; min?: number }[];
}

// The Reference Registry — calendar/session-relative levels (opening
// range, previous day, previous swing) that aren't derivable from a plain
// indicator over the current timeframe's bars alone.
export const REFERENCE_REGISTRY: Record<ReferenceId, ReferenceDefinition> = {
  OPENING_RANGE_HIGH: {
    id: "OPENING_RANGE_HIGH",
    label: "Opening Range High",
    description: "The high of the first N minutes of the trading session.",
    parameters: [{ name: "minutes", label: "Opening Range (minutes)", default: 15, min: 1 }],
  },
  OPENING_RANGE_LOW: {
    id: "OPENING_RANGE_LOW",
    label: "Opening Range Low",
    description: "The low of the first N minutes of the trading session.",
    parameters: [{ name: "minutes", label: "Opening Range (minutes)", default: 15, min: 1 }],
  },
  PREVIOUS_DAY_HIGH: {
    id: "PREVIOUS_DAY_HIGH",
    label: "Previous Day High",
    description: "The prior trading day's high.",
    parameters: [],
  },
  PREVIOUS_DAY_LOW: {
    id: "PREVIOUS_DAY_LOW",
    label: "Previous Day Low",
    description: "The prior trading day's low.",
    parameters: [],
  },
  PREVIOUS_DAY_CLOSE: {
    id: "PREVIOUS_DAY_CLOSE",
    label: "Previous Day Close",
    description: "The prior trading day's close.",
    parameters: [],
  },
  PREVIOUS_SWING_HIGH: {
    id: "PREVIOUS_SWING_HIGH",
    label: "Previous Swing High",
    description: "The most recent confirmed swing high.",
    parameters: [{ name: "lookback", label: "Swing Lookback (bars)", default: 5, min: 1 }],
  },
  PREVIOUS_SWING_LOW: {
    id: "PREVIOUS_SWING_LOW",
    label: "Previous Swing Low",
    description: "The most recent confirmed swing low.",
    parameters: [{ name: "lookback", label: "Swing Lookback (bars)", default: 5, min: 1 }],
  },
};

export function getReferenceDefinition(id: ReferenceId): ReferenceDefinition {
  return REFERENCE_REGISTRY[id];
}

export function listReferences(): ReferenceDefinition[] {
  return Object.values(REFERENCE_REGISTRY);
}
