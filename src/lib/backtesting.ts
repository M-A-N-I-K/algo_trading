import { BINANCE_EXCHANGE, BINANCE_FUTURES_EXCHANGE, createHistoricalCandleSource } from "@/domain/market-data/historicalCandles";
import { RunStrategyBacktestDeps } from "@/domain/backtesting/runStrategyBacktest";
import { prismaCandleStore } from "@/db/repositories/candleRepository";
import { prismaBacktestStore } from "@/db/repositories/backtestRepository";
import { getStrategyVersion } from "@/db/repositories/strategyRepository";
import { findInstrumentById } from "@/db/repositories/instrumentRepository";
import { binanceFuturesKlines, binanceSpotKlines } from "@/lib/binance/klines";

// Production adapters for the Strategy Builder backtest run.
export const historicalCandles = createHistoricalCandleSource({
  store: prismaCandleStore,
  fetchers: { [BINANCE_EXCHANGE]: binanceSpotKlines, [BINANCE_FUTURES_EXCHANGE]: binanceFuturesKlines },
});

export const backtestDeps: RunStrategyBacktestDeps = {
  versions: { getStrategyVersion },
  instruments: { getInstrumentById: findInstrumentById },
  candles: historicalCandles,
  store: prismaBacktestStore,
};
