import { CODED_STRATEGIES } from "../strategies/registry";
import { loadCodedStrategy, runCodedBacktest } from "./codedBacktest";

async function main() {
  const symbolEnv = process.env.BACKTEST_SYMBOL || "BTCUSDT,ETHUSDT,XRPUSDT";
  const interval = process.env.BACKTEST_INTERVAL || "1h";
  const limit = Number(process.env.BACKTEST_LIMIT) || 1000;
  const strategyKey = process.env.BACKTEST_STRATEGY || "macd-200ema-sr";
  const positionSizePercent = Number(process.env.BACKTEST_POSITION_SIZE) || 1;
  const initialBalance = process.env.BACKTEST_INITIAL_BALANCE ? Number(process.env.BACKTEST_INITIAL_BALANCE) : 10000;
  const maxRiskPercent = process.env.BACKTEST_MAX_RISK ? Number(process.env.BACKTEST_MAX_RISK) : undefined;

  if (!CODED_STRATEGIES[strategyKey]) {
    console.error(`Unknown strategy "${strategyKey}". Available: ${Object.keys(CODED_STRATEGIES).join(", ")}`);
    return;
  }

  const symbols = symbolEnv.split(",").map((s) => s.trim().toUpperCase());

  console.log(`\n==================================================`);
  console.log(`Strategy: ${strategyKey}`);
  console.log(`Interval: ${interval} | Limit: ${limit} candles`);
  console.log(`Initial Capital: $${initialBalance}`);
  if (maxRiskPercent !== undefined) {
    console.log(`Max Risk Per Trade: ${(maxRiskPercent * 100).toFixed(2)}% of balance`);
  }
  console.log(`==================================================\n`);

  const rows = [];
  for (const symbol of symbols) {
    const loaded = await loadCodedStrategy(strategyKey, symbol, interval, limit);
    if (!loaded) {
      console.error(`Failed to fetch candlesticks for ${symbol}`);
      continue;
    }

    const { metrics: m } = runCodedBacktest(loaded.candles, loaded.strategy, { initialBalance, positionSizePercent, maxRiskPercent });
    rows.push({
      Symbol: symbol,
      "Round trips": m.count,
      "Win Rate": m.winRate === null ? "–" : `${(m.winRate * 100).toFixed(2)}%`,
      "Profit Factor": m.profitFactor === null ? "–" : m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2),
      "Final Equity": `$${m.finalEquity.toFixed(2)}`,
      "Total Return": `${m.totalReturnPercent.toFixed(2)}%`,
      "Max Drawdown": `${m.maxDrawdownPercent.toFixed(2)}%`,
    });
  }

  console.table(rows);
}

main();
