import { ema } from "../indicators/ema";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface SupplyDemandOptions {
  impulseLookback?: number;
  impulseMultiplier?: number;
  baseMultiplier?: number;
  swingLookback?: number;
  trendEmaPeriod?: number;
  zoneMaxAgeCandles?: number;
  htfCandles?: OHLC[]; // Higher Timeframe candles (e.g. 4h) for multi-timeframe analysis
}

interface Zone {
  low: number;
  high: number;
  createdAt: number;
  validityReason: string;
}

interface HTFZone {
  type: "DEMAND" | "SUPPLY";
  low: number;
  high: number;
  createdAtTime: number; // closeTime of the 4h candle
  mitigated: boolean;
}

function bodySize(candle: OHLC): number {
  return Math.abs(candle.close - candle.open);
}

function isBullish(candle: OHLC): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: OHLC): boolean {
  return candle.close < candle.open;
}

function averageBody(candles: OHLC[], endIndex: number, period: number) {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, endIndex - period); i < endIndex; i++) {
    sum += bodySize(candles[i]);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function findFractalSwingPoints(candles: OHLC[], lookback: number) {
  const isSwingHigh = new Array(candles.length).fill(false);
  const isSwingLow = new Array(candles.length).fill(false);

  for (let i = lookback; i < candles.length - lookback; i++) {
    let swingHigh = true;
    let swingLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) {
        continue;
      }
      if (candles[j].high >= candles[i].high) {
        swingHigh = false;
      }
      if (candles[j].low <= candles[i].low) {
        swingLow = false;
      }
    }
    isSwingHigh[i] = swingHigh;
    isSwingLow[i] = swingLow;
  }

  return { isSwingHigh, isSwingLow };
}

function findNearestSwingHigh(
  candles: OHLC[],
  isSwingHigh: boolean[],
  t: number,
  lookback: number,
): number {
  for (let i = t - lookback; i >= 0; i--) {
    if (isSwingHigh[i]) {
      return candles[i].high;
    }
  }
  return candles[t].high;
}

function findNearestSwingLow(
  candles: OHLC[],
  isSwingLow: boolean[],
  t: number,
  lookback: number,
): number {
  for (let i = t - lookback; i >= 0; i--) {
    if (isSwingLow[i]) {
      return candles[i].low;
    }
  }
  return candles[t].low;
}

export function createSupplyDemandStrategy(
  options: SupplyDemandOptions = {},
): Strategy {
  const {
    impulseLookback = 14,
    impulseMultiplier = 1.5,
    baseMultiplier = 0.8,
    swingLookback = 5,
    trendEmaPeriod = 50,
    zoneMaxAgeCandles = 100,
    htfCandles
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: htfCandles 
      ? "Multi-Timeframe Supply & Demand (4H Zones + 15M Confirmations)"
      : "Strict Supply & Demand (Consolidation + Breakout + Rejection)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = Math.max(trendEmaPeriod, impulseLookback, swingLookback * 2) + 5;
      if (n < warmup) {
        return signals;
      }

      const closes = candles.map((c) => c.close);
      const ema50 = ema(closes, trendEmaPeriod);
      const { isSwingHigh, isSwingLow } = findFractalSwingPoints(candles, swingLookback);

      let lastSwingHigh: number | null = null;
      let lastSwingLow: number | null = null;
      let structuralTrend: "up" | "down" | "range" = "range";

      // 1. If Multi-Timeframe is enabled, precompute 4h Zones
      const activeHtfZones: HTFZone[] = [];
      if (htfCandles && htfCandles.length > 2) {
        for (let h = 2; h < htfCandles.length; h++) {
          const base = htfCandles[h - 2];
          const impulse = htfCandles[h - 1];
          const confirm = htfCandles[h];
          const avgBody = averageBody(htfCandles, h - 2, impulseLookback);

          const isBaseConsolidation = bodySize(base) <= baseMultiplier * avgBody;
          const isImpulseExplosive = bodySize(impulse) >= impulseMultiplier * avgBody;

          if (isBaseConsolidation && isImpulseExplosive) {
            // Demand zone: consolidation base before a bullish expansion
            if (isBullish(impulse) && isBearish(base) && base.high < confirm.low) {
              const zoneLow = Math.min(base.open, base.close);
              const zoneHigh = Math.max(confirm.low, Math.max(base.open, base.close));
              activeHtfZones.push({
                type: "DEMAND",
                low: zoneLow,
                high: zoneHigh,
                createdAtTime: confirm.closeTime,
                mitigated: false
              });
            }
            // Supply zone: consolidation base before a bearish expansion
            if (isBearish(impulse) && isBullish(base) && base.low > confirm.high) {
              const zoneHigh = Math.max(base.open, base.close);
              const zoneLow = Math.min(confirm.high, Math.min(base.open, base.close));
              activeHtfZones.push({
                type: "SUPPLY",
                low: zoneLow,
                high: zoneHigh,
                createdAtTime: confirm.closeTime,
                mitigated: false
              });
            }
          }
        }
      }

      // 2. Fallback single-timeframe zones
      let demandZones: Zone[] = [];
      let supplyZones: Zone[] = [];

      for (let t = 0; t < n; t++) {
        const candle = candles[t];

        // Reveal swing points and update structure
        const revealIndex = t - swingLookback;
        if (revealIndex >= 0) {
          if (isSwingHigh[revealIndex]) {
            lastSwingHigh = candles[revealIndex].high;
          }
          if (isSwingLow[revealIndex]) {
            lastSwingLow = candles[revealIndex].low;
          }
        }

        if (lastSwingHigh !== null && candle.close > lastSwingHigh) {
          structuralTrend = "up";
        }
        if (lastSwingLow !== null && candle.close < lastSwingLow) {
          structuralTrend = "down";
        }

        // Market structure classification
        const isBullishStructure =
          !isNaN(ema50[t]) && candle.close > ema50[t] && structuralTrend === "up";
        const isBearishStructure =
          !isNaN(ema50[t]) && candle.close < ema50[t] && structuralTrend === "down";

        if (htfCandles) {
          // --- MULTI-TIMEFRAME EXECUTION ---
          
          // Mitigate active HTF zones if price closes beyond them
          for (const zone of activeHtfZones) {
            if (zone.mitigated) continue;
            if (candle.closeTime >= zone.createdAtTime) {
              if (zone.type === "DEMAND" && candle.close < zone.low) {
                zone.mitigated = true;
              }
              if (zone.type === "SUPPLY" && candle.close > zone.high) {
                zone.mitigated = true;
              }
            }
          }

          // Evaluate rejection confirmations on Lower Timeframe (15m)
          const range = candle.high - candle.low;
          const lowerWick = Math.min(candle.open, candle.close) - candle.low;
          const upperWick = candle.high - Math.max(candle.open, candle.close);

          const isBullishRejection = range > 0 && lowerWick / range >= 0.4 && candle.close > candle.open;
          const isBullishEngulfing = candle.close > candle.open && t > 0 && candle.close > candles[t - 1].high;

          const isBearishRejection = range > 0 && upperWick / range >= 0.4 && candle.close < candle.open;
          const isBearishEngulfing = candle.close < candle.open && t > 0 && candle.close < candles[t - 1].low;

          // --- LONG ENTRY (4H DEMAND ZONE + 15M BULLISH TRIGGER) ---
          if (isBullishStructure) {
            for (const zone of activeHtfZones) {
              if (zone.type !== "DEMAND" || zone.mitigated) continue;
              if (candle.openTime < zone.createdAtTime) continue; // Skip if HTF candle hasn't closed yet

              const touched = candle.low <= zone.high && candle.close >= zone.low;
              if (touched) {
                if (isBullishRejection || isBullishEngulfing) {
                  const stopLoss = zone.low * 0.9995;
                  if (candle.close > stopLoss) {
                    signals[t] = "BUY";
                    const risk = candle.close - stopLoss;
                    const nearestHigh = findNearestSwingHigh(candles, isSwingHigh, t, swingLookback);
                    const takeProfit = Math.max(nearestHigh, candle.close + 2.0 * risk);
                    computedTargets[t] = { stopLoss, takeProfit };

                    zone.mitigated = true; // Use zone once
                    break;
                  }
                }
              }
            }
          }

          // --- SHORT ENTRY (4H SUPPLY ZONE + 15M BEARISH TRIGGER) ---
          if (isBearishStructure) {
            for (const zone of activeHtfZones) {
              if (zone.type !== "SUPPLY" || zone.mitigated) continue;
              if (candle.openTime < zone.createdAtTime) continue;

              const touched = candle.high >= zone.low && candle.close <= zone.high;
              if (touched) {
                if (isBearishRejection || isBearishEngulfing) {
                  const stopLoss = zone.high * 1.0005;
                  if (candle.close < stopLoss) {
                    signals[t] = "SELL";
                    const risk = stopLoss - candle.close;
                    const nearestLow = findNearestSwingLow(candles, isSwingLow, t, swingLookback);
                    const takeProfit = Math.min(nearestLow, candle.close - 2.0 * risk);
                    computedTargets[t] = { stopLoss, takeProfit };

                    zone.mitigated = true;
                    break;
                  }
                }
              }
            }
          }
        } else {
          // --- FALLBACK SINGLE-TIMEFRAME LOGIC ---
          
          // Invalidate mitigated/expired/broken zones
          demandZones = demandZones.filter(
            (zone) => t - zone.createdAt <= zoneMaxAgeCandles && candle.close >= zone.low,
          );
          supplyZones = supplyZones.filter(
            (zone) => t - zone.createdAt <= zoneMaxAgeCandles && candle.close <= zone.high,
          );

          // Zone detection (consolidation & breakout pattern)
          if (t >= 2) {
            const base = candles[t - 2];
            const impulse = candles[t - 1];
            const confirm = candle;
            const avgBody = averageBody(candles, t - 2, impulseLookback);

            const isBaseConsolidation = bodySize(base) <= baseMultiplier * avgBody;
            const isImpulseExplosive = bodySize(impulse) >= impulseMultiplier * avgBody;

            if (isBaseConsolidation && isImpulseExplosive) {
              if (isBullish(impulse) && isBearish(base) && base.high < confirm.low) {
                const zoneLow = Math.min(base.open, base.close);
                const zoneHigh = Math.max(confirm.low, Math.max(base.open, base.close));
                demandZones.push({
                  low: zoneLow,
                  high: zoneHigh,
                  createdAt: t,
                  validityReason: `Consolidation base followed by explosive bullish impulse.`
                });
              }

              if (isBearish(impulse) && isBullish(base) && base.low > confirm.high) {
                const zoneHigh = Math.max(base.open, base.close);
                const zoneLow = Math.min(confirm.high, Math.min(base.open, base.close));
                supplyZones.push({
                  low: zoneLow,
                  high: zoneHigh,
                  createdAt: t,
                  validityReason: `Consolidation base followed by explosive bearish impulse.`
                });
              }
            }
          }

          if (t < warmup) {
            continue;
          }

          // Check for revisits and rejection triggers
          const range = candle.high - candle.low;
          const lowerWick = Math.min(candle.open, candle.close) - candle.low;
          const upperWick = candle.high - Math.max(candle.open, candle.close);

          const isBullishRejection = range > 0 && lowerWick / range >= 0.4 && candle.close > candle.open;
          const isBullishEngulfing = candle.close > candle.open && candle.close > candles[t - 1].high;

          const isBearishRejection = range > 0 && upperWick / range >= 0.4 && candle.close < candle.open;
          const isBearishEngulfing = candle.close < candle.open && candle.close < candles[t - 1].low;

          // --- LONG ENTRY (DEMAND REVISIT) ---
          if (isBullishStructure) {
            for (let i = 0; i < demandZones.length; i++) {
              const zone = demandZones[i];
              if (t <= zone.createdAt) continue;

              const priceTouchedZone = candle.low <= zone.high && candle.close >= zone.low;
              if (priceTouchedZone) {
                if (isBullishRejection || isBullishEngulfing) {
                  const stopLoss = zone.low * 0.9995;
                  if (candle.close > stopLoss) {
                    signals[t] = "BUY";
                    const risk = candle.close - stopLoss;
                    const nearestHigh = findNearestSwingHigh(candles, isSwingHigh, t, swingLookback);
                    const takeProfit = Math.max(nearestHigh, candle.close + 2.0 * risk);
                    computedTargets[t] = { stopLoss, takeProfit };

                    demandZones.splice(i, 1);
                    break;
                  }
                }
              }
            }
          }

          // --- SHORT ENTRY (SUPPLY REVISIT) ---
          if (isBearishStructure) {
            for (let i = 0; i < supplyZones.length; i++) {
              const zone = supplyZones[i];
              if (t <= zone.createdAt) continue;

              const priceTouchedZone = candle.high >= zone.low && candle.close <= zone.high;
              if (priceTouchedZone) {
                if (isBearishRejection || isBearishEngulfing) {
                  const stopLoss = zone.high * 1.0005;
                  if (candle.close < stopLoss) {
                    signals[t] = "SELL";
                    const risk = stopLoss - candle.close;
                    const nearestLow = findNearestSwingLow(candles, isSwingLow, t, swingLookback);
                    const takeProfit = Math.min(nearestLow, candle.close - 2.0 * risk);
                    computedTargets[t] = { stopLoss, takeProfit };

                    supplyZones.splice(i, 1);
                    break;
                  }
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
    }
  };
}
