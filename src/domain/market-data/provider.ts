import { AssetType, Candle, CandleQuery, Instrument, Timeframe } from "./types";

// The application depends on this interface only — never on a concrete
// provider or on Prisma directly. `DemoMarketDataProvider` (backed by
// seeded DB data) is the only implementation in P0; a future
// `LiveMarketDataProvider` (backed by a real broker/data-vendor API) can be
// swapped in without touching any consumer of this interface.
export interface MarketDataProvider {
  getInstrument(symbol: string, exchange: string): Promise<Instrument | null>;
  getInstrumentById(id: string): Promise<Instrument | null>;
  listInstruments(filter?: { assetType?: AssetType; isActive?: boolean; search?: string }): Promise<Instrument[]>;
  getCandles(query: CandleQuery): Promise<Candle[]>;
  getLatestCandle(instrumentId: string, timeframe: Timeframe): Promise<Candle | null>;
  getHistoricalCandles(instrumentId: string, timeframe: Timeframe, from: Date, to: Date): Promise<Candle[]>;
}
