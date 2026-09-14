import { parseCandlesticks } from "../indicators/utils";
import {
  createEmaRsiBollingerStrategy,
  createMacdSmaAtrStrategy,
  createTrendFollowingStrategy,
  createSupplyDemandStrategy,
  createMacd200EmaSrStrategy,
  createSmartMoneyConceptsStrategy,
  createVwapStrategy,
  createOrderBlockStrategy,
  createFourHourRangeStrategy,
  createCmfMacdSwingStopStrategy,
  createEmaVwapTrendReclaimStrategy,
  createFibonacciRetracementContinuationStrategy,
  createIchimokuCloudLongOnlySwingStrategy,
  createGoldLondonLiquiditySweepStrategy,
  createSessionLondonOpenBosStrategy,
  createTrendRsiEngulfingScalpStrategy,
  createMtfChochFvgStrategy,
} from "../strategies";
import { Strategy } from "../types";
import { runBacktest } from "./engine";
import { fetchCandlestickHistory, intervalToMs } from "./fetchHistory";

const STRATEGIES: Record<string, (opts?: any) => Strategy> = {
  "ema-rsi-bollinger": createEmaRsiBollingerStrategy,
  "macd-sma-atr": createMacdSmaAtrStrategy,
  "trend-following": createTrendFollowingStrategy,
  "supply-demand": createSupplyDemandStrategy,
  "macd-200ema-sr": createMacd200EmaSrStrategy,
  "smc": createSmartMoneyConceptsStrategy,
  "smart-money-concepts": createSmartMoneyConceptsStrategy,
  "vwap": createVwapStrategy,
  "order-block": createOrderBlockStrategy,
  "4h-range": createFourHourRangeStrategy,
  "cmf-macd-swing-stop": createCmfMacdSwingStopStrategy,
  "ema-vwap-trend-reclaim": createEmaVwapTrendReclaimStrategy,
  "fib-retracement-continuation": createFibonacciRetracementContinuationStrategy,
  "ichimoku-long-swing": createIchimokuCloudLongOnlySwingStrategy,
  "gold-london-sweep": createGoldLondonLiquiditySweepStrategy,
  "session-london-bos": createSessionLondonOpenBosStrategy,
  "trend-rsi-engulfing-scalp": createTrendRsiEngulfingScalpStrategy,
  "mtf-choch-fvg": createMtfChochFvgStrategy,
};

// Strategies that trade an execution timeframe but need a real higher-
// timeframe series (fetched separately from Binance) for their bias.
const HTF_INTERVAL: Record<string, string> = {
  "order-block": "1h",
  "session-london-bos": "4h",
  "mtf-choch-fvg": "15m",
};

async function main() {
  const symbolEnv = process.env.BACKTEST_SYMBOL || "BTCUSDT,ETHUSDT,XRPUSDT";
  const interval = process.env.BACKTEST_INTERVAL || "1h";
  const limit = Number(process.env.BACKTEST_LIMIT) || 1000;
  const strategyKey = process.env.BACKTEST_STRATEGY || "macd-200ema-sr";
  const positionSizePercent = Number(process.env.BACKTEST_POSITION_SIZE) || 1;
  const initialBalance = process.env.BACKTEST_INITIAL_BALANCE
    ? Number(process.env.BACKTEST_INITIAL_BALANCE)
    : 10000;
  const maxRiskPercent = process.env.BACKTEST_MAX_RISK
    ? Number(process.env.BACKTEST_MAX_RISK)
    : undefined;

  const createStrategy = STRATEGIES[strategyKey];
  if (!createStrategy) {
    console.error(
      `Unknown strategy "${strategyKey}". Available: ${Object.keys(STRATEGIES).join(", ")}`,
    );
    return;
  }

  const symbols = symbolEnv.split(",").map((s) => s.trim().toUpperCase());
  const strategySample = createStrategy();

  console.log(`\n==================================================`);
  console.log(`Strategy: ${strategySample.name}`);
  console.log(`Interval: ${interval} | Limit: ${limit} candles`);
  console.log(`Initial Capital: $${initialBalance}`);
  if (maxRiskPercent !== undefined) {
    console.log(`Max Risk Per Trade: ${(maxRiskPercent * 100).toFixed(2)}% of balance`);
  }
  console.log(`==================================================\n`);

  interface BacktestSummary {
    Symbol: string;
    Trades: number;
    "Win Rate": string;
    "Final Balance": string;
    "Total Return": string;
    "Max Drawdown": string;
  }
  const results: BacktestSummary[] = [];

  for (const symbol of symbols) {
    let htfCandles = undefined;
    const htfInterval = HTF_INTERVAL[strategyKey];
    if (htfInterval) {
      // `interval` is the lower execution timeframe the strategy triggers
      // entries on; `htfInterval` is the real higher-timeframe series its
      // bias is computed from.
      const candlesPerHtfBar = intervalToMs(htfInterval) / intervalToMs(interval);
      const htfLimit = Math.ceil(limit / candlesPerHtfBar) + 50;
      const rawHtf = await fetchCandlestickHistory(symbol, htfInterval, htfLimit);
      if (rawHtf && rawHtf.length > 0) {
        htfCandles = parseCandlesticks(rawHtf);
      }
    }

    const candles = await fetchCandlestickHistory(symbol, interval, limit);
    if (!candles.length) {
      console.error(`Failed to fetch candlesticks for ${symbol}`);
      continue;
    }

    const ohlc = parseCandlesticks(candles);
    const strategy = htfInterval ? createStrategy({ htfCandles }) : createStrategy();
    const result = runBacktest(ohlc, strategy, {
      initialBalance,
      positionSizePercent,
      maxRiskPercent,
    });

    results.push({
      Symbol: symbol,
      Trades: result.trades.length,
      "Win Rate": `${result.winRate.toFixed(2)}%`,
      "Final Balance": `$${result.finalBalance.toFixed(2)}`,
      "Total Return": `${result.totalReturnPercent.toFixed(2)}%`,
      "Max Drawdown": `${result.maxDrawdownPercent.toFixed(2)}%`,
    });
  }

  console.table(results);
}

main();
