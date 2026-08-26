import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface FourHourRangeOptions {
  // Take-profit expressed as a multiple of the stop-loss risk (video: "at
  // least two times the stop-loss size").
  rewardRiskRatio?: number;
  // IANA timezone used to define the trading day and its first 4 clock-hours
  // (video: set the chart to New York time before marking the range).
  timeZone?: string;
}

function nyDateAndHour(ms: number, timeZone: string): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  return { dateKey, hour };
}

// Implements the "4-Hour Range" scalping strategy: mark the high/low of the
// first 4 clock-hours of each trading day (in `timeZone`), then watch the
// same candles for a full CLOSE outside that range followed by a full CLOSE
// back inside it — wicks alone don't count. That breakout-and-re-entry
// sequence fades back toward the range: stop-loss sits at the extreme of
// the breakout excursion (the highest high / lowest low actually reached),
// take-profit is a configurable multiple of that risk. A day can produce
// multiple trades if further breakout/re-entry sequences occur before the
// next day's range resets it.
export function createFourHourRangeStrategy(options: FourHourRangeOptions = {}): Strategy {
  const { rewardRiskRatio = 2, timeZone = "America/New_York" } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "4-Hour Range Breakout Fade (NY Session)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      let currentDay: string | null = null;
      let rangeHigh: number | null = null;
      let rangeLow: number | null = null;

      let breakoutSide: "above" | "below" | null = null;
      let breakoutExtreme = 0;

      for (let t = 0; t < n; t++) {
        const candle = candles[t];
        const { dateKey, hour } = nyDateAndHour(candle.openTime, timeZone);

        if (dateKey !== currentDay) {
          // New trading day: reset the range and any in-flight setup.
          currentDay = dateKey;
          rangeHigh = null;
          rangeLow = null;
          breakoutSide = null;
        }

        if (hour < 4) {
          // Still inside the first-4h window: extend the (unfinalized) range.
          rangeHigh = rangeHigh === null ? candle.high : Math.max(rangeHigh, candle.high);
          rangeLow = rangeLow === null ? candle.low : Math.min(rangeLow, candle.low);
          continue;
        }

        // No first-4h data observed yet for this day (e.g. history starts mid-day).
        if (rangeHigh === null || rangeLow === null) continue;

        if (breakoutSide === "above") {
          breakoutExtreme = Math.max(breakoutExtreme, candle.high);
          if (candle.close <= rangeHigh) {
            const stopLoss = breakoutExtreme;
            const entry = candle.close;
            if (entry < stopLoss) {
              const risk = stopLoss - entry;
              signals[t] = "SELL";
              computedTargets[t] = { stopLoss, takeProfit: entry - rewardRiskRatio * risk };
            }
            breakoutSide = null;
          }
          continue;
        }

        if (breakoutSide === "below") {
          breakoutExtreme = Math.min(breakoutExtreme, candle.low);
          if (candle.close >= rangeLow) {
            const stopLoss = breakoutExtreme;
            const entry = candle.close;
            if (entry > stopLoss) {
              const risk = entry - stopLoss;
              signals[t] = "BUY";
              computedTargets[t] = { stopLoss, takeProfit: entry + rewardRiskRatio * risk };
            }
            breakoutSide = null;
          }
          continue;
        }

        // No breakout in flight: check for a fresh one.
        if (candle.close > rangeHigh) {
          breakoutSide = "above";
          breakoutExtreme = candle.high;
        } else if (candle.close < rangeLow) {
          breakoutSide = "below";
          breakoutExtreme = candle.low;
        }
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
