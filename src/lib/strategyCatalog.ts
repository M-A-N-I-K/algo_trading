// Single source of truth for the legacy (non-Strategy-Builder) strategy
// dropdown shown across the Backtest tab, Trade Journal filters, and the
// manual Trade entry form. Previously each of those hand-duplicated this
// list and drifted out of sync whenever a strategy was added — every
// selectable strategy key must be registered here exactly once, and the
// key must match a key in the STRATEGIES map in src/app/api/backtest/route.ts.
export interface StrategyCatalogEntry {
  value: string;
  label: string;
}

export const STRATEGY_CATALOG: StrategyCatalogEntry[] = [
  { value: "macd-200ema-sr", label: "MACD + 200 EMA + S/R" },
  { value: "macd-sma-atr", label: "MACD + SMA + ATR" },
  { value: "extreme-order-block", label: "Extreme Order Block (Trend Pullback)" },
  { value: "perfect-entry", label: "Perfect Entry (Context + Confirmation)" },
  { value: "liquidity-sweep", label: "Liquidity Sweep (Equal Highs/Lows)" },
  { value: "liquidity-reversal", label: "Liquidity Reversal (Sweep + Shift)" },
  { value: "liquidity-reversal-mtf", label: "Liquidity Reversal MTF (1h Setup + 5m Entry)" },
  { value: "top-down", label: "Top-Down Day Trade (Weekly Bias + 1h Range + 5m Entry)" },
  { value: "ny-open-fvg", label: "NY Open FVG (15m Trend + 1m Entry)" },
  { value: "smc", label: "Smart Money Concepts" },
  { value: "session-london-bos", label: "Session-Based London Open BOS" },
];

export function strategyLabel(value: string): string {
  return STRATEGY_CATALOG.find((s) => s.value === value)?.label ?? value;
}
