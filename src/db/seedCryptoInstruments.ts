// Adds the Binance markets that Strategy Builder strategies can backtest on
// real data: spot USDT crypto pairs, plus USDⓈ-M futures for markets spot
// doesn't list (gold, XAUUSDT). Tick and lot sizes come from exchangeInfo.
// Safe to re-run: instruments upsert on (symbol, exchange). Candles are not
// seeded; backtests fetch and cache them on demand.
import { prisma } from "./client";
import { BINANCE_EXCHANGE, BINANCE_FUTURES_EXCHANGE } from "../domain/market-data/historicalCandles";
import { BinanceSymbolFilters, fetchFuturesSymbolFilters, fetchSymbolFilters } from "../lib/binance/klines";
import type { AssetType } from "../domain/market-data/types";

const SPOT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "LTCUSDT"];
const FUTURES_SYMBOLS = ["XAUUSDT"]; // gold

async function upsertAll(symbols: string[], filters: Record<string, BinanceSymbolFilters>, exchange: string, assetType: AssetType) {
  for (const symbol of symbols) {
    const f = filters[symbol];
    if (!f) {
      console.warn(`${exchange} has no symbol ${symbol}; skipped.`);
      continue;
    }
    await prisma.instrument.upsert({
      where: { symbol_exchange: { symbol, exchange } },
      update: { tickSize: f.tickSize, lotSize: f.stepSize, isActive: true },
      create: { symbol, exchange, assetType, currency: "USDT", tickSize: f.tickSize, lotSize: f.stepSize },
    });
    console.log(`${exchange} ${symbol}: tick ${f.tickSize}, lot ${f.stepSize}`);
  }
}

async function main() {
  await upsertAll(SPOT_SYMBOLS, await fetchSymbolFilters(SPOT_SYMBOLS), BINANCE_EXCHANGE, "CRYPTO");
  await upsertAll(FUTURES_SYMBOLS, await fetchFuturesSymbolFilters(FUTURES_SYMBOLS), BINANCE_FUTURES_EXCHANGE, "FUTURE");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
