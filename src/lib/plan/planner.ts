import { loadSeries, SIGNAL_SYMBOLS } from "@/lib/signals/scanner";
import { isMt5OnlyMarket, marketLabel } from "@/lib/markets/yahoo";
import { buildCoinPlan, marketSummary, type CoinPlan } from "./weeklyPlan";

export interface WeeklyPlan {
  asOf: number;
  weekStart: number | null;
  coins: CoinPlan[];
  summary: string[];
  errors: string[];
}


// The plan for every Signals market, from the scanner's cached 1h candles.
export async function buildWeeklyPlan(now = Date.now()): Promise<WeeklyPlan> {
  const { series, errors } = await loadSeries("1h", now);
  const coins: CoinPlan[] = [];
  for (const symbol of SIGNAL_SYMBOLS) {
    const plan = buildCoinPlan(symbol, series.get(symbol) ?? [], now);
    if (plan) coins.push(plan);
    // Markets only the MT5 feed carries are simply left out while it's off.
    else if (isMt5OnlyMarket(symbol) && !series.get(symbol)?.length) continue;
    else if (!errors.some((e) => e.startsWith(symbol))) errors.push(`${symbol}: not enough 1h history yet`);
  }
  return {
    asOf: now,
    weekStart: coins[0]?.weekStart ?? null,
    coins,
    summary: marketSummary(coins, marketLabel),
    errors,
  };
}
