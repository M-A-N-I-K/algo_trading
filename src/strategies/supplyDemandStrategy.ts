import { ema } from "../indicators/ema";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy } from "../types";

export interface SupplyDemandOptions {
  // Lookback used to compute "average body size" when judging whether a
  // candle is an impulsive institutional move.
  impulseLookback?: number;
  // How much bigger than average an impulsive candle's body must be.
  impulseMultiplier?: number;
  // Window (each side) used to confirm a fractal swing high/low.
  swingLookback?: number;
  trendEmaPeriod?: number;
  // A zone is discarded if untouched after this many candles.
  zoneMaxAgeCandles?: number;
}

interface Zone {
  low: number;
  high: number;
  createdAt: number;
  // Set once price has touched the zone with slowing momentum; the zone
  // then waits exactly one more candle for the confirmation trigger.
  armedAt: number | null;
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

// Fractal swing points: candle i is a swing high/low if it's the most
// extreme candle within `lookback` bars on both sides. Confirming this
// requires seeing `lookback` candles *after* i, so callers must only rely
// on isSwingHigh[i]/isSwingLow[i] once index i + lookback has been reached.
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

// "Buy from demand, sell from supply": trades institutional order-block
// zones confirmed by a fair value gap and confluence with prior
// support/resistance. A zone is only ever traded on its first touch (it's
// discarded either way afterward — "untested zones" only); when multiple
// zones are eligible on the same candle, only the deepest demand / highest
// supply zone is taken ("the lowest demand is the strongest"); entry
// requires wicking into the zone's discount half (below its 50% level for
// demand, above it for supply) with slowing momentum, in the direction of
// a confirmed break of structure.
export function createSupplyDemandStrategy(
  options: SupplyDemandOptions = {},
): Strategy {
  const {
    impulseLookback = 14,
    impulseMultiplier = 1.5,
    swingLookback = 3,
    trendEmaPeriod = 50,
    zoneMaxAgeCandles = 100,
  } = options;

  return {
    name: "Supply & Demand Zones (Order Block + FVG + BOS/EMA Trend)",
    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      const warmup = Math.max(trendEmaPeriod, impulseLookback, swingLookback * 2) + 5;
      if (n < warmup) return signals;

      const closes = candles.map((candle) => candle.close);
      const trendEma = ema(closes, trendEmaPeriod);
      const { isSwingHigh, isSwingLow } = findFractalSwingPoints(
        candles,
        swingLookback,
      );

      const confirmedSwingHighs: number[] = [];
      const confirmedSwingLows: number[] = [];
      let lastSwingHigh: number | null = null;
      let lastSwingLow: number | null = null;
      let structuralTrend: "up" | "down" | "none" = "none";

      const demandZones: Zone[] = [];
      const supplyZones: Zone[] = [];

      for (let t = 0; t < n; t++) {
        const candle = candles[t];

        // Reveal swing points only once they're actually confirmable, to
        // avoid using future information.
        const revealIndex = t - swingLookback;
        if (revealIndex >= 0) {
          if (isSwingHigh[revealIndex]) {
            confirmedSwingHighs.push(candles[revealIndex].high);
            lastSwingHigh = candles[revealIndex].high;
          }
          if (isSwingLow[revealIndex]) {
            confirmedSwingLows.push(candles[revealIndex].low);
            lastSwingLow = candles[revealIndex].low;
          }
        }

        // Break of structure: a confirmed close beyond the last swing
        // flips the ongoing structural trend bias.
        if (lastSwingHigh !== null && candle.close > lastSwingHigh) {
          structuralTrend = "up";
        }
        if (lastSwingLow !== null && candle.close < lastSwingLow) {
          structuralTrend = "down";
        }

        // --- Zone detection: 3-candle pattern (base, impulse, confirm) ---
        if (t >= 2) {
          const base = candles[t - 2];
          const impulse = candles[t - 1];
          const confirm = candle;
          const avgBody = averageBody(candles, t - 2, impulseLookback);

          const bullishImpulse =
            isBullish(impulse) &&
            bodySize(impulse) > impulseMultiplier * avgBody;
          const bearishImpulse =
            isBearish(impulse) &&
            bodySize(impulse) > impulseMultiplier * avgBody;

          if (bullishImpulse && isBearish(base) && base.high < confirm.low) {
            const zoneLow = Math.min(base.open, base.close);
            const zoneHigh = Math.max(confirm.low, Math.max(base.open, base.close));
            const hasResistanceConfluence = confirmedSwingHighs.some(
              (price) => price >= zoneLow && price <= zoneHigh,
            );
            if (hasResistanceConfluence) {
              demandZones.push({ low: zoneLow, high: zoneHigh, createdAt: t, armedAt: null });
            }
          }

          if (bearishImpulse && isBullish(base) && base.low > confirm.high) {
            const zoneHigh = Math.max(base.open, base.close);
            const zoneLow = Math.min(confirm.high, Math.min(base.open, base.close));
            const hasSupportConfluence = confirmedSwingLows.some(
              (price) => price >= zoneLow && price <= zoneHigh,
            );
            if (hasSupportConfluence) {
              supplyZones.push({ low: zoneLow, high: zoneHigh, createdAt: t, armedAt: null });
            }
          }
        }

        // Break of structure must have actually happened — a merely
        // "not-yet-broken-down" state doesn't count as trend confirmation.
        const isUptrend =
          !isNaN(trendEma[t]) &&
          candle.close > trendEma[t] &&
          structuralTrend === "up";
        const isDowntrend =
          !isNaN(trendEma[t]) &&
          candle.close < trendEma[t] &&
          structuralTrend === "down";

        // Expire, break, or resolve each zone's one-shot trigger attempt.
        // Either way the zone is then done — a zone only gets one look.
        for (let i = demandZones.length - 1; i >= 0; i--) {
          const zone = demandZones[i];

          if (t - zone.createdAt > zoneMaxAgeCandles) {
            demandZones.splice(i, 1);
            continue;
          }
          if (candle.close < zone.low) {
            demandZones.splice(i, 1); // zone broken
            continue;
          }
          if (zone.armedAt !== null && t === zone.armedAt + 1) {
            const trigger = candles[zone.armedAt];
            if (isBullish(candle) && candle.close > trigger.high) {
              signals[t] = "BUY";
            }
            demandZones.splice(i, 1); // tested, one way or the other
          }
        }
        for (let i = supplyZones.length - 1; i >= 0; i--) {
          const zone = supplyZones[i];

          if (t - zone.createdAt > zoneMaxAgeCandles) {
            supplyZones.splice(i, 1);
            continue;
          }
          if (candle.close > zone.high) {
            supplyZones.splice(i, 1); // zone broken
            continue;
          }
          if (zone.armedAt !== null && t === zone.armedAt + 1) {
            const trigger = candles[zone.armedAt];
            if (isBearish(candle) && candle.close < trigger.low) {
              signals[t] = "SELL";
            }
            supplyZones.splice(i, 1);
          }
        }

        // Untested zones only: any zone this candle wicks/closes into is
        // consumed — either armed (if it qualifies) or discarded as tested.
        // Among simultaneously eligible zones, only the deepest demand /
        // highest supply zone is allowed to arm.
        let demandArmCandidate: Zone | null = null;
        const touchedDemandZones: Zone[] = [];
        for (const zone of demandZones) {
          if (zone.armedAt !== null || t <= zone.createdAt) continue;
          const touchesZone = candle.low <= zone.high && candle.close >= zone.low;
          if (!touchesZone) continue;

          touchedDemandZones.push(zone);

          const zoneMidpoint = (zone.low + zone.high) / 2;
          const isDiscounted = candle.low <= zoneMidpoint;
          const slowMomentum = bodySize(candle) <= averageBody(candles, t, 5);

          if (isDiscounted && slowMomentum && isUptrend) {
            if (!demandArmCandidate || zone.low < demandArmCandidate.low) {
              demandArmCandidate = zone;
            }
          }
        }
        if (demandArmCandidate) demandArmCandidate.armedAt = t;
        for (const zone of touchedDemandZones) {
          if (zone !== demandArmCandidate) {
            demandZones.splice(demandZones.indexOf(zone), 1);
          }
        }

        let supplyArmCandidate: Zone | null = null;
        const touchedSupplyZones: Zone[] = [];
        for (const zone of supplyZones) {
          if (zone.armedAt !== null || t <= zone.createdAt) continue;
          const touchesZone = candle.high >= zone.low && candle.close <= zone.high;
          if (!touchesZone) continue;

          touchedSupplyZones.push(zone);

          const zoneMidpoint = (zone.low + zone.high) / 2;
          const isPremium = candle.high >= zoneMidpoint;
          const slowMomentum = bodySize(candle) <= averageBody(candles, t, 5);

          if (isPremium && slowMomentum && isDowntrend) {
            if (!supplyArmCandidate || zone.high > supplyArmCandidate.high) {
              supplyArmCandidate = zone;
            }
          }
        }
        if (supplyArmCandidate) supplyArmCandidate.armedAt = t;
        for (const zone of touchedSupplyZones) {
          if (zone !== supplyArmCandidate) {
            supplyZones.splice(supplyZones.indexOf(zone), 1);
          }
        }
      }

      return signals;
    },
  };
}
