import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface OrderBlockOptions {
  swingLookback?: number;
  zoneMaxAgeCandles?: number;
  // Zone height (as % of price) above which the stop moves from the zone's
  // far edge to its midpoint, per the video's "don't risk 20-50% on one
  // stop, use the halfway point of a big order block" rule.
  largeZoneThresholdPercent?: number;
  // Minimum wick/range ratio required to count as a rejection reaction at a zone.
  rejectionWickRatio?: number;
  // Take-profit expressed as a multiple of risk, used only when there is no
  // next order block yet to target.
  fallbackRrRatio?: number;
  // Max candles (in zone-source-timeframe units) to scan backward from a
  // break-of-structure candle to find the opposite-colored order block candle.
  obLookbackCap?: number;
  // Higher-timeframe candles (e.g. 1h) used to draw the order block zones.
  // When omitted, zones are drawn from the same candles the strategy trades
  // on. When provided, `generateSignals`'s `candles` argument is treated as
  // the lower/execution timeframe (e.g. 1m or 5m) used only to trigger
  // entries against those higher-timeframe zones.
  htfCandles?: OHLC[];
}

interface OrderBlockZone {
  type: "BEARISH" | "BULLISH";
  low: number;
  high: number;
  createdAtTime: number; // closeTime of the confirmation candle, in the zone source's timeframe
  expiresAtTime: number;
  brokenThrough: boolean;
  traded: boolean;
}

function isBullish(c: OHLC): boolean {
  return c.close > c.open;
}

function isBearish(c: OHLC): boolean {
  return c.close < c.open;
}

function findFractalSwingPoints(candles: OHLC[], lookback: number) {
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

// Scans `sourceCandles` once, top to bottom, for break-of-structure moves
// and draws an order block zone from the last opposite-colored candle
// before each impulse leg (body-to-wick per the video's exact rule).
function computeZones(
  sourceCandles: OHLC[],
  swingLookback: number,
  obLookbackCap: number,
  zoneMaxAgeMs: number,
): { bearishZones: OrderBlockZone[]; bullishZones: OrderBlockZone[] } {
  const bearishZones: OrderBlockZone[] = [];
  const bullishZones: OrderBlockZone[] = [];

  const warmup = swingLookback * 3 + 10;
  if (sourceCandles.length < warmup) return { bearishZones, bullishZones };

  const { isSwingHigh, isSwingLow } = findFractalSwingPoints(sourceCandles, swingLookback);

  let lastSwingHigh: number | null = null;
  let lastSwingLow: number | null = null;
  let structuralTrend: "up" | "down" | "range" = "range";

  for (let t = 0; t < sourceCandles.length; t++) {
    const candle = sourceCandles[t];

    const revealIdx = t - swingLookback;
    if (revealIdx >= 0) {
      if (isSwingHigh[revealIdx]) lastSwingHigh = sourceCandles[revealIdx].high;
      if (isSwingLow[revealIdx]) lastSwingLow = sourceCandles[revealIdx].low;
    }

    if (lastSwingLow !== null && candle.close < lastSwingLow && structuralTrend !== "down") {
      structuralTrend = "down";
      let obIdx = t;
      let steps = 0;
      const floor = Math.max(0, t - obLookbackCap);
      while (obIdx > floor && isBearish(sourceCandles[obIdx]) && steps < obLookbackCap) {
        obIdx--;
        steps++;
      }
      if (isBullish(sourceCandles[obIdx])) {
        const ob = sourceCandles[obIdx];
        bearishZones.push({
          type: "BEARISH",
          low: Math.min(ob.open, ob.close),
          high: ob.high,
          createdAtTime: candle.closeTime,
          expiresAtTime: candle.closeTime + zoneMaxAgeMs,
          brokenThrough: false,
          traded: false,
        });
      }
    }

    if (lastSwingHigh !== null && candle.close > lastSwingHigh && structuralTrend !== "up") {
      structuralTrend = "up";
      let obIdx = t;
      let steps = 0;
      const floor = Math.max(0, t - obLookbackCap);
      while (obIdx > floor && isBullish(sourceCandles[obIdx]) && steps < obLookbackCap) {
        obIdx--;
        steps++;
      }
      if (isBearish(sourceCandles[obIdx])) {
        const ob = sourceCandles[obIdx];
        bullishZones.push({
          type: "BULLISH",
          low: ob.low,
          high: Math.max(ob.open, ob.close),
          createdAtTime: candle.closeTime,
          expiresAtTime: candle.closeTime + zoneMaxAgeMs,
          brokenThrough: false,
          traded: false,
        });
      }
    }
  }

  return { bearishZones, bullishZones };
}

// Implements the "Order Block" strategy: find a break-of-structure impulse,
// mark the last opposite-colored candle before it as the order block zone,
// then trade the two reactions price gives when it returns to that zone —
// a rejection (continuation of the original impulse) or a break-and-retest
// (continuation through the zone in the new direction). Stop-loss sits on
// the far side of the zone (or its midpoint for oversized zones);
// take-profit is the next order block in the trade's direction, falling
// back to a fixed R-multiple. Optionally draws zones from a higher
// timeframe (`htfCandles`) while triggering entries on the execution
// timeframe, per the "plot on 1h, trigger on 1m/5m" workflow.
export function createOrderBlockStrategy(options: OrderBlockOptions = {}): Strategy {
  const {
    swingLookback = 5,
    zoneMaxAgeCandles = 150,
    largeZoneThresholdPercent = 1.5,
    rejectionWickRatio = 0.4,
    fallbackRrRatio = 3.0,
    obLookbackCap = 20,
    htfCandles,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: htfCandles
      ? "Order Block (1H Zones + Lower-Timeframe Trigger)"
      : "Order Block (Break of Structure + Zone Rejection/Retest)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      const zoneSource = htfCandles && htfCandles.length > 0 ? htfCandles : candles;
      const sourceIntervalMs =
        zoneSource.length > 1 ? zoneSource[1].openTime - zoneSource[0].openTime : 0;
      const zoneMaxAgeMs = zoneMaxAgeCandles * sourceIntervalMs;

      const { bearishZones, bullishZones } = computeZones(
        zoneSource,
        swingLookback,
        obLookbackCap,
        zoneMaxAgeMs,
      );

      if (bearishZones.length === 0 && bullishZones.length === 0) return signals;

      // For oversized zones, risk the midpoint instead of the far edge —
      // per the video's "don't risk 20-50% on one stop" rule.
      const zoneStop = (zone: OrderBlockZone, refPrice: number, farEdge: number): number => {
        const heightPercent = ((zone.high - zone.low) / refPrice) * 100;
        if (heightPercent > largeZoneThresholdPercent) {
          return (zone.low + zone.high) / 2;
        }
        return farEdge;
      };

      const findNextZoneAbove = (price: number, exclude: OrderBlockZone): OrderBlockZone | null => {
        const candidates = [...bearishZones, ...bullishZones].filter(
          (z) => z !== exclude && !z.traded && z.low > price,
        );
        candidates.sort((a, b) => a.low - b.low);
        return candidates[0] ?? null;
      };

      const findNextZoneBelow = (price: number, exclude: OrderBlockZone): OrderBlockZone | null => {
        const candidates = [...bearishZones, ...bullishZones].filter(
          (z) => z !== exclude && !z.traded && z.high < price,
        );
        candidates.sort((a, b) => b.high - a.high);
        return candidates[0] ?? null;
      };

      for (let t = 0; t < n; t++) {
        const candle = candles[t];

        const range = candle.high - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const isRejectionWick = (wick: number) => range > 0 && wick / range >= rejectionWickRatio;

        const isZoneLive = (zone: OrderBlockZone) =>
          !zone.traded &&
          candle.closeTime > zone.createdAtTime &&
          candle.closeTime <= zone.expiresAtTime;

        // 1. React to bearish (resistance) zones.
        for (const zone of bearishZones) {
          if (!isZoneLive(zone)) continue;

          if (!zone.brokenThrough) {
            const touched = candle.high >= zone.low && candle.close < zone.low;
            if (touched && isRejectionWick(upperWick)) {
              const stopLoss = zoneStop(zone, candle.close, zone.high);
              if (candle.close < stopLoss) {
                const risk = stopLoss - candle.close;
                const nextZone = findNextZoneBelow(candle.close, zone);
                const takeProfit = nextZone ? nextZone.high : candle.close - fallbackRrRatio * risk;
                signals[t] = "SELL";
                computedTargets[t] = { stopLoss, takeProfit };
                zone.traded = true;
              }
              continue;
            }
            if (candle.close > zone.high) {
              zone.brokenThrough = true;
            }
          } else {
            const touched = candle.low <= zone.high && candle.close > zone.low;
            if (touched && isRejectionWick(lowerWick)) {
              const stopLoss = zoneStop(zone, candle.close, zone.low);
              if (candle.close > stopLoss) {
                const risk = candle.close - stopLoss;
                const nextZone = findNextZoneAbove(candle.close, zone);
                const takeProfit = nextZone ? nextZone.low : candle.close + fallbackRrRatio * risk;
                signals[t] = "BUY";
                computedTargets[t] = { stopLoss, takeProfit };
                zone.traded = true;
              }
            }
          }
        }

        // 2. React to bullish (support) zones — mirror of the above.
        for (const zone of bullishZones) {
          if (!isZoneLive(zone)) continue;

          if (!zone.brokenThrough) {
            const touched = candle.low <= zone.high && candle.close > zone.high;
            if (touched && isRejectionWick(lowerWick)) {
              const stopLoss = zoneStop(zone, candle.close, zone.low);
              if (candle.close > stopLoss) {
                const risk = candle.close - stopLoss;
                const nextZone = findNextZoneAbove(candle.close, zone);
                const takeProfit = nextZone ? nextZone.low : candle.close + fallbackRrRatio * risk;
                signals[t] = "BUY";
                computedTargets[t] = { stopLoss, takeProfit };
                zone.traded = true;
              }
              continue;
            }
            if (candle.close < zone.low) {
              zone.brokenThrough = true;
            }
          } else {
            const touched = candle.high >= zone.low && candle.close < zone.high;
            if (touched && isRejectionWick(upperWick)) {
              const stopLoss = zoneStop(zone, candle.close, zone.high);
              if (candle.close < stopLoss) {
                const risk = stopLoss - candle.close;
                const nextZone = findNextZoneBelow(candle.close, zone);
                const takeProfit = nextZone ? nextZone.high : candle.close - fallbackRrRatio * risk;
                signals[t] = "SELL";
                computedTargets[t] = { stopLoss, takeProfit };
                zone.traded = true;
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
