import { readFileSync } from "fs";
import type { OHLC } from "../indicators/utils";
import { createCodedStrategy, HIGHER_TIMEFRAME } from "../strategies/registry";
import { runCodedBacktest } from "./codedBacktest";
import { parseMt5Bars, resampleBars } from "./mt5Bars";

// Runs every guide strategy on an MT5 bar export with the guides' settings
// (src/guides/shared.ts) and prints rows ready to paste into src/guides.
//
//   MT5_CSV=~/Downloads/NAS100_M1.csv SYMBOL=NAS100 FROM=2025-11-01 TO=2026-11-01 npm run backtest:mt5
//
// Bars before FROM only warm up the higher-timeframe series.

// Timeframes each guide reports; a strategy in HIGHER_TIMEFRAME also gets its HTF series.
const GUIDE_RUNS: { key: string; interval: string; label: string }[] = [
  { key: "macd-200ema-sr", interval: "15m", label: "15m" },
  { key: "liquidity-reversal", interval: "1h", label: "1h" },
  { key: "liquidity-reversal", interval: "15m", label: "15m" },
  { key: "extreme-order-block", interval: "15m", label: "1h / 15m" },
  { key: "liquidity-reversal-mtf", interval: "5m", label: "5m (1h setup)" },
  { key: "session-london-bos", interval: "15m", label: "4h / 15m" },
  { key: "macd-sma-atr", interval: "15m", label: "15m" },
  { key: "liquidity-sweep", interval: "1h", label: "1h" },
  { key: "liquidity-sweep", interval: "15m", label: "15m" },
  { key: "perfect-entry", interval: "1h", label: "4h / 1h" },
  { key: "top-down", interval: "5m", label: "5m (1h range, weekly/daily bias)" },
  { key: "vwap", interval: "5m", label: "5m" },
  { key: "smc", interval: "15m", label: "15m" },
  { key: "ny-open-fvg", interval: "1m", label: "1m (15m trend)" },
  { key: "ny-inside-bar", interval: "15m", label: "15m" },
];

// The guides' BACKTEST_SETTINGS.
const SETTINGS = { initialBalance: 10_000, positionSizePercent: 1, maxRiskPercent: 0.02, feeRate: 0.0004 };

const csv = process.env.MT5_CSV;
if (!csv) throw new Error("Set MT5_CSV to the exported bar file.");
const symbol = process.env.SYMBOL ?? "NAS100";
const from = process.env.FROM ? Date.parse(process.env.FROM) : -Infinity;
const to = process.env.TO ? Date.parse(process.env.TO) : Infinity;

const { bars, barMs } = parseMt5Bars(readFileSync(csv.replace(/^~/, process.env.HOME ?? "~")));
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
console.log(`${bars.length} bars of ${barMs / 60_000}m, ${day(bars[0].openTime)} → ${day(bars[bars.length - 1].openTime)} UTC`);

const cache = new Map<string, OHLC[]>();
const series = (interval: string) => {
  if (!cache.has(interval)) cache.set(interval, interval === "1m" && barMs === 60_000 ? bars : resampleBars(bars, interval));
  return cache.get(interval)!;
};

for (const { key, interval, label } of GUIDE_RUNS) {
  if (60_000 * Number(interval.replace(/\D/g, "")) * (interval.endsWith("h") ? 60 : 1) < barMs) {
    console.log(`// ${key} ${interval}: skipped, the export's bars are longer than ${interval}`);
    continue;
  }
  const htf = HIGHER_TIMEFRAME[key];
  const htfCandles = htf ? series(htf.interval).filter((c) => c.closeTime < to) : undefined;
  const candles = series(htf?.executionInterval ?? interval).filter((c) => c.openTime >= from && c.closeTime < to);
  const strategy = createCodedStrategy(key, htfCandles);
  if (!strategy || candles.length === 0) continue;

  const m = runCodedBacktest(candles, strategy, SETTINGS).metrics;
  const pf = m.profitFactor === null || m.profitFactor === Infinity ? "null" : m.profitFactor.toFixed(2);
  const win = m.winRate === null ? 0 : m.winRate * 100;
  console.log(
    `// ${key}\n      { symbol: "${symbol}", timeframe: "${label}", trades: ${m.count}, winRatePct: ${win.toFixed(1)}, profitFactor: ${pf}, returnPct: ${m.totalReturnPercent.toFixed(1)}, maxDrawdownPct: ${m.maxDrawdownPercent.toFixed(1)} },`,
  );
}
