import { ema } from "../indicators/ema";
import { pivotHigh, pivotLow } from "../indicators/pivots";
import { inSessionWindow } from "../indicators/session";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface SessionLondonOpenBosOptions {
  // Higher-timeframe candles (e.g. 4h) used to compute the directional bias.
  // Without a real HTF series the bias can't be computed without lookahead,
  // so signals stay HOLD until it's supplied (see `run.ts`, which fetches
  // 4h candles automatically for this strategy key).
  htfCandles?: OHLC[];
  htfEmaLength?: number;
  tradeAsia?: boolean;
  tradeLondon?: boolean;
  tradeNewYork?: boolean;
  asiaSession?: string;
  londonSession?: string;
  newYorkSession?: string;
  pivotLookback?: number;
  rewardRiskRatio?: number;
}

// Ported from the "Session-Based London Open BOS" Pine strategy: at the
// open of each of the three major sessions (Asia/London/New York), read a
// higher-timeframe EMA bias and arm one trade for that session in the
// biased direction, triggered by a break of the most recent swing
// high/low (break-of-structure) on the execution timeframe.
export function createSessionLondonOpenBosStrategy(options: SessionLondonOpenBosOptions = {}): Strategy {
  const {
    htfCandles = [],
    htfEmaLength = 50,
    tradeAsia = true,
    tradeLondon = true,
    tradeNewYork = true,
    asiaSession = "0000-0200",
    londonSession = "0700-0900",
    newYorkSession = "1200-1400",
    pivotLookback = 5,
    rewardRiskRatio = 2,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Session-Based London Open BOS",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n < pivotLookback * 2 + 2 || htfCandles.length === 0) return signals;

      const htfCloses = htfCandles.map((c) => c.close);
      const htfEma = ema(htfCloses, htfEmaLength);

      // Non-repainting bias lookup: for each execution-timeframe bar, use
      // the most recently *closed* HTF candle at that point in time.
      let htfCursor = 0;
      const biasAt = (openTime: number): 1 | -1 | 0 => {
        while (htfCursor + 1 < htfCandles.length && htfCandles[htfCursor + 1].closeTime <= openTime) {
          htfCursor += 1;
        }
        if (htfCandles[htfCursor].closeTime > openTime) return 0;
        const close = htfCandles[htfCursor].close;
        const emaVal = htfEma[htfCursor];
        if (isNaN(emaVal)) return 0;
        if (close > emaVal) return 1;
        if (close < emaVal) return -1;
        return 0;
      };

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

      let armedToday = false;
      let dayBias: 1 | -1 | 0 = 0;

      let wasInAsia = false;
      let wasInLondon = false;
      let wasInNewYork = false;

      for (let t = 0; t < n; t++) {
        const candle = candles[t];
        const time = candle.openTime;

        const inAsia = tradeAsia && inSessionWindow(time, asiaSession);
        const inLondon = tradeLondon && inSessionWindow(time, londonSession);
        const inNewYork = tradeNewYork && inSessionWindow(time, newYorkSession);

        const sessionStart = (inAsia && !wasInAsia) || (inLondon && !wasInLondon) || (inNewYork && !wasInNewYork);
        if (sessionStart) {
          armedToday = true;
          dayBias = biasAt(time);
        }

        if (ph[t] !== null) lastPivotHigh = ph[t];
        if (pl[t] !== null) lastPivotLow = pl[t];

        const prevClose = t > 0 ? candles[t - 1].close : NaN;

        const longSignal =
          armedToday &&
          dayBias === 1 &&
          lastPivotHigh !== null &&
          candle.close > lastPivotHigh &&
          prevClose <= lastPivotHigh;
        const shortSignal =
          armedToday &&
          dayBias === -1 &&
          lastPivotLow !== null &&
          candle.close < lastPivotLow &&
          prevClose >= lastPivotLow;

        if (longSignal || shortSignal) armedToday = false;

        if (longSignal && lastPivotLow !== null) {
          const risk = candle.close - lastPivotLow;
          if (risk > 0) {
            signals[t] = "BUY";
            computedTargets[t] = { stopLoss: lastPivotLow, takeProfit: candle.close + risk * rewardRiskRatio };
          }
        } else if (shortSignal && lastPivotHigh !== null) {
          const risk = lastPivotHigh - candle.close;
          if (risk > 0) {
            signals[t] = "SELL";
            computedTargets[t] = { stopLoss: lastPivotHigh, takeProfit: candle.close - risk * rewardRiskRatio };
          }
        }

        wasInAsia = inAsia;
        wasInLondon = inLondon;
        wasInNewYork = inNewYork;
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
