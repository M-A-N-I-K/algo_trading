import * as candleRepository from "@/db/repositories/candleRepository";
import * as instrumentRepository from "@/db/repositories/instrumentRepository";
import { MarketDataProvider } from "./provider";
import { AssetType, Candle, CandleQuery, Instrument, Timeframe } from "./types";

// Backed by the seeded `instruments`/`candles` tables (all candles rows are
// flagged `isDemo: true` by the seed script — see src/db/seed.ts). A future
// `LiveMarketDataProvider` implements the same `MarketDataProvider`
// interface against a real data vendor; no consumer of this class needs to
// change when that happens.
export class DemoMarketDataProvider implements MarketDataProvider {
  async getInstrument(symbol: string, exchange: string): Promise<Instrument | null> {
    return instrumentRepository.findInstrumentBySymbol(symbol, exchange);
  }

  async getInstrumentById(id: string): Promise<Instrument | null> {
    return instrumentRepository.findInstrumentById(id);
  }

  async listInstruments(filter?: { assetType?: AssetType; isActive?: boolean; search?: string }): Promise<Instrument[]> {
    return instrumentRepository.listInstruments(filter);
  }

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    return candleRepository.queryCandles(query);
  }

  async getLatestCandle(instrumentId: string, timeframe: Timeframe): Promise<Candle | null> {
    return candleRepository.findLatestCandle(instrumentId, timeframe);
  }

  async getHistoricalCandles(instrumentId: string, timeframe: Timeframe, from: Date, to: Date): Promise<Candle[]> {
    return candleRepository.findHistoricalCandles(instrumentId, timeframe, from, to);
  }
}

let cachedProvider: MarketDataProvider | null = null;

// Single seam future phases change to select a live provider (e.g. by env
// var) without touching any caller of getMarketDataProvider().
export function getMarketDataProvider(): MarketDataProvider {
  if (!cachedProvider) {
    cachedProvider = new DemoMarketDataProvider();
  }
  return cachedProvider;
}
