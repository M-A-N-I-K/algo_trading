// Raw kline array as returned by Binance's /api/v3/klines endpoint.
export type Candlestick = [
  number, // Open time (ms UTC)
  string, // Open price
  string, // High price
  string, // Low price
  string, // Close price
  string, // Volume (base asset volume)
  number, // Close time (ms UTC)
  string, // Quote asset volume
  number, // Number of trades
  string, // Taker buy base asset volume
  string, // Taker buy quote asset volume
  string, // Ignore (unused field)
];
