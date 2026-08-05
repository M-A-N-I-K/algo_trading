import { ema } from "../indicators/ema";
import { macd } from "../indicators/macd";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface Macd200EmaSrOptions {
  trendEmaPeriod?: number;
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalPeriod?: number;
  swingLookback?: number;
  macdTriggerWindow?: number;
  macdCrossoverBelowZero?: boolean;
  macdCrossoverAboveZero?: boolean;
}

export function createMacd200EmaSrStrategy(
  options: Macd200EmaSrOptions = {},
): Strategy {
  const {
    trendEmaPeriod = 200,
    macdFastPeriod = 12,
    macdSlowPeriod = 26,
    macdSignalPeriod = 9,
    swingLookback = 5,
    macdTriggerWindow = 10,
    macdCrossoverBelowZero = true,
    macdCrossoverAboveZero = true,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "MACD Crossover + 200 EMA + Support/Resistance",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = Math.max(trendEmaPeriod, macdSlowPeriod + macdSignalPeriod, swingLookback * 2) + 5;
      if (n < warmup) return signals;

      const closes = candles.map((c) => c.close);
      const ema200 = ema(closes, trendEmaPeriod);
      const { macdLine, signalLine } = macd(
        closes,
        macdFastPeriod,
        macdSlowPeriod,
        macdSignalPeriod,
      );

      let activeSupports: number[] = [];
      let activeResistances: number[] = [];

      let lastSupportHitIndex = -9999;
      let lastResistanceHitIndex = -9999;

      for (let t = 0; t < n; t++) {
        const candle = candles[t];

        // 1. Invalidate S&R levels that are broken by close price
        activeSupports = activeSupports.filter((sup) => candle.close >= sup);
        activeResistances = activeResistances.filter((res) => candle.close <= res);

        // 2. Identify new confirmed swing points (swing points at t - swingLookback are confirmed at t)
        if (t >= swingLookback * 2) {
          const checkIdx = t - swingLookback;

          // Check swing low
          let isSwingLow = true;
          const lowVal = candles[checkIdx].low;
          for (let j = t - swingLookback * 2; j <= t; j++) {
            if (j === checkIdx) continue;
            if (candles[j].low <= lowVal) {
              isSwingLow = false;
              break;
            }
          }
          if (isSwingLow) {
            activeSupports.push(lowVal);
          }

          // Check swing high
          let isSwingHigh = true;
          const highVal = candles[checkIdx].high;
          for (let j = t - swingLookback * 2; j <= t; j++) {
            if (j === checkIdx) continue;
            if (candles[j].high >= highVal) {
              isSwingHigh = false;
              break;
            }
          }
          if (isSwingHigh) {
            activeResistances.push(highVal);
          }
        }

        // Warm-up check for indicators
        if (isNaN(ema200[t]) || isNaN(macdLine[t]) || isNaN(signalLine[t]) || isNaN(macdLine[t - 1]) || isNaN(signalLine[t - 1])) {
          continue;
        }

        // 3. Check for support/resistance hits on current candle
        // Support hit: low goes below or touches support, close is above it
        const isAboveEma = candle.close > ema200[t];
        if (isAboveEma) {
          const hitSupport = activeSupports.some((sup) => candle.low <= sup);
          if (hitSupport) {
            lastSupportHitIndex = t;
          }
        }

        // Resistance hit: high goes above or touches resistance, close is below it
        const isBelowEma = candle.close < ema200[t];
        if (isBelowEma) {
          const hitResistance = activeResistances.some((res) => candle.high >= res);
          if (hitResistance) {
            lastResistanceHitIndex = t;
          }
        }

        // 4. Check for MACD crossover
        const bullishCrossover = macdLine[t - 1] <= signalLine[t - 1] && macdLine[t] > signalLine[t];
        const bearishCrossover = macdLine[t - 1] >= signalLine[t - 1] && macdLine[t] < signalLine[t];

        // 5. Generate signals
        if (isAboveEma && bullishCrossover && (t - lastSupportHitIndex <= macdTriggerWindow)) {
          // Check if crossover occurs relative to zero line
          const validCrossover = !macdCrossoverBelowZero || (macdLine[t] < 0 && signalLine[t] < 0);
          if (validCrossover) {
            const stopLoss = ema200[t];
            if (candle.close > stopLoss) {
              signals[t] = "BUY";
              const risk = candle.close - stopLoss;
              const takeProfit = candle.close + 1.5 * risk;
              computedTargets[t] = { stopLoss, takeProfit };
            }
          }
        }

        if (isBelowEma && bearishCrossover && (t - lastResistanceHitIndex <= macdTriggerWindow)) {
          const validCrossover = !macdCrossoverAboveZero || (macdLine[t] > 0 && signalLine[t] > 0);
          if (validCrossover) {
            const stopLoss = ema200[t];
            if (candle.close < stopLoss) {
              signals[t] = "SELL";
              const risk = stopLoss - candle.close;
              const takeProfit = candle.close - 1.5 * risk;
              computedTargets[t] = { stopLoss, takeProfit };
            }
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
