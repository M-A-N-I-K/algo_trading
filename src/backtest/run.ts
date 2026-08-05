import { parseCandlesticks } from "../indicators/utils";
import {
  createEmaRsiBollingerStrategy,
  createMacdSmaAtrStrategy,
  createTrendFollowingStrategy,
  createSupplyDemandStrategy,
} from "../strategies";
import { Strategy } from "../types";
import { runBacktest } from "./engine";
import { fetchCandlestickHistory } from "./fetchHistory";

const STRATEGIES: Record<string, () => Strategy> = {
  "ema-rsi-bollinger": createEmaRsiBollingerStrategy,
  "macd-sma-atr": createMacdSmaAtrStrategy,
  "trend-following": createTrendFollowingStrategy,
  "supply-demand": createSupplyDemandStrategy,
};

async function main() {
  const symbol = process.env.BACKTEST_SYMBOL || "XRPUSDT";
  const interval = process.env.BACKTEST_INTERVAL || "1h";
  const limit = Number(process.env.BACKTEST_LIMIT) || 500;
  const strategyKey = process.env.BACKTEST_STRATEGY || "ema-rsi-bollinger";
  const positionSizePercent = Number(process.env.BACKTEST_POSITION_SIZE) || 1;

  const createStrategy = STRATEGIES[strategyKey];
  if (!createStrategy) {
    console.error(
      `Unknown strategy "${strategyKey}". Available: ${Object.keys(STRATEGIES).join(", ")}`,
    );
    return;
  }

  const candles = await fetchCandlestickHistory(symbol, interval, limit);
  if (!candles.length) {
    console.error("Failed to fetch candlesticks");
    return;
  }

  const ohlc = parseCandlesticks(candles);
  const strategy = createStrategy();
  const result = runBacktest(ohlc, strategy, { positionSizePercent });

  console.log(`Strategy: ${strategy.name}`);
  console.log(`Symbol: ${symbol} (${interval}), ${candles.length} candles`);
  console.log(`Trades: ${result.trades.length}`);
  console.log(`Win rate: ${result.winRate.toFixed(2)}%`);
  console.log(`Final balance: ${result.finalBalance.toFixed(2)}`);
  console.log(`Total return: ${result.totalReturnPercent.toFixed(2)}%`);
  console.log(`Max drawdown: ${result.maxDrawdownPercent.toFixed(2)}%`);
}

main();
