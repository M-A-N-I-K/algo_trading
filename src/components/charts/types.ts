// Chart overlay abstraction — deliberately independent of both the market
// data source and of Lightweight Charts' own types, so the same shape can
// later be produced by an indicator engine (EMA/SMA/RSI/VWAP), a strategy's
// entry/exit signals, or a backtest's trade list, without CandlestickChart
// needing to change.

export interface OverlayLinePoint {
  time: number; // unix seconds
  value: number;
}

export interface OverlayLine {
  id: string;
  label: string;
  color: string;
  points: OverlayLinePoint[];
}

export interface OverlayMarker {
  time: number; // unix seconds
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text?: string;
}

export interface OverlayPriceLine {
  id: string;
  price: number;
  color: string;
  title: string;
  lineStyle?: "solid" | "dashed" | "dotted";
}

export interface ChartOverlays {
  // EMA / SMA / VWAP / RSI (on a separate pane) — one entry per line.
  lines?: OverlayLine[];
  // Entry/exit signals, or individual backtest trade markers.
  markers?: OverlayMarker[];
  // Stop-loss / take-profit horizontal levels.
  priceLines?: OverlayPriceLine[];
}
