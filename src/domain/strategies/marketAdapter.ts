import { OHLC } from "@/indicators/utils";
import { Candle } from "@/domain/market-data/types";

// Adapts the market-data domain's Candle[] (ISO timestamp, one time field)
// to the indicator library's OHLC[] shape (epoch-ms open/close time). The
// existing indicator functions (src/indicators/*) are reused as-is rather
// than reimplemented — this is the only translation layer needed.
export function candlesToOhlc(candles: Candle[]): OHLC[] {
  return candles.map((c) => {
    const openTime = new Date(c.timestamp).getTime();
    return {
      openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      closeTime: openTime,
    };
  });
}
