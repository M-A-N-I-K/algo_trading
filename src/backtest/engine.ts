import { OHLC } from "../indicators/utils";
import { PartialExitLevel, Signal, Strategy, TradeTarget } from "../types";

export interface Trade {
  side: "LONG" | "SHORT";
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  // "partial" for a partial take-profit fill, "final" for the close that
  // fully flattens the position (stop, take-profit, trailing stop, or the
  // last candle in the dataset).
  exitReason: "partial" | "final";
}

export interface BacktestOptions {
  initialBalance?: number;
  // Fraction of current balance committed to each new position (0-1].
  positionSizePercent?: number;
  // Per-side fee rate, e.g. 0.0004 for Binance USDT-M futures taker fee.
  feeRate?: number;
  // Max percentage of account balance risked per trade (e.g. 0.02 for 2%).
  maxRiskPercent?: number;
  // Minimum required Risk-to-Reward ratio to execute a trade setup.
  minRiskRewardRatio?: number;
  // Slippage applied to every fill (entry, stop, take-profit, partials) as
  // a fraction of price, e.g. 0.0005 = 0.05%. Always moves the fill against
  // the trader (worse than the nominal level).
  slippagePercent?: number;
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: number[];
  finalBalance: number;
  totalReturnPercent: number;
  winRate: number;
  maxDrawdownPercent: number;
}

interface OpenPosition {
  side: "LONG" | "SHORT";
  entryPrice: number;
  entryTime: number;
  quantity: number; // remaining open quantity
  originalQuantity: number;
  stopLoss?: number;
  takeProfit?: number;
  partialExits?: (PartialExitLevel & { filled: boolean })[];
  trailTriggerR?: number;
  trailDistance?: number;
  initialRisk?: number;
  trailingActive?: boolean;
}

// Simulates trading `signals` against `candles` one-for-one. Signals are
// "always in market": BUY opens/flips to long, SELL opens/flips to short,
// HOLD does nothing. Positions are sized as a fraction of current balance
// and marked to market each candle for the equity curve. When `targets`
// includes partial-exit levels and/or a trailing stop, those are honored
// on top of the base stop-loss/take-profit.
export function backtest(
  candles: OHLC[],
  signals: Signal[],
  options: BacktestOptions = {},
  targets?: (TradeTarget | null)[],
): BacktestResult {
  const {
    initialBalance = 10000,
    positionSizePercent = 1,
    feeRate = 0.0004,
    maxRiskPercent,
    slippagePercent = 0,
  } = options;

  let balance = initialBalance;
  let position: OpenPosition | null = null;

  const trades: Trade[] = [];
  const equityCurve: number[] = [];

  // Slippage always moves the fill against the trader: worse entries,
  // worse exits, regardless of side.
  const slip = (price: number, side: "LONG" | "SHORT", action: "entry" | "exit"): number => {
    if (slippagePercent === 0) return price;
    const adverse = (side === "LONG") === (action === "entry") ? 1 : -1;
    return price * (1 + adverse * slippagePercent);
  };

  const realizeExit = (exitPrice: number, exitTime: number, qty: number, reason: "partial" | "final") => {
    if (!position || qty <= 0) return;

    const filledPrice = slip(exitPrice, position.side, "exit");
    const direction = position.side === "LONG" ? 1 : -1;
    const grossPnl = direction * (filledPrice - position.entryPrice) * qty;
    const fee = (position.entryPrice + filledPrice) * qty * feeRate;
    const pnl = grossPnl - fee;
    balance += pnl;

    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime,
      exitPrice: filledPrice,
      quantity: qty,
      pnl,
      pnlPercent: (pnl / (position.entryPrice * qty)) * 100,
      exitReason: reason,
    });

    position.quantity -= qty;
    if (position.quantity <= 1e-9) {
      position = null;
    }
  };

  const openPosition = (
    side: "LONG" | "SHORT",
    price: number,
    time: number,
    stopLoss?: number,
    takeProfit?: number,
    partialExits?: PartialExitLevel[],
    trailTriggerR?: number,
    trailDistance?: number,
  ) => {
    const filledPrice = slip(price, side, "entry");
    let quantity = (balance * positionSizePercent) / filledPrice;
    if (maxRiskPercent !== undefined && stopLoss !== undefined) {
      const lossPerAsset = Math.abs(filledPrice - stopLoss);
      if (lossPerAsset > 0) {
        const riskQuantity = (balance * maxRiskPercent) / lossPerAsset;
        quantity = Math.min(riskQuantity, quantity);
      }
    }
    position = {
      side,
      entryPrice: filledPrice,
      entryTime: time,
      quantity,
      originalQuantity: quantity,
      stopLoss,
      takeProfit,
      partialExits: partialExits?.map((level) => ({ ...level, filled: false })),
      trailTriggerR,
      trailDistance,
      initialRisk: stopLoss !== undefined ? Math.abs(filledPrice - stopLoss) : undefined,
      trailingActive: false,
    };
  };

  for (let i = 0; i < candles.length; i++) {
    const signal = signals[i];
    const candle = candles[i];

    if (position && targets) {
      const isLong = position.side === "LONG";
      const sl = position.stopLoss!;
      const tp = position.takeProfit!;

      const stopHit = isLong ? candle.low <= sl : candle.high >= sl;
      if (stopHit) {
        const gapped = isLong ? candle.open < sl : candle.open > sl;
        realizeExit(gapped ? candle.open : sl, candle.closeTime, position.quantity, "final");
      }

      // Partial take-profit ladder, checked in order.
      if (position && position.partialExits && position.partialExits.length > 0) {
        for (const level of position.partialExits) {
          if (!position || level.filled) continue;
          const levelHit = isLong ? candle.high >= level.price : candle.low <= level.price;
          if (levelHit) {
            level.filled = true;
            const qty = Math.min(position.originalQuantity * level.portion, position.quantity);
            realizeExit(level.price, candle.closeTime, qty, "partial");
          }
        }
      }

      // Final take-profit on whatever quantity remains.
      if (position) {
        const tpHit = isLong ? candle.high >= tp : candle.low <= tp;
        if (tpHit) {
          const gapped = isLong ? candle.open > tp : candle.open < tp;
          realizeExit(gapped ? candle.open : tp, candle.closeTime, position.quantity, "final");
        }
      }

      // Trailing stop: ratchet the stop toward this candle's favorable
      // extreme once price has moved `trailTriggerR` multiples of initial
      // risk in the trade's favor. Only ever tightens.
      if (position && position.trailTriggerR !== undefined && position.trailDistance !== undefined && position.initialRisk) {
        const favorableMove = isLong
          ? candle.high - position.entryPrice
          : position.entryPrice - candle.low;

        if (position.trailingActive || favorableMove >= position.trailTriggerR * position.initialRisk) {
          position.trailingActive = true;
          const candidateStop = isLong
            ? candle.high - position.trailDistance
            : candle.low + position.trailDistance;
          position.stopLoss = isLong
            ? Math.max(position.stopLoss ?? -Infinity, candidateStop)
            : Math.min(position.stopLoss ?? Infinity, candidateStop);
        }
      }
    }

    if (targets) {
      if (!position) {
        if (signal === "BUY" || signal === "SELL") {
          const target = targets[i];
          if (target && target.stopLoss !== undefined && target.takeProfit !== undefined) {
            const price = candle.close;
            const isLong = signal === "BUY";
            const risk = isLong ? (price - target.stopLoss) : (target.stopLoss - price);
            const reward = isLong ? (target.takeProfit - price) : (price - target.takeProfit);

            let passRrCheck = true;
            if (options.minRiskRewardRatio !== undefined && risk > 0) {
              const rr = reward / risk;
              if (rr < options.minRiskRewardRatio) {
                passRrCheck = false;
              }
            }

            if (passRrCheck) {
              openPosition(
                isLong ? "LONG" : "SHORT",
                price,
                candle.closeTime,
                target.stopLoss,
                target.takeProfit,
                target.partialExits,
                target.trailTriggerR,
                target.trailDistance,
              );
            }
          }
        }
      }
    } else {
      if (signal === "BUY") {
        if (position && position.side === "SHORT") {
          realizeExit(candle.close, candle.closeTime, position.quantity, "final");
        }
        if (!position) openPosition("LONG", candle.close, candle.closeTime);
      } else if (signal === "SELL") {
        if (position && position.side === "LONG") {
          realizeExit(candle.close, candle.closeTime, position.quantity, "final");
        }
        if (!position) openPosition("SHORT", candle.close, candle.closeTime);
      }
    }

    let equity = balance;
    if (position) {
      const direction = position.side === "LONG" ? 1 : -1;
      equity +=
        direction * (candle.close - position.entryPrice) * position.quantity;
    }
    equityCurve.push(equity);
  }

  if (position && candles.length > 0) {
    const last = candles[candles.length - 1];
    realizeExit(last.close, last.closeTime, position.quantity, "final");
    equityCurve[equityCurve.length - 1] = balance;
  }

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  let peak = initialBalance;
  let maxDrawdownPercent = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdownPercent) maxDrawdownPercent = drawdown;
  }

  return {
    trades,
    equityCurve,
    finalBalance: balance,
    totalReturnPercent: ((balance - initialBalance) / initialBalance) * 100,
    winRate,
    maxDrawdownPercent,
  };
}

// Convenience wrapper: derives signals from a Strategy, then runs the
// simulation against the same candles.
export function runBacktest(
  candles: OHLC[],
  strategy: Strategy,
  options: BacktestOptions = {},
): BacktestResult {
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets ? strategy.getTradeTargets(candles) : undefined;
  return backtest(candles, signals, options, targets);
}
