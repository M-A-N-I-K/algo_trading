import { OHLC } from "../indicators/utils";

export type Signal = "BUY" | "SELL" | "HOLD";

export interface Strategy {
  name: string;
  // Given the full candle history, return one signal per candle (same
  // length/order as `candles`). Use "HOLD" for indicator warm-up periods.
  generateSignals(candles: OHLC[]): Signal[];
}
