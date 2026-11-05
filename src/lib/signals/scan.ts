import type { OHLC } from "@/indicators/utils";
import { runCodedBacktest } from "@/backtest/codedBacktest";
import { createCodedStrategy } from "@/strategies/registry";
import type { Strategy } from "@/types/strategy";
import type { Side } from "@/domain/backtesting";

// One strategy on one market: how it did over the cached history, and what
// it's saying now. Pure: candles in, row out, so it can be tested offline.
//
// "Qualified" uses the guides' backtest settings over the whole cached
// window (up to SIGNAL_HISTORY_DAYS). The latest signal comes from the same
// simulator run, so the dashboard only shows trades the backtest would
// have taken (one position at a time, the same stops and targets).

// A strategy only sends signals on a market where, over the window, it:
export const QUALIFY_RULE = {
  minDays: 270, // has at least ~9 months of history to judge it on
  minTrades: 20, // took enough trades for the result to mean something
  minProfitFactor: 1.3, // won clearly more than it lost
  minAnnualReturnPct: 8, // made a decent return
  maxDrawdownPct: 20, // without a deep drawdown on the way
  minHalfReturnPct: 2, // made money in both halves, not one lucky stretch
  // and beat simply holding the market over the same window (alpha).
} as const;
// A closed trade stays on the board this long after its signal.
export const RECENT_MS = 3 * 24 * 60 * 60_000;

const BACKTEST_SETTINGS = { initialBalance: 10_000, positionSizePercent: 1, maxRiskPercent: 0.02, feeRate: 0.0004 };

export type SignalStatus = "new" | "open" | "target" | "stop" | "closed";

export interface LatestSignal {
  status: SignalStatus;
  side: Side;
  signalTime: number; // close time of the signal candle
  // "new": the signal candle's close, a guide to the next open you'd fill
  // at. Otherwise the backtest's fill at the next candle's open.
  entry: number;
  stop: number | null;
  target: number | null;
  rr: number | null; // reward ÷ risk from entry, stop and target
  exitPrice: number | null;
  exitTime: number | null;
  rMultiple: number | null; // realised (closed) or marked at the last close (open)
}

export interface BacktestStats {
  trades: number;
  winRatePct: number;
  profitFactor: number | null;
  returnPct: number;
  maxDrawdownPct: number;
  days: number;
  annualReturnPct: number; // compounded per year
  buyHoldPct: number; // holding the market over the same window
  firstHalfPct: number; // strategy return in each half of the window
  secondHalfPct: number;
}

export interface SignalRow {
  id: string; // `${strategyKey}:${symbol}:${interval}`
  strategyKey: string;
  strategyName: string;
  symbol: string;
  interval: string;
  stats: BacktestStats;
  qualified: boolean;
  reasons: string[]; // why it doesn't qualify; empty when it does
  lastClose: number;
  lastCloseTime: number;
  signal: LatestSignal | null;
}

export function qualify(stats: BacktestStats): string[] {
  const r = QUALIFY_RULE;
  const reasons: string[] = [];
  if (stats.days < r.minDays) reasons.push(`only ${Math.round(stats.days)} days of history`);
  if (stats.trades < r.minTrades) reasons.push(`only ${stats.trades} trades`);
  if ((stats.profitFactor ?? 0) < r.minProfitFactor) reasons.push(`profit factor ${stats.profitFactor?.toFixed(2) ?? "—"}`);
  if (stats.annualReturnPct < r.minAnnualReturnPct) reasons.push(`${stats.annualReturnPct.toFixed(1)}% a year`);
  if (stats.returnPct <= stats.buyHoldPct) reasons.push(`didn't beat buy & hold (${stats.buyHoldPct.toFixed(1)}%)`);
  if (stats.maxDrawdownPct > r.maxDrawdownPct) reasons.push(`${stats.maxDrawdownPct.toFixed(1)}% drawdown`);
  if (Math.min(stats.firstHalfPct, stats.secondHalfPct) < r.minHalfReturnPct)
    reasons.push(`halves ${stats.firstHalfPct.toFixed(1)}% / ${stats.secondHalfPct.toFixed(1)}%`);
  return reasons;
}

function windowStats(candles: OHLC[], equity: { time: number; equity: number }[], returnPct: number, days: number) {
  const first = candles[0];
  const lastBar = candles[candles.length - 1];
  const buyHoldPct = ((lastBar.close - first.open) / first.open) * 100;
  const annualReturnPct = days > 0 ? (Math.pow(1 + returnPct / 100, 365 / days) - 1) * 100 : 0;
  if (equity.length < 2) return { annualReturnPct, buyHoldPct, firstHalfPct: 0, secondHalfPct: 0 };
  const midTime = (equity[0].time + equity[equity.length - 1].time) / 2;
  const mid = equity.find((p) => p.time >= midTime) ?? equity[equity.length - 1];
  const start = equity[0].equity;
  const end = equity[equity.length - 1].equity;
  return {
    annualReturnPct,
    buyHoldPct,
    firstHalfPct: (mid.equity / start - 1) * 100,
    secondHalfPct: (end / mid.equity - 1) * 100,
  };
}

const rr = (side: Side, entry: number, stop: number | null, target: number | null) => {
  if (stop === null || target === null) return null;
  const d = side === "LONG" ? 1 : -1;
  const risk = (entry - stop) * d;
  return risk > 0 ? ((target - entry) * d) / risk : null;
};

export function scanStrategy(input: {
  strategyKey: string;
  symbol: string;
  interval: string;
  candles: OHLC[]; // closed candles only, oldest first
  htfCandles?: OHLC[];
  now: number;
  strategy?: Strategy; // tests pass a stub; otherwise built from the registry
}): SignalRow | null {
  const { strategyKey, symbol, interval, candles, htfCandles, now } = input;
  if (candles.length === 0) return null;
  const strategy = input.strategy ?? createCodedStrategy(strategyKey, htfCandles);
  if (!strategy) return null;

  // Run the strategy once and hand its output to the backtest, rather than
  // letting the backtest run it a second time.
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets?.(candles);
  const hasTargets = Boolean(targets);
  const result = runCodedBacktest(candles, {
    name: strategy.name,
    generateSignals: () => signals,
    ...(targets && { getTradeTargets: () => targets }),
  }, BACKTEST_SETTINGS);

  const m = result.metrics;
  const stats: BacktestStats = {
    trades: m.count,
    winRatePct: (m.winRate ?? 0) * 100,
    profitFactor: Number.isFinite(m.profitFactor ?? NaN) ? (m.profitFactor as number) : null,
    returnPct: m.totalReturnPercent,
    maxDrawdownPct: m.maxDrawdownPercent,
    days: m.testPeriodDays,
    ...windowStats(candles, result.equityCurve, m.totalReturnPercent, m.testPeriodDays),
  };

  const reasons = qualify(stats);
  const last = candles.length - 1;
  const lastBar = candles[last];
  const trips = result.roundTrips;
  const lastTrip = trips[trips.length - 1];
  const openTrip = lastTrip?.exitType === "end-of-data" ? lastTrip : undefined;

  let signal: LatestSignal | null = null;

  // A signal on the last closed candle: the backtest would enter at the
  // next open, unless it's already in a trade it wouldn't reverse.
  const s = signals[last];
  if (s === "BUY" || s === "SELL") {
    const side: Side = s === "BUY" ? "LONG" : "SHORT";
    const t = targets?.[last] ?? null;
    const valid = !hasTargets || t !== null;
    const blocked = openTrip && (hasTargets || openTrip.side === side);
    if (valid && !blocked) {
      const stop = t?.stopLoss ?? null;
      const target = t?.takeProfit ?? null;
      signal = {
        status: "new",
        side,
        signalTime: lastBar.closeTime,
        entry: lastBar.close,
        stop,
        target,
        rr: rr(side, lastBar.close, stop, target),
        exitPrice: null,
        exitTime: null,
        rMultiple: null,
      };
    }
  }

  if (!signal && lastTrip) {
    const signalBar = candles[lastTrip.entryIndex - 1];
    const t = targets?.[lastTrip.entryIndex - 1] ?? null;
    const stop = lastTrip.initialStop ?? t?.stopLoss ?? null;
    const target = t?.takeProfit ?? null;
    const base = {
      side: lastTrip.side,
      signalTime: signalBar?.closeTime ?? lastTrip.entryTime,
      entry: lastTrip.entryPrice,
      stop,
      target,
      rr: rr(lastTrip.side, lastTrip.entryPrice, stop, target),
    };
    if (openTrip) {
      const d = openTrip.side === "LONG" ? 1 : -1;
      const risk = stop !== null ? (openTrip.entryPrice - stop) * d : 0;
      signal = {
        ...base,
        status: "open",
        exitPrice: null,
        exitTime: null,
        rMultiple: risk > 0 ? ((lastBar.close - openTrip.entryPrice) * d) / risk : null,
      };
    } else if (now - base.signalTime <= RECENT_MS) {
      const status: SignalStatus =
        lastTrip.exitType === "target" ? "target" : lastTrip.exitType === "stop" ? "stop" : "closed";
      signal = {
        ...base,
        status,
        exitPrice: lastTrip.exitPrice,
        exitTime: lastTrip.exitTime,
        rMultiple: lastTrip.rMultiple,
      };
    }
  }

  return {
    id: `${strategyKey}:${symbol}:${interval}`,
    strategyKey,
    strategyName: strategy.name,
    symbol,
    interval,
    stats,
    qualified: reasons.length === 0,
    reasons,
    lastClose: lastBar.close,
    lastCloseTime: lastBar.closeTime,
    signal,
  };
}
