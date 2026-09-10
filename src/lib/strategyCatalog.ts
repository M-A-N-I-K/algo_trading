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
  { value: "supply-demand", label: "Supply & Demand Zones" },
  { value: "ema-rsi-bollinger", label: "EMA + RSI + Bollinger" },
  { value: "macd-sma-atr", label: "MACD + SMA + ATR" },
  { value: "trend-following", label: "Dual EMA Trend Follow" },
  { value: "vwap", label: "VWAP Candle Failure" },
  { value: "order-block", label: "Order Block" },
  { value: "4h-range", label: "4-Hour Range Breakout Fade" },
  { value: "smc", label: "Smart Money Concepts" },
  { value: "cmf-macd-swing-stop", label: "CMF + MACD Swing-Stop" },
  { value: "ema-vwap-trend-reclaim", label: "EMA + VWAP Trend Reclaim" },
  { value: "fib-retracement-continuation", label: "Fibonacci Retracement Continuation" },
  { value: "ichimoku-long-swing", label: "Ichimoku Cloud Long-Only Swing" },
  { value: "gold-london-sweep", label: "Gold London Liquidity Sweep" },
  { value: "session-london-bos", label: "Session-Based London Open BOS" },
  { value: "trend-rsi-engulfing-scalp", label: "Trend + RSI + Engulfing Scalp" },
];

export function strategyLabel(value: string): string {
  return STRATEGY_CATALOG.find((s) => s.value === value)?.label ?? value;
}
