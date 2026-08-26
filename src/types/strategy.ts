import { OHLC } from "../indicators/utils";

export type Signal = "BUY" | "SELL" | "HOLD";

export interface PartialExitLevel {
  // Price at which to close a portion of the position.
  price: number;
  // Fraction (0-1] of the ORIGINAL position size to close at this level.
  portion: number;
}

export interface TradeTarget {
  stopLoss: number;
  takeProfit: number;
  // Optional partial take-profit ladder, checked in array order before the
  // final `takeProfit`. Whatever portion remains keeps running toward
  // `takeProfit` (or the trailing stop, if trailing fields are set).
  partialExits?: PartialExitLevel[];
  // Optional trailing stop: once price moves `trailTriggerR` multiples of
  // the position's initial risk in its favor, the stop trails behind the
  // best price seen by `trailDistance` (same units as price), only ever
  // tightening, never loosening.
  trailTriggerR?: number;
  trailDistance?: number;
}

export interface Strategy {
  name: string;
  // Given the full candle history, return one signal per candle (same
  // length/order as `candles`). Use "HOLD" for indicator warm-up periods.
  generateSignals(candles: OHLC[]): Signal[];
  getTradeTargets?(candles: OHLC[]): (TradeTarget | null)[];
}
