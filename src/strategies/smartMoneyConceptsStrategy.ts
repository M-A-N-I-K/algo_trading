import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface SmcOptions {
  swingLookback?: number;
  fvgEntryMode?: "midpoint" | "touch";
  fvgMaxAgeCandles?: number;
  minRrRatio?: number;
  fixedRrRatio?: number;
}

interface FvgZone {
  type: "BULLISH" | "BEARISH";
  low: number;
  high: number;
  midpoint: number;
  createdAt: number;
  sweepPoint: number; // Low of bullish sweep or High of bearish sweep
  mitigated: boolean;
}

function findFractalSwings(candles: OHLC[], lookback: number) {
  const isSwingHigh = new Array(candles.length).fill(false);
  const isSwingLow = new Array(candles.length).fill(false);

  for (let i = lookback; i < candles.length - lookback; i++) {
    let swingHigh = true;
    let swingLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) swingHigh = false;
      if (candles[j].low <= candles[i].low) swingLow = false;
    }

    isSwingHigh[i] = swingHigh;
    isSwingLow[i] = swingLow;
  }

  return { isSwingHigh, isSwingLow };
}

function getNearestSwingHigh(
  candles: OHLC[],
  isSwingHigh: boolean[],
  currentIndex: number,
  lookback: number,
): number {
  for (let i = currentIndex - lookback; i >= 0; i--) {
    if (isSwingHigh[i]) {
      return candles[i].high;
    }
  }
  return candles[currentIndex].high;
}

function getNearestSwingLow(
  candles: OHLC[],
  isSwingLow: boolean[],
  currentIndex: number,
  lookback: number,
): number {
  for (let i = currentIndex - lookback; i >= 0; i--) {
    if (isSwingLow[i]) {
      return candles[i].low;
    }
  }
  return candles[currentIndex].low;
}

export function createSmartMoneyConceptsStrategy(
  options: SmcOptions = {},
): Strategy {
  const {
    swingLookback = 5,
    fvgEntryMode = "midpoint",
    fvgMaxAgeCandles = 60,
    minRrRatio = 2.0,
    fixedRrRatio = 3.0,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: `Smart Money Concepts (Liquidity Sweep + CHoCH + FVG ${fvgEntryMode.toUpperCase()})`,

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = swingLookback * 3 + 10;
      if (n < warmup) {
        return signals;
      }

      const { isSwingHigh, isSwingLow } = findFractalSwings(candles, swingLookback);

      let activeSupport: number | null = null;
      let activeResistance: number | null = null;

      // Setup tracking state
      let bullishSetup: {
        sweepLow: number;
        lastLowerHigh: number;
        active: boolean;
        createdAt: number;
      } | null = null;

      let bearishSetup: {
        sweepHigh: number;
        lastHigherLow: number;
        active: boolean;
        createdAt: number;
      } | null = null;

      const activeFvgs: FvgZone[] = [];

      for (let t = 0; t < n; t++) {
        const candle = candles[t];

        // 1. Reveal past fractal swing points (delay of swingLookback to prevent lookahead bias)
        const revealIdx = t - swingLookback;
        if (revealIdx >= 0) {
          if (isSwingLow[revealIdx]) {
            activeSupport = candles[revealIdx].low;
          }
          if (isSwingHigh[revealIdx]) {
            activeResistance = candles[revealIdx].high;
          }
        }

        if (t < warmup) continue;

        // 2. Check for Liquidity Sweeps (Fakeouts at Support/Resistance)
        // Bullish Liquidity Sweep: Price dips below active support, then closes back above or shows reversal
        if (
          activeSupport !== null &&
          candle.low < activeSupport &&
          candle.close > activeSupport * 0.998
        ) {
          // Identify the last lower high prior to this sweep
          const lastLH = getNearestSwingHigh(candles, isSwingHigh, t, swingLookback);
          bullishSetup = {
            sweepLow: candle.low,
            lastLowerHigh: lastLH,
            active: true,
            createdAt: t,
          };
        }

        // Bearish Liquidity Sweep: Price spikes above active resistance, then closes back below
        if (
          activeResistance !== null &&
          candle.high > activeResistance &&
          candle.close < activeResistance * 1.002
        ) {
          // Identify the last higher low prior to this sweep
          const lastHL = getNearestSwingLow(candles, isSwingLow, t, swingLookback);
          bearishSetup = {
            sweepHigh: candle.high,
            lastHigherLow: lastHL,
            active: true,
            createdAt: t,
          };
        }

        // Clean up expired setups (e.g. older than 40 candles)
        if (bullishSetup && t - bullishSetup.createdAt > 40) {
          bullishSetup.active = false;
        }
        if (bearishSetup && t - bearishSetup.createdAt > 40) {
          bearishSetup.active = false;
        }

        // 3. Check for Change of Character (CHoCH)
        // Bullish CHoCH: Price breaks above the last lower high after a liquidity sweep
        if (
          bullishSetup &&
          bullishSetup.active &&
          candle.close > bullishSetup.lastLowerHigh
        ) {
          // Bullish CHoCH confirmed! Look for FVG in the recent impulse move (last 5 candles)
          const startScan = Math.max(2, t - 6);
          for (let k = startScan; k <= t; k++) {
            const c1 = candles[k - 2];
            const c2 = candles[k - 1];
            const c3 = candles[k];

            if (c2.close > c2.open && c1.high < c3.low) {
              const low = c1.high;
              const high = c3.low;
              const midpoint = (low + high) / 2;
              activeFvgs.push({
                type: "BULLISH",
                low,
                high,
                midpoint,
                createdAt: t,
                sweepPoint: bullishSetup.sweepLow,
                mitigated: false,
              });
            }
          }
          // Consume the bullish setup so CHoCH isn't triggered repeatedly
          bullishSetup.active = false;
        }

        // Bearish CHoCH: Price breaks below the last higher low after a liquidity sweep
        if (
          bearishSetup &&
          bearishSetup.active &&
          candle.close < bearishSetup.lastHigherLow
        ) {
          // Bearish CHoCH confirmed! Look for FVG in the recent impulse move
          const startScan = Math.max(2, t - 6);
          for (let k = startScan; k <= t; k++) {
            const c1 = candles[k - 2];
            const c2 = candles[k - 1];
            const c3 = candles[k];

            if (c2.close < c2.open && c1.low > c3.high) {
              const low = c3.high;
              const high = c1.low;
              const midpoint = (low + high) / 2;
              activeFvgs.push({
                type: "BEARISH",
                low,
                high,
                midpoint,
                createdAt: t,
                sweepPoint: bearishSetup.sweepHigh,
                mitigated: false,
              });
            }
          }
          // Consume the bearish setup
          bearishSetup.active = false;
        }

        // 4. Invalidate / Mitigate FVGs if price breaks past them completely or expires
        for (const fvg of activeFvgs) {
          if (fvg.mitigated) continue;
          if (t - fvg.createdAt > fvgMaxAgeCandles) {
            fvg.mitigated = true;
            continue;
          }
          if (fvg.type === "BULLISH" && candle.close < fvg.low) {
            fvg.mitigated = true;
          }
          if (fvg.type === "BEARISH" && candle.close > fvg.high) {
            fvg.mitigated = true;
          }
        }

        // 5. Evaluate Retests into active FVGs for Signal Generation
        for (const fvg of activeFvgs) {
          if (fvg.mitigated || t <= fvg.createdAt) continue;

          // BUY SIGNAL (Bullish FVG retest)
          if (fvg.type === "BULLISH") {
            const targetEntryPrice =
              fvgEntryMode === "midpoint" ? fvg.midpoint : fvg.high;
            const touched = candle.low <= targetEntryPrice && candle.close >= fvg.low;

            if (touched) {
              const stopLoss = Math.min(fvg.low, fvg.sweepPoint) * 0.998;
              const risk = candle.close - stopLoss;

              if (risk > 0) {
                const nearestHigh = getNearestSwingHigh(
                  candles,
                  isSwingHigh,
                  t,
                  swingLookback,
                );
                const targetReward = Math.max(
                  nearestHigh - candle.close,
                  risk * fixedRrRatio,
                );
                const takeProfit = candle.close + targetReward;

                if (targetReward / risk >= minRrRatio) {
                  signals[t] = "BUY";
                  computedTargets[t] = { stopLoss, takeProfit };
                  fvg.mitigated = true; // One trade per FVG setup
                  break;
                }
              }
            }
          }

          // SELL SIGNAL (Bearish FVG retest)
          if (fvg.type === "BEARISH") {
            const targetEntryPrice =
              fvgEntryMode === "midpoint" ? fvg.midpoint : fvg.low;
            const touched = candle.high >= targetEntryPrice && candle.close <= fvg.high;

            if (touched) {
              const stopLoss = Math.max(fvg.high, fvg.sweepPoint) * 1.002;
              const risk = stopLoss - candle.close;

              if (risk > 0) {
                const nearestLow = getNearestSwingLow(
                  candles,
                  isSwingLow,
                  t,
                  swingLookback,
                );
                const targetReward = Math.max(
                  candle.close - nearestLow,
                  risk * fixedRrRatio,
                );
                const takeProfit = candle.close - targetReward;

                if (targetReward / risk >= minRrRatio) {
                  signals[t] = "SELL";
                  computedTargets[t] = { stopLoss, takeProfit };
                  fvg.mitigated = true; // One trade per FVG setup
                  break;
                }
              }
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
