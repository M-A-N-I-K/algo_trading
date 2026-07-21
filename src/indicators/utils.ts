import { Candlestick } from "../types";

export interface OHLC {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export function parseCandlesticks(candles: Candlestick[]): OHLC[] {
  return candles.map(
    ([openTime, open, high, low, close, volume, closeTime]) => ({
      openTime,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume),
      closeTime,
    }),
  );
}

export function getClosePrices(candles: Candlestick[]): number[] {
  return candles.map((candle) => parseFloat(candle[4]));
}
