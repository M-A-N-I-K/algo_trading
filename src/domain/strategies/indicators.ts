import { IndicatorId } from "./expressions";

export interface IndicatorParameterDef {
  name: string;
  label: string;
  type: "number";
  default: number;
  min?: number;
  max?: number;
}

export interface IndicatorOutputDef {
  id: string;
  label: string;
  // How this line should render if plotted on the chart.
  color: string;
}

export interface IndicatorDefinition {
  id: IndicatorId;
  name: string;
  label: string;
  description: string;
  parameters: IndicatorParameterDef[];
  outputs: IndicatorOutputDef[];
  // Whether this indicator is computed over an arbitrary source series
  // (Close by default, but could be Volume, another indicator, etc.) vs.
  // computed directly from OHLC (ATR, VWAP have no meaningful "source").
  requiresSource: boolean;
  // Where it plots: on the price chart itself, or in its own pane below.
  chartPane: "overlay" | "separate";
}

// The Indicator Registry — the single place that knows what indicators
// exist, what parameters they take, and how many outputs they produce.
// Both the UI (IndicatorSelector, IndicatorParameterForm) and the
// interpreter read from this registry instead of hardcoding a form or a
// switch-case per indicator. Adding a new indicator means adding one entry
// here (plus a calculation function) — not touching the condition builder.
export const INDICATOR_REGISTRY: Record<IndicatorId, IndicatorDefinition> = {
  SMA: {
    id: "SMA",
    name: "Simple Moving Average",
    label: "SMA",
    description: "Average of the source series over the last N bars.",
    parameters: [{ name: "period", label: "Period", type: "number", default: 20, min: 1 }],
    outputs: [{ id: "value", label: "SMA", color: "#38bdf8" }],
    requiresSource: true,
    chartPane: "overlay",
  },
  EMA: {
    id: "EMA",
    name: "Exponential Moving Average",
    label: "EMA",
    description: "Exponentially weighted moving average of the source series.",
    parameters: [{ name: "period", label: "Period", type: "number", default: 20, min: 1 }],
    outputs: [{ id: "value", label: "EMA", color: "#a78bfa" }],
    requiresSource: true,
    chartPane: "overlay",
  },
  RSI: {
    id: "RSI",
    name: "Relative Strength Index",
    label: "RSI",
    description: "Momentum oscillator measuring the speed and change of price movements (0-100).",
    parameters: [{ name: "period", label: "Period", type: "number", default: 14, min: 1 }],
    outputs: [{ id: "value", label: "RSI", color: "#f472b6" }],
    requiresSource: true,
    chartPane: "separate",
  },
  ATR: {
    id: "ATR",
    name: "Average True Range",
    label: "ATR",
    description: "Wilder's average true range — a volatility measure derived from OHLC, not a source series.",
    parameters: [{ name: "period", label: "Period", type: "number", default: 14, min: 1 }],
    outputs: [{ id: "value", label: "ATR", color: "#fb923c" }],
    requiresSource: false,
    chartPane: "separate",
  },
  VWAP: {
    id: "VWAP",
    name: "Volume Weighted Average Price",
    label: "VWAP",
    description: "Session-anchored, volume-weighted average price.",
    parameters: [],
    outputs: [{ id: "value", label: "VWAP", color: "#22d3ee" }],
    requiresSource: false,
    chartPane: "overlay",
  },
  MACD: {
    id: "MACD",
    name: "Moving Average Convergence Divergence",
    label: "MACD",
    description: "Trend/momentum indicator: the difference between a fast and slow EMA, plus a signal line.",
    parameters: [
      { name: "fastPeriod", label: "Fast Period", type: "number", default: 12, min: 1 },
      { name: "slowPeriod", label: "Slow Period", type: "number", default: 26, min: 1 },
      { name: "signalPeriod", label: "Signal Period", type: "number", default: 9, min: 1 },
    ],
    outputs: [
      { id: "macdLine", label: "MACD Line", color: "#38bdf8" },
      { id: "signalLine", label: "Signal Line", color: "#f472b6" },
      { id: "histogram", label: "Histogram", color: "#94a3b8" },
    ],
    requiresSource: true,
    chartPane: "separate",
  },
  BOLLINGER_BANDS: {
    id: "BOLLINGER_BANDS",
    name: "Bollinger Bands",
    label: "Bollinger Bands",
    description: "SMA middle band plus/minus a multiple of standard deviation.",
    parameters: [
      { name: "period", label: "Period", type: "number", default: 20, min: 1 },
      { name: "stdDevMultiplier", label: "Std Dev Multiplier", type: "number", default: 2, min: 0.1 },
    ],
    outputs: [
      { id: "upper", label: "Upper Band", color: "#38bdf8" },
      { id: "middle", label: "Middle Band", color: "#94a3b8" },
      { id: "lower", label: "Lower Band", color: "#38bdf8" },
    ],
    requiresSource: true,
    chartPane: "overlay",
  },
};

export function getIndicatorDefinition(id: IndicatorId): IndicatorDefinition {
  return INDICATOR_REGISTRY[id];
}

export function listIndicators(): IndicatorDefinition[] {
  return Object.values(INDICATOR_REGISTRY);
}

export function defaultIndicatorParameters(id: IndicatorId): Record<string, number> {
  const def = getIndicatorDefinition(id);
  return Object.fromEntries(def.parameters.map((p) => [p.name, p.default]));
}
