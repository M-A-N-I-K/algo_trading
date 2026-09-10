import { atr } from "../indicators/atr";
import { pivotHigh, pivotLow } from "../indicators/pivots";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface FibonacciRetracementContinuationOptions {
  pivotLookback?: number;
  minBarsBeforeRetestCounts?: number;
  touchesRequired?: number;
  // Retracement zone boundaries, measured back from the swing extreme
  // (0.5 = 50%, 0.618 = the golden ratio).
  zoneShallow?: number;
  zoneDeep?: number;
  // Stop sits beyond a deep retracement level (0.786), padded by ATR.
  stopFibLevel?: number;
  atrLength?: number;
  atrStopMultiple?: number;
  // Target is an extension of the swing leg beyond its origin.
  targetExtension?: number;
}

interface Pivot {
  price: number;
  type: 1 | -1; // 1 = high, -1 = low
}

// Ported from the "Fibonacci Retracement Continuation" Pine script (also
// saved as "Swing Structure Pullback (Auto-Backtest)" — identical logic):
// tracks the last completed swing leg (alternating pivot high/low), waits
// for price to retrace into its 50%-61.8% zone at least once, then enters
// on a continuation candle breaking back out of the zone in the leg's
// original direction. Stop sits past the 78.6% retracement (+ATR buffer);
// target is a 127.2% extension of the leg beyond its origin.
export function createFibonacciRetracementContinuationStrategy(
  options: FibonacciRetracementContinuationOptions = {},
): Strategy {
  const {
    pivotLookback = 5,
    minBarsBeforeRetestCounts = 3,
    touchesRequired = 1,
    zoneShallow = 0.5,
    zoneDeep = 0.618,
    stopFibLevel = 0.786,
    atrLength = 14,
    atrStopMultiple = 0.5,
    targetExtension = 1.272,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Fibonacci Retracement Continuation",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = pivotLookback * 2 + 5;
      if (n < warmup) return signals;

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
      const atrValues = atr(candles, atrLength);

      let lastPivot: Pivot | null = null;
      let prevPivot: Pivot | null = null;

      let barsSinceLeg = 0;
      let touchCount = 0;
      let prevPivB: number | null = null;

      for (let t = 0; t < n; t++) {
        let legChanged = false;

        if (ph[t] !== null) {
          if (lastPivot?.type === 1) {
            lastPivot = { price: ph[t]!, type: 1 };
          } else {
            prevPivot = lastPivot;
            lastPivot = { price: ph[t]!, type: 1 };
            legChanged = true;
          }
        }

        if (pl[t] !== null) {
          if (lastPivot?.type === -1) {
            lastPivot = { price: pl[t]!, type: -1 };
          } else {
            prevPivot = lastPivot;
            lastPivot = { price: pl[t]!, type: -1 };
            legChanged = true;
          }
        }

        const haveLeg = prevPivot !== null && lastPivot !== null;
        if (!haveLeg) continue;

        const legDir = lastPivot!.type;
        const pivA = prevPivot!.price;
        const pivB = lastPivot!.price;
        const legLen = Math.abs(pivB - pivA);

        const zoneTop = legDir === 1 ? pivB - zoneShallow * legLen : pivB + zoneDeep * legLen;
        const zoneBottom = legDir === 1 ? pivB - zoneDeep * legLen : pivB + zoneShallow * legLen;

        if (pivB !== prevPivB || legChanged) {
          barsSinceLeg = 0;
          touchCount = 0;
        } else {
          barsSinceLeg += 1;
        }
        prevPivB = pivB;

        const candle = candles[t];
        const touched =
          candle.high >= zoneBottom && candle.low <= zoneTop && barsSinceLeg >= minBarsBeforeRetestCounts;
        if (touched) touchCount += 1;

        if (isNaN(atrValues[t])) continue;

        const isGreen = candle.close > candle.open;
        const isRed = candle.close < candle.open;

        if (legDir === 1 && touchCount >= touchesRequired && isGreen && candle.close > zoneTop) {
          const stopLoss = pivB - stopFibLevel * legLen - atrValues[t] * atrStopMultiple;
          const risk = candle.close - stopLoss;
          if (risk > 0) {
            signals[t] = "BUY";
            computedTargets[t] = { stopLoss, takeProfit: pivA + targetExtension * legLen };
          }
        } else if (legDir === -1 && touchCount >= touchesRequired && isRed && candle.close < zoneBottom) {
          const stopLoss = pivB + stopFibLevel * legLen + atrValues[t] * atrStopMultiple;
          const risk = stopLoss - candle.close;
          if (risk > 0) {
            signals[t] = "SELL";
            computedTargets[t] = { stopLoss, takeProfit: pivA - targetExtension * legLen };
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
