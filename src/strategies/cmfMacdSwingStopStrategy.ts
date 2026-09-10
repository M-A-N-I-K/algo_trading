import { cmf } from "../indicators/cmf";
import { macd } from "../indicators/macd";
import { pivotHigh, pivotLow } from "../indicators/pivots";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface CmfMacdSwingStopOptions {
  cmfLength?: number;
  macdFastLength?: number;
  macdSlowLength?: number;
  macdSignalLength?: number;
  pivotLookback?: number;
  rewardRiskRatio?: number;
}

// Ported from the "CMF + MACD Swing-Stop Strategy" Pine script: trade MACD
// signal-line crossovers, filtered by which side of zero Chaikin Money Flow
// is on (CMF > 0 => longs only, CMF < 0 => shorts only), with the stop set
// at the nearest confirmed swing low/high and target a fixed R-multiple away.
export function createCmfMacdSwingStopStrategy(options: CmfMacdSwingStopOptions = {}): Strategy {
  const {
    cmfLength = 20,
    macdFastLength = 12,
    macdSlowLength = 26,
    macdSignalLength = 9,
    pivotLookback = 5,
    rewardRiskRatio = 1.5,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "CMF + MACD Swing-Stop",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = Math.max(cmfLength, macdSlowLength + macdSignalLength, pivotLookback * 2) + 2;
      if (n < warmup) return signals;

      const closes = candles.map((c) => c.close);
      const cmfLine = cmf(candles, cmfLength);
      const { macdLine, signalLine } = macd(closes, macdFastLength, macdSlowLength, macdSignalLength);
      const ph = pivotHigh(
        candles.map((c) => c.high),
        pivotLookback,
        pivotLookback,
      );
      const pl = pivotLow(
        candles.map((c) => c.low),
        pivotLookback,
        pivotLookback,
      );

      let lastPivotHigh: number | null = null;
      let lastPivotLow: number | null = null;

      for (let t = 1; t < n; t++) {
        if (ph[t] !== null) lastPivotHigh = ph[t];
        if (pl[t] !== null) lastPivotLow = pl[t];

        if (
          isNaN(cmfLine[t]) ||
          isNaN(macdLine[t]) ||
          isNaN(signalLine[t]) ||
          isNaN(macdLine[t - 1]) ||
          isNaN(signalLine[t - 1])
        ) {
          continue;
        }

        const crossedOver = macdLine[t - 1] <= signalLine[t - 1] && macdLine[t] > signalLine[t];
        const crossedUnder = macdLine[t - 1] >= signalLine[t - 1] && macdLine[t] < signalLine[t];

        const close = candles[t].close;

        if (cmfLine[t] > 0 && crossedOver && lastPivotLow !== null) {
          const risk = close - lastPivotLow;
          if (risk > 0) {
            signals[t] = "BUY";
            computedTargets[t] = { stopLoss: lastPivotLow, takeProfit: close + risk * rewardRiskRatio };
          }
        } else if (cmfLine[t] < 0 && crossedUnder && lastPivotHigh !== null) {
          const risk = lastPivotHigh - close;
          if (risk > 0) {
            signals[t] = "SELL";
            computedTargets[t] = { stopLoss: lastPivotHigh, takeProfit: close - risk * rewardRiskRatio };
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
