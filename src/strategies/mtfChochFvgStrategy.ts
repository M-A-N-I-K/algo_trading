import { atr } from "../indicators/atr";
import { pivotHigh, pivotLow } from "../indicators/pivots";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface MtfChochFvgOptions {
  // Higher-timeframe candles (e.g. 15m when trading a 1m/5m chart) used to
  // compute the HTF bias. Without a real HTF series the bias stays neutral
  // and no entries fire (see `run.ts`, which fetches this automatically).
  htfCandles?: OHLC[];
  htfPivotLookback?: number;
  // Pivot lookback used for the entry-chart CHoCH (change-of-character)
  // structure.
  pivotLookback?: number;
  // Bars to keep searching, after a CHoCH, for a qualifying 3-candle FVG.
  fvgSearchBars?: number;
  // Bars to keep a pending limit order (at the FVG midpoint) live before
  // giving up on the fill.
  pendingTimeoutBars?: number;
  // Extra filter: the FVG midpoint must sit within the 50%-61.8% retracement
  // of the impulse leg (the "golden pocket").
  useGoldenZoneFilter?: boolean;
  // Use the previous UTC day's high/low as the runner take-profit, matching
  // the original's "close on PDH/PDL touch" rule. Falls back to a fixed
  // R-multiple when no previous day is available yet (start of history) or
  // when disabled.
  usePdhPdlTarget?: boolean;
  fallbackRunnerRMultiple?: number;
  atrLength?: number;
  atrStopBufferMultiple?: number;
  // Partial take-profit, expressed as a multiple of the entry-to-stop risk.
  partialTakeProfitRMultiple?: number;
  // Fraction of the position closed at the partial take-profit.
  partialClosePercent?: number;
}

// Ported from the "MTF CHoCH + FVG Entry Model" Pine strategy: on a
// change-of-character (CHoCH) on the entry chart that agrees with a
// higher-timeframe structural bias, wait for a qualifying fair-value-gap
// (3-candle imbalance) to form in the impulse, then place a limit order at
// the gap's midpoint (optionally requiring it to sit in the 50-61.8% fib
// zone of the leg). Stop sits just beyond the swing point that defined the
// CHoCH; a partial take-profit fires at a fixed R-multiple, with the runner
// managed against the previous day's high/low.
//
// Two adaptations from the original, driven by this engine's stop/target
// model (a single fixed stop-loss + take-profit computed at signal time,
// no per-bar dynamic recompute): the original moves its stop to breakeven
// once a fresh same-direction CHoCH confirms, and separately closes the
// runner on an opposite CHoCH — both are dropped here in favor of a fixed
// stop and a PDH/PDL (or R-multiple) runner target. The limit fill is also
// approximated at the filling bar's close rather than the exact FVG
// midpoint, since the engine always fills at the signal bar's close.
export function createMtfChochFvgStrategy(options: MtfChochFvgOptions = {}): Strategy {
  const {
    htfCandles = [],
    htfPivotLookback = 5,
    pivotLookback = 5,
    fvgSearchBars = 15,
    pendingTimeoutBars = 30,
    useGoldenZoneFilter = false,
    usePdhPdlTarget = true,
    fallbackRunnerRMultiple = 6,
    atrLength = 14,
    atrStopBufferMultiple = 0.1,
    partialTakeProfitRMultiple = 4,
    partialClosePercent = 50,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "MTF CHoCH + FVG Entry Model",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = Math.max(pivotLookback * 2 + 3, atrLength + 2, 3);
      if (n < warmup) return signals;

      const atrValues = atr(candles, atrLength);
      const entryPh = pivotHigh(
        candles.map((c) => c.high),
        pivotLookback,
        pivotLookback,
      );
      const entryPl = pivotLow(
        candles.map((c) => c.low),
        pivotLookback,
        pivotLookback,
      );

      // ---- HTF bias: same pivot-break CHoCH structure, computed on htfCandles ----
      const htfTrendSeries = computeTrendSeries(htfCandles, htfPivotLookback);
      let htfCursor = -1;
      const htfTrendAt = (openTime: number): number => {
        while (htfCursor + 1 < htfCandles.length && htfCandles[htfCursor + 1].closeTime <= openTime) {
          htfCursor += 1;
        }
        return htfCursor < 0 ? 0 : htfTrendSeries[htfCursor];
      };

      // ---- Previous (completed) UTC day's high/low ----
      const { pdh, pdl } = computePrevDayHighLow(candles);

      // ---- Entry-chart CHoCH structure state ----
      let lastPH: number | null = null;
      let lastPL: number | null = null;
      let highBroken = true;
      let lowBroken = true;
      let trend = 0;

      // ---- Bullish setup state ----
      let awaitingFvgUp = false;
      let chochUpBar = -1;
      let chochUpSwingLow = NaN;
      let impulseHigh = NaN;
      let pendingActiveLong = false;
      let pendingLongLimit = NaN;
      let pendingLongStop = NaN;
      let pendingLongBar = -1;

      // ---- Bearish setup state ----
      let awaitingFvgDown = false;
      let chochDownBar = -1;
      let chochDownSwingHigh = NaN;
      let impulseLow = NaN;
      let pendingActiveShort = false;
      let pendingShortLimit = NaN;
      let pendingShortStop = NaN;
      let pendingShortBar = -1;

      for (let t = 2; t < n; t++) {
        const candle = candles[t];

        if (entryPh[t] !== null) {
          lastPH = entryPh[t];
          highBroken = false;
        }
        if (entryPl[t] !== null) {
          lastPL = entryPl[t];
          lowBroken = false;
        }

        const brokeHigh = lastPH !== null && !highBroken && candle.close > lastPH;
        const brokeLow = lastPL !== null && !lowBroken && candle.close < lastPL;

        const isChochUp = brokeHigh && trend !== 1;
        const isChochDown = brokeLow && trend !== -1;

        if (brokeHigh) {
          highBroken = true;
          trend = 1;
        }
        if (brokeLow) {
          lowBroken = true;
          trend = -1;
        }

        const htfTrend = htfTrendAt(candle.openTime);

        // ============ Bullish: CHoCH -> FVG search -> pending limit -> fill ============
        if (isChochUp && htfTrend === 1 && !awaitingFvgUp && !pendingActiveLong) {
          awaitingFvgUp = true;
          chochUpBar = t;
          chochUpSwingLow = lastPL ?? NaN;
          impulseHigh = candle.high;
        }

        if (awaitingFvgUp) {
          impulseHigh = Math.max(impulseHigh, candle.high);
          const bullFvg = candle.low > candles[t - 2].high;
          if (bullFvg) {
            const fvgTop = candle.low;
            const fvgBot = candles[t - 2].high;
            const fvgMid = (fvgTop + fvgBot) / 2;
            const fib50 = impulseHigh - 0.5 * (impulseHigh - chochUpSwingLow);
            const fib618 = impulseHigh - 0.618 * (impulseHigh - chochUpSwingLow);
            const goldenOk = !useGoldenZoneFilter || (fvgMid <= fib50 && fvgMid >= fib618);

            if (goldenOk && !isNaN(chochUpSwingLow) && fvgMid > chochUpSwingLow) {
              const stopRef = chochUpSwingLow - atrValues[t] * atrStopBufferMultiple;
              const riskPts = fvgMid - stopRef;
              if (riskPts > 0 && !isNaN(stopRef)) {
                pendingActiveLong = true;
                pendingLongLimit = fvgMid;
                pendingLongStop = stopRef;
                pendingLongBar = t;
                awaitingFvgUp = false;
              }
            }
          }
          if (t - chochUpBar > fvgSearchBars) awaitingFvgUp = false;
        }

        if (pendingActiveLong && t > pendingLongBar) {
          if (candle.low <= pendingLongLimit) {
            const risk = pendingLongLimit - pendingLongStop;
            const tp1Price = pendingLongLimit + risk * partialTakeProfitRMultiple;
            const runnerTarget =
              usePdhPdlTarget && pdh[t] !== null
                ? pdh[t]!
                : pendingLongLimit + risk * fallbackRunnerRMultiple;

            signals[t] = "BUY";
            computedTargets[t] = {
              stopLoss: pendingLongStop,
              takeProfit: Math.max(runnerTarget, tp1Price),
              partialExits: [{ price: tp1Price, portion: partialClosePercent / 100 }],
            };
            pendingActiveLong = false;
          } else if (candle.close < pendingLongStop || t - pendingLongBar > pendingTimeoutBars) {
            pendingActiveLong = false;
          }
        }

        // ============ Bearish: CHoCH -> FVG search -> pending limit -> fill ============
        if (isChochDown && htfTrend === -1 && !awaitingFvgDown && !pendingActiveShort) {
          awaitingFvgDown = true;
          chochDownBar = t;
          chochDownSwingHigh = lastPH ?? NaN;
          impulseLow = candle.low;
        }

        if (awaitingFvgDown) {
          impulseLow = Math.min(impulseLow, candle.low);
          const bearFvg = candle.high < candles[t - 2].low;
          if (bearFvg) {
            const fvgBot = candle.high;
            const fvgTop = candles[t - 2].low;
            const fvgMid = (fvgTop + fvgBot) / 2;
            const fib50 = impulseLow + 0.5 * (chochDownSwingHigh - impulseLow);
            const fib618 = impulseLow + 0.618 * (chochDownSwingHigh - impulseLow);
            const goldenOk = !useGoldenZoneFilter || (fvgMid >= fib50 && fvgMid <= fib618);

            if (goldenOk && !isNaN(chochDownSwingHigh) && fvgMid < chochDownSwingHigh) {
              const stopRef = chochDownSwingHigh + atrValues[t] * atrStopBufferMultiple;
              const riskPts = stopRef - fvgMid;
              if (riskPts > 0 && !isNaN(stopRef)) {
                pendingActiveShort = true;
                pendingShortLimit = fvgMid;
                pendingShortStop = stopRef;
                pendingShortBar = t;
                awaitingFvgDown = false;
              }
            }
          }
          if (t - chochDownBar > fvgSearchBars) awaitingFvgDown = false;
        }

        if (pendingActiveShort && t > pendingShortBar) {
          if (candle.high >= pendingShortLimit) {
            const risk = pendingShortStop - pendingShortLimit;
            const tp1Price = pendingShortLimit - risk * partialTakeProfitRMultiple;
            const runnerTarget =
              usePdhPdlTarget && pdl[t] !== null
                ? pdl[t]!
                : pendingShortLimit - risk * fallbackRunnerRMultiple;

            signals[t] = "SELL";
            computedTargets[t] = {
              stopLoss: pendingShortStop,
              takeProfit: Math.min(runnerTarget, tp1Price),
              partialExits: [{ price: tp1Price, portion: partialClosePercent / 100 }],
            };
            pendingActiveShort = false;
          } else if (candle.close > pendingShortStop || t - pendingShortBar > pendingTimeoutBars) {
            pendingActiveShort = false;
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

// Pivot-break CHoCH trend series: 1 once a pivot high is closed through,
// -1 once a pivot low is closed through, persisting until the opposite
// break occurs. Used both for the HTF bias and (inline, above) the
// entry-chart structure.
function computeTrendSeries(candles: OHLC[], pivotLookback: number): number[] {
  const n = candles.length;
  const trendSeries: number[] = new Array(n).fill(0);
  if (n < pivotLookback * 2 + 1) return trendSeries;

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

  let lastPH: number | null = null;
  let lastPL: number | null = null;
  let highBroken = true;
  let lowBroken = true;
  let trend = 0;

  for (let t = 0; t < n; t++) {
    if (ph[t] !== null) {
      lastPH = ph[t];
      highBroken = false;
    }
    if (pl[t] !== null) {
      lastPL = pl[t];
      lowBroken = false;
    }

    const brokeHigh = lastPH !== null && !highBroken && candles[t].close > lastPH;
    const brokeLow = lastPL !== null && !lowBroken && candles[t].close < lastPL;

    if (brokeHigh) {
      highBroken = true;
      trend = 1;
    }
    if (brokeLow) {
      lowBroken = true;
      trend = -1;
    }

    trendSeries[t] = trend;
  }

  return trendSeries;
}

// Previous *completed* UTC day's high/low, available from the first bar of
// the new day (mirrors Pine's `request.security(..., "D", high[1])`).
function computePrevDayHighLow(candles: OHLC[]): { pdh: (number | null)[]; pdl: (number | null)[] } {
  const n = candles.length;
  const pdh: (number | null)[] = new Array(n).fill(null);
  const pdl: (number | null)[] = new Array(n).fill(null);

  const DAY_MS = 24 * 60 * 60 * 1000;
  let currentDayKey: number | null = null;
  let dayHigh = -Infinity;
  let dayLow = Infinity;
  let prevDayHigh: number | null = null;
  let prevDayLow: number | null = null;

  for (let t = 0; t < n; t++) {
    const dayKey = Math.floor(candles[t].openTime / DAY_MS);

    if (dayKey !== currentDayKey) {
      if (currentDayKey !== null) {
        prevDayHigh = dayHigh;
        prevDayLow = dayLow;
      }
      currentDayKey = dayKey;
      dayHigh = candles[t].high;
      dayLow = candles[t].low;
    } else {
      dayHigh = Math.max(dayHigh, candles[t].high);
      dayLow = Math.min(dayLow, candles[t].low);
    }

    pdh[t] = prevDayHigh;
    pdl[t] = prevDayLow;
  }

  return { pdh, pdl };
}
