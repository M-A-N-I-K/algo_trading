import { loadSeries } from "@/lib/signals/scanner";
import { PLAYBOOK_ACCOUNTS, setupById } from "@/lib/playbook/config";
import { levelAlerts, marketLevels, type LevelAlert, type MarketLevels } from "./liquidity";

export interface LevelsView {
  asOf: number;
  markets: MarketLevels[];
  alerts: LevelAlert[];
  errors: string[];
}

/** Every market a playbook account trades, in account order. */
export const LEVEL_MARKETS: readonly string[] = [
  ...new Set(PLAYBOOK_ACCOUNTS.flatMap((a) => a.setups.map((s) => setupById(s.id)?.symbol).filter((s): s is string => !!s))),
];

// Levels from the scanner's cached 1h candles; price and sweeps from its 15m
// ones, so an alert is at most 15 minutes behind the market.
export async function buildLevels(now = Date.now()): Promise<LevelsView> {
  const [h1, m15] = await Promise.all([loadSeries("1h", now, LEVEL_MARKETS), loadSeries("15m", now, LEVEL_MARKETS)]);
  const markets: MarketLevels[] = [];
  const errors = [...h1.errors];
  for (const symbol of LEVEL_MARKETS) {
    const m = marketLevels(symbol, h1.series.get(symbol) ?? [], now, m15.series.get(symbol) ?? []);
    if (m) markets.push(m);
    else if (!errors.some((e) => e.startsWith(symbol))) errors.push(`${symbol}: no hourly history (MT5-only markets need the terminal's feed)`);
  }
  return { asOf: now, markets, alerts: levelAlerts(markets), errors };
}
