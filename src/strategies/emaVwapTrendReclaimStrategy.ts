import { ema } from "../indicators/ema";
import { vwap } from "../indicators/vwap";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface EmaVwapTrendReclaimOptions {
  emaLength?: number;
  // Bias (price on one side of both EMA and VWAP) must hold for this many
  // consecutive bars before a pullback/reclaim entry is armed.
  confirmBars?: number;
  // Take-profit expressed as a multiple of the stop-loss risk. The original
  // Pine script exits on a trend-invalidation close through the EMA instead
  // of a fixed target; since this backtester manages exits via a fixed
  // stop-loss/take-profit pair, the EMA level at entry is used as the stop
  // and this ratio derives the target from it.
  rewardRiskRatio?: number;
}

// Ported from the "EMA + VWAP Trend Reclaim" Pine script: only trade in the
// direction price is holding on both sides of the EMA and session VWAP,
// then enter on a pullback into the EMA that closes back through it.
export function createEmaVwapTrendReclaimStrategy(options: EmaVwapTrendReclaimOptions = {}): Strategy {
  const { emaLength = 9, confirmBars = 3, rewardRiskRatio = 2 } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "EMA + VWAP Trend Reclaim",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n < emaLength + confirmBars + 2) return signals;

      const closes = candles.map((c) => c.close);
      const emaLine = ema(closes, emaLength);
      const vwapLine = vwap(candles);

      let bullStreak = 0;
      let bearStreak = 0;

      for (let t = 0; t < n; t++) {
        if (isNaN(emaLine[t])) continue;

        const candle = candles[t];
        const bullBar = candle.close > emaLine[t] && candle.close > vwapLine[t];
        const bearBar = candle.close < emaLine[t] && candle.close < vwapLine[t];

        bullStreak = bullBar ? bullStreak + 1 : 0;
        bearStreak = bearBar ? bearStreak + 1 : 0;

        const bullConfirmed = bullBar && bullStreak >= confirmBars;
        const bearConfirmed = bearBar && bearStreak >= confirmBars;

        if (bullConfirmed && candle.low <= emaLine[t] && candle.close > emaLine[t] && candle.close > vwapLine[t]) {
          const stopLoss = emaLine[t];
          const risk = candle.close - stopLoss;
          if (risk > 0) {
            signals[t] = "BUY";
            computedTargets[t] = { stopLoss, takeProfit: candle.close + risk * rewardRiskRatio };
          }
        } else if (
          bearConfirmed &&
          candle.high >= emaLine[t] &&
          candle.close < emaLine[t] &&
          candle.close < vwapLine[t]
        ) {
          const stopLoss = emaLine[t];
          const risk = stopLoss - candle.close;
          if (risk > 0) {
            signals[t] = "SELL";
            computedTargets[t] = { stopLoss, takeProfit: candle.close - risk * rewardRiskRatio };
          }
        }
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
