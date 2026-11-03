import { OHLC, parseCandlesticks } from "../indicators/utils";
import { Strategy } from "../types";
import { CODED_STRATEGIES } from "../strategies/registry";
import { CodedBacktestOptions, runCodedBacktest } from "./codedBacktest";
import { fetchCandlestickHistory } from "./fetchHistory";

const MAX_COMBINATIONS = 500;

function cartesianProduct(grid: Record<string, any[]>): Record<string, any>[] {
  const keys = Object.keys(grid);
  if (keys.length === 0) return [{}];
  return keys.reduce<Record<string, any>[]>(
    (acc, key) => acc.flatMap((combo) => grid[key].map((value) => ({ ...combo, [key]: value }))),
    [{}],
  );
}

interface SweepRow {
  combo: Record<string, any>;
  trades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
}

function runCombo(
  ohlc: OHLC[],
  createStrategy: (opts?: any) => Strategy,
  combo: Record<string, any>,
  backtestOptions: CodedBacktestOptions,
): SweepRow {
  const { metrics: m } = runCodedBacktest(ohlc, createStrategy(combo), backtestOptions);
  return {
    combo,
    trades: m.count,
    winRate: (m.winRate ?? 0) * 100,
    profitFactor: m.profitFactor ?? 0,
    totalReturnPercent: m.totalReturnPercent,
    maxDrawdownPercent: m.maxDrawdownPercent,
  };
}

// Grid-searches a strategy's options and reports profit factor / return per
// combination, so you can see whether tightening a filter (e.g. a stricter
// wick ratio, a different R-multiple) meaningfully changes the edge rather
// than guessing and re-running the CLI backtest by hand each time.
async function main() {
  const symbol = process.env.SWEEP_SYMBOL || "BTCUSDT";
  const interval = process.env.SWEEP_INTERVAL || "5m";
  const limit = Number(process.env.SWEEP_LIMIT) || 43200;
  const strategyKey = process.env.SWEEP_STRATEGY || "macd-sma-atr";
  const gridJson = process.env.SWEEP_GRID;
  const sortBy = (process.env.SWEEP_SORT_BY || "profitFactor") as keyof Omit<SweepRow, "combo">;
  const topN = Number(process.env.SWEEP_TOP) || 20;
  const initialBalance = process.env.SWEEP_INITIAL_BALANCE ? Number(process.env.SWEEP_INITIAL_BALANCE) : 10000;
  const positionSizePercent = Number(process.env.SWEEP_POSITION_SIZE) || 1;
  const maxRiskPercent = process.env.SWEEP_MAX_RISK ? Number(process.env.SWEEP_MAX_RISK) : undefined;

  if (!gridJson) {
    console.error(
      `Set SWEEP_GRID to a JSON object mapping strategy option keys to arrays of values to test, e.g.\n` +
        `  SWEEP_GRID='{"trendSmaPeriod":[50,100,200],"atrPeriod":[10,14,20]}'`,
    );
    return;
  }

  const createStrategy = CODED_STRATEGIES[strategyKey];
  if (!createStrategy) {
    console.error(`Unknown strategy "${strategyKey}". Available: ${Object.keys(CODED_STRATEGIES).join(", ")}`);
    return;
  }

  let grid: Record<string, any[]>;
  try {
    grid = JSON.parse(gridJson);
  } catch (e) {
    console.error(`SWEEP_GRID is not valid JSON: ${(e as Error).message}`);
    return;
  }

  const combos = cartesianProduct(grid);
  if (combos.length > MAX_COMBINATIONS) {
    console.error(
      `${combos.length} combinations exceeds the safety cap of ${MAX_COMBINATIONS}. Narrow SWEEP_GRID (fewer keys/values) and try again.`,
    );
    return;
  }

  console.log(`\n==================================================`);
  console.log(`Parameter Sweep: ${strategyKey}`);
  console.log(`Symbol: ${symbol} | Interval: ${interval} | Candles: ${limit} | Combinations: ${combos.length}`);
  console.log(`==================================================\n`);

  const raw = await fetchCandlestickHistory(symbol, interval, limit);
  if (!raw.length) {
    console.error(`Failed to fetch candlesticks for ${symbol}`);
    return;
  }
  const ohlc = parseCandlesticks(raw);
  const backtestOptions = { initialBalance, positionSizePercent, maxRiskPercent };

  const results = combos.map((combo) => runCombo(ohlc, createStrategy, combo, backtestOptions));

  results.sort((a, b) => {
    const av = a[sortBy] as number;
    const bv = b[sortBy] as number;
    if (av === Infinity) return -1;
    if (bv === Infinity) return 1;
    return bv - av;
  });

  const rows = results.slice(0, topN).map((r) => {
    const row: Record<string, any> = { ...r.combo };
    row["Round trips"] = r.trades;
    row["Win Rate"] = `${r.winRate.toFixed(2)}%`;
    row["Profit Factor"] = r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(3);
    row["Return"] = `${r.totalReturnPercent.toFixed(2)}%`;
    row["Max DD"] = `${r.maxDrawdownPercent.toFixed(2)}%`;
    return row;
  });

  console.table(rows);
  console.log(`\nShowing top ${Math.min(topN, results.length)} of ${results.length} combinations, sorted by ${sortBy}.\n`);
}

main();
