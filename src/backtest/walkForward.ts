import { parseCandlesticks } from "../indicators/utils";
import { BacktestResult } from "../domain/backtesting";
import { CODED_STRATEGIES } from "../strategies/registry";
import { runCodedBacktest } from "./codedBacktest";
import { fetchCandlestickHistory } from "./fetchHistory";

function summarize(label: string, { metrics: m }: BacktestResult) {
  return {
    Window: label,
    "Round trips": m.count,
    "Win Rate": m.winRate === null ? "–" : `${(m.winRate * 100).toFixed(2)}%`,
    "Profit Factor": m.profitFactor === null ? "–" : m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2),
    "Total Return": `${m.totalReturnPercent.toFixed(2)}%`,
    "Max Drawdown": `${m.maxDrawdownPercent.toFixed(2)}%`,
  };
}

// Splits candle history into chronological in-sample / out-of-sample
// blocks and runs the SAME strategy config on each independently. Unlike
// a single backtest over the full history, this surfaces whether a
// strategy's edge is durable or just an artifact of one lucky historical
// stretch — if out-of-sample results are consistently much worse than
// in-sample, treat the in-sample edge as overfit.
async function main() {
  const symbol = process.env.WF_SYMBOL || "BTCUSDT";
  const interval = process.env.WF_INTERVAL || "5m";
  const limit = Number(process.env.WF_LIMIT) || 43200;
  const strategyKey = process.env.WF_STRATEGY || "macd-sma-atr";
  const folds = Math.max(1, Number(process.env.WF_FOLDS) || 1);
  const initialBalance = process.env.WF_INITIAL_BALANCE ? Number(process.env.WF_INITIAL_BALANCE) : 10000;
  const positionSizePercent = Number(process.env.WF_POSITION_SIZE) || 1;
  const maxRiskPercent = process.env.WF_MAX_RISK ? Number(process.env.WF_MAX_RISK) : undefined;

  const createStrategy = CODED_STRATEGIES[strategyKey];
  if (!createStrategy) {
    console.error(`Unknown strategy "${strategyKey}". Available: ${Object.keys(CODED_STRATEGIES).join(", ")}`);
    return;
  }

  console.log(`\n==================================================`);
  console.log(`Walk-Forward Validation: ${strategyKey}`);
  console.log(`Symbol: ${symbol} | Interval: ${interval} | Total candles: ${limit} | Folds: ${folds}`);
  console.log(`==================================================\n`);

  const raw = await fetchCandlestickHistory(symbol, interval, limit);
  if (!raw.length) {
    console.error(`Failed to fetch candlesticks for ${symbol}`);
    return;
  }
  const ohlc = parseCandlesticks(raw);

  // Divide into folds+1 equal contiguous blocks; for fold i, in-sample =
  // block i, out-of-sample = block i+1 (rolling walk-forward).
  const blockCount = folds + 1;
  const blockSize = Math.floor(ohlc.length / blockCount);
  if (blockSize < 200) {
    console.error(
      `Not enough candles (${ohlc.length}) to split into ${blockCount} blocks of a useful size. Increase WF_LIMIT or reduce WF_FOLDS.`,
    );
    return;
  }

  const rows: ReturnType<typeof summarize>[] = [];
  const oosReturns: number[] = [];

  for (let f = 0; f < folds; f++) {
    const isStart = f * blockSize;
    const isEnd = isStart + blockSize;
    const oosStart = isEnd;
    const oosEnd = f === folds - 1 ? ohlc.length : oosStart + blockSize;

    const isCandles = ohlc.slice(isStart, isEnd);
    const oosCandles = ohlc.slice(oosStart, oosEnd);

    const isResult = runCodedBacktest(isCandles, createStrategy(), { initialBalance, positionSizePercent, maxRiskPercent });
    const oosResult = runCodedBacktest(oosCandles, createStrategy(), { initialBalance, positionSizePercent, maxRiskPercent });

    rows.push(summarize(`Fold ${f + 1} — In-Sample`, isResult));
    rows.push(summarize(`Fold ${f + 1} — Out-of-Sample`, oosResult));

    oosReturns.push(oosResult.metrics.totalReturnPercent);
  }

  console.table(rows);

  const avgOosReturn = oosReturns.reduce((a, b) => a + b, 0) / oosReturns.length;
  console.log(`\nAverage out-of-sample return across ${folds} fold(s): ${avgOosReturn.toFixed(2)}%`);
  console.log(
    `If in-sample results look much better than out-of-sample across folds, treat the in-sample edge as overfit / regime-specific rather than durable.\n`,
  );
}

main();
