import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface Trade {
  side: "LONG" | "SHORT";
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
}

export interface BacktestOptions {
  initialBalance?: number;
  // Fraction of current balance committed to each new position (0-1].
  positionSizePercent?: number;
  // Per-side fee rate, e.g. 0.0004 for Binance USDT-M futures taker fee.
  feeRate?: number;
  // Max percentage of account balance risked per trade (e.g. 0.02 for 2%).
  maxRiskPercent?: number;
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
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
}

// Simulates trading `signals` against `candles` one-for-one. Signals are
// "always in market": BUY opens/flips to long, SELL opens/flips to short,
// HOLD does nothing. Positions are sized as a fraction of current balance
// and marked to market each candle for the equity curve.
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
  } = options;

  let balance = initialBalance;
  let position: OpenPosition | null = null;

  const trades: Trade[] = [];
  const equityCurve: number[] = [];

  const closePosition = (exitPrice: number, exitTime: number) => {
    if (!position) return;

    const direction = position.side === "LONG" ? 1 : -1;
    const grossPnl =
      direction * (exitPrice - position.entryPrice) * position.quantity;
    const fee =
      (position.entryPrice + exitPrice) * position.quantity * feeRate;
    const pnl = grossPnl - fee;
    balance += pnl;

    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime,
      exitPrice,
      quantity: position.quantity,
      pnl,
      pnlPercent: (pnl / (position.entryPrice * position.quantity)) * 100,
    });

    position = null;
  };

  const openPosition = (
    side: "LONG" | "SHORT",
    price: number,
    time: number,
    stopLoss?: number,
    takeProfit?: number,
  ) => {
    let quantity = (balance * positionSizePercent) / price;
    if (maxRiskPercent !== undefined && stopLoss !== undefined) {
      const lossPerAsset = Math.abs(price - stopLoss);
      if (lossPerAsset > 0) {
        const riskQuantity = (balance * maxRiskPercent) / lossPerAsset;
        quantity = Math.min(riskQuantity, quantity);
      }
    }
    position = { side, entryPrice: price, entryTime: time, quantity, stopLoss, takeProfit };
  };

  for (let i = 0; i < candles.length; i++) {
    const signal = signals[i];
    const candle = candles[i];

    if (position && targets) {
      if (position.side === "LONG") {
        const sl = position.stopLoss!;
        const tp = position.takeProfit!;
        if (candle.low <= sl) {
          const exitPrice = candle.open < sl ? candle.open : sl;
          closePosition(exitPrice, candle.closeTime);
        } else if (candle.high >= tp) {
          const exitPrice = candle.open > tp ? candle.open : tp;
          closePosition(exitPrice, candle.closeTime);
        }
      } else if (position.side === "SHORT") {
        const sl = position.stopLoss!;
        const tp = position.takeProfit!;
        if (candle.high >= sl) {
          const exitPrice = candle.open > sl ? candle.open : sl;
          closePosition(exitPrice, candle.closeTime);
        } else if (candle.low <= tp) {
          const exitPrice = candle.open < tp ? candle.open : tp;
          closePosition(exitPrice, candle.closeTime);
        }
      }
    }

    if (targets) {
      if (!position) {
        if (signal === "BUY") {
          const target = targets[i];
          if (target) {
            openPosition("LONG", candle.close, candle.closeTime, target.stopLoss, target.takeProfit);
          }
        } else if (signal === "SELL") {
          const target = targets[i];
          if (target) {
            openPosition("SHORT", candle.close, candle.closeTime, target.stopLoss, target.takeProfit);
          }
        }
      }
    } else {
      if (signal === "BUY") {
        if (position && position.side === "SHORT") {
          closePosition(candle.close, candle.closeTime);
        }
        if (!position) openPosition("LONG", candle.close, candle.closeTime);
      } else if (signal === "SELL") {
        if (position && position.side === "LONG") {
          closePosition(candle.close, candle.closeTime);
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
    closePosition(last.close, last.closeTime);
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
