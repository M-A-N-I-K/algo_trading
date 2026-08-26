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
} from "../strategies";
import { OHLC } from "../indicators/utils";
import { Strategy } from "../types";
import { runBacktest } from "./engine";
import { fetchCandlestickHistory } from "./fetchHistory";

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
};

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
  backtestOptions: Parameters<typeof runBacktest>[2],
): SweepRow {
  const strategy = createStrategy(combo);
  const result = runBacktest(ohlc, strategy, backtestOptions);

  const wins = result.trades.filter((t) => t.pnl > 0);
  const losses = result.trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? Infinity : 0;

  return {
    combo,
    trades: result.trades.length,
    winRate: result.winRate,
    profitFactor,
    totalReturnPercent: result.totalReturnPercent,
    maxDrawdownPercent: result.maxDrawdownPercent,
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
  const strategyKey = process.env.SWEEP_STRATEGY || "4h-range";
  const gridJson = process.env.SWEEP_GRID;
  const sortBy = (process.env.SWEEP_SORT_BY || "profitFactor") as keyof Omit<SweepRow, "combo">;
  const topN = Number(process.env.SWEEP_TOP) || 20;
  const initialBalance = process.env.SWEEP_INITIAL_BALANCE ? Number(process.env.SWEEP_INITIAL_BALANCE) : 10000;
  const positionSizePercent = Number(process.env.SWEEP_POSITION_SIZE) || 1;
  const maxRiskPercent = process.env.SWEEP_MAX_RISK ? Number(process.env.SWEEP_MAX_RISK) : undefined;

  if (!gridJson) {
    console.error(
      `Set SWEEP_GRID to a JSON object mapping strategy option keys to arrays of values to test, e.g.\n` +
        `  SWEEP_GRID='{"rewardRiskRatio":[1.5,2,2.5],"wickBodyRatio":[0.3,0.4,0.5]}'`,
    );
    return;
  }

  const createStrategy = STRATEGIES[strategyKey];
  if (!createStrategy) {
    console.error(`Unknown strategy "${strategyKey}". Available: ${Object.keys(STRATEGIES).join(", ")}`);
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
    row["Trades"] = r.trades;
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
