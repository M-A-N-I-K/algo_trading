import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface IchimokuCloudLongOnlySwingOptions {
  conversionLength?: number;
  baseLength?: number;
  laggingLength?: number;
  // How many bars back the cloud lines are read from (the video's
  // modification: 1 instead of the standard Ichimoku's 26).
  displacement?: number;
  // Take-profit expressed as a multiple of the stop-loss risk. The original
  // Pine script exits on a bearish close back under the cloud's green line
  // instead of a fixed target; since this backtester manages exits via a
  // fixed stop-loss/take-profit pair, the cloud's lower (red) line at entry
  // is used as the stop and this ratio derives the target from it.
  rewardRiskRatio?: number;
}

function donchianMid(candles: OHLC[], length: number, index: number): number {
  let highest = -Infinity;
  let lowest = Infinity;
  for (let j = index - length + 1; j <= index; j++) {
    if (candles[j].high > highest) highest = candles[j].high;
    if (candles[j].low < lowest) lowest = candles[j].low;
  }
  return (highest + lowest) / 2;
}

// Ported from the "Ichimoku Kumo Cloud Long-Only Swing" Pine script: a
// modified Ichimoku cloud (displacement=1, only Lead1/Senkou-A "green" and
// Lead2/Senkou-B "red" plotted) — long-only, entering on a green candle
// closing above both cloud lines while the cloud itself is bullish
// (green > red), exiting on a red candle closing back below the green line.
export function createIchimokuCloudLongOnlySwingStrategy(
  options: IchimokuCloudLongOnlySwingOptions = {},
): Strategy {
  const {
    conversionLength = 9,
    baseLength = 26,
    laggingLength = 52,
    displacement = 1,
    rewardRiskRatio = 2,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Ichimoku Cloud Long-Only Swing",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const maxLength = Math.max(conversionLength, baseLength, laggingLength);
      const warmup = maxLength + displacement + 1;
      if (n < warmup) return signals;

      for (let t = warmup; t < n; t++) {
        const srcIndex = t - displacement;

        const tenkan = donchianMid(candles, conversionLength, srcIndex);
        const kijun = donchianMid(candles, baseLength, srcIndex);
        const lead1 = (tenkan + kijun) / 2; // green line
        const lead2 = donchianMid(candles, laggingLength, srcIndex); // red line

        const candle = candles[t];
        const isGreen = candle.close > candle.open;

        if (isGreen && candle.close > Math.max(lead1, lead2) && lead1 > lead2) {
          const stopLoss = lead2;
          const risk = candle.close - stopLoss;
          if (risk > 0) {
            signals[t] = "BUY";
            computedTargets[t] = { stopLoss, takeProfit: candle.close + risk * rewardRiskRatio };
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
