import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { Signal, Strategy, TradeTarget } from "../types";

export interface ExtremeOrderBlockOptions {
  // Bars on each side of a fractal swing point. A swing only counts once
  // these bars after it have closed.
  swingLookback?: number;
  // How far back from the leg's origin to look for the order block candle.
  obSearchBars?: number;
  // Only keep blocks whose impulse left a fair value gap.
  requireFvg?: boolean;
  atrPeriod?: number;
  // Stop sits this many ATRs beyond the zone's far edge.
  stopBufferAtr?: number;
  // Skip setups whose structure target is under this R:R.
  minRr?: number;
  // Cap the target at this R:R when the structure target is further away.
  maxRr?: number;
  // Higher-timeframe candles to read structure and zones from. Entries still
  // trigger on the candles passed to generateSignals.
  htfCandles?: OHLC[];
}

interface Swing {
  price: number;
  idx: number;
  broken: boolean;
}

interface Zone {
  low: number;
  high: number;
  // Furthest price of the impulse so far: the take-profit (opposite liquidity).
  extreme: number;
  createdAt: number; // closeTime of the break-of-structure candle
  touched: boolean;
}

const isBullish = (c: OHLC) => c.close > c.open;
const isBearish = (c: OHLC) => c.close < c.open;

// Market structure read one closed candle at a time. A bullish break of
// structure (close above the last unbroken swing high) sets the trend up
// and marks the extreme bullish order block: the last bearish candle at the
// origin of the leg that broke, i.e. at the protected low. Bearish is the
// mirror. Each break replaces that side's zone and clears the other side's.
function createStructure(src: OHLC[], n: number, obSearchBars: number, requireFvg: boolean) {
  let lastHigh: Swing | null = null;
  let lastLow: Swing | null = null;
  let trend: "up" | "down" | null = null;
  let bullZone: Zone | null = null;
  let bearZone: Zone | null = null;

  const isSwing = (r: number, kind: "high" | "low") => {
    for (let j = r - n; j <= r + n; j++) {
      if (j === r) continue;
      if (kind === "high" ? src[j].high >= src[r].high : src[j].low <= src[r].low) return false;
    }
    return true;
  };

  const hasFvg = (from: number, to: number, side: "up" | "down") => {
    for (let k = Math.max(1, from + 1); k < to; k++) {
      if (side === "up" ? src[k + 1].low > src[k - 1].high : src[k + 1].high < src[k - 1].low) return true;
    }
    return false;
  };

  const bullishBreak = (i: number, swing: Swing): Zone | null => {
    let origin = swing.idx + 1;
    for (let k = origin; k <= i; k++) if (src[k].low < src[origin].low) origin = k;
    let ob = origin;
    while (ob > Math.max(0, origin - obSearchBars) && !isBearish(src[ob])) ob--;
    if (!isBearish(src[ob])) return null;
    if (requireFvg && !hasFvg(ob, i, "up")) return null;
    let low = Infinity;
    for (let k = ob; k <= origin; k++) low = Math.min(low, src[k].low);
    let extreme = -Infinity;
    for (let k = origin; k <= i; k++) extreme = Math.max(extreme, src[k].high);
    return { low, high: Math.max(src[ob].open, src[ob].close), extreme, createdAt: src[i].closeTime, touched: false };
  };

  const bearishBreak = (i: number, swing: Swing): Zone | null => {
    let origin = swing.idx + 1;
    for (let k = origin; k <= i; k++) if (src[k].high > src[origin].high) origin = k;
    let ob = origin;
    while (ob > Math.max(0, origin - obSearchBars) && !isBullish(src[ob])) ob--;
    if (!isBullish(src[ob])) return null;
    if (requireFvg && !hasFvg(ob, i, "down")) return null;
    let high = -Infinity;
    for (let k = ob; k <= origin; k++) high = Math.max(high, src[k].high);
    let extreme = Infinity;
    for (let k = origin; k <= i; k++) extreme = Math.min(extreme, src[k].low);
    return { low: Math.min(src[ob].open, src[ob].close), high, extreme, createdAt: src[i].closeTime, touched: false };
  };

  return {
    // Process closed source candle i. Reads only src[0..i].
    step(i: number) {
      const r = i - n;
      if (r >= n) {
        if (isSwing(r, "high")) lastHigh = { price: src[r].high, idx: r, broken: false };
        if (isSwing(r, "low")) lastLow = { price: src[r].low, idx: r, broken: false };
      }
      const c = src[i];
      if (lastHigh && !lastHigh.broken && c.close > lastHigh.price) {
        lastHigh.broken = true;
        trend = "up";
        bullZone = bullishBreak(i, lastHigh);
        bearZone = null;
      } else if (lastLow && !lastLow.broken && c.close < lastLow.price) {
        lastLow.broken = true;
        trend = "down";
        bearZone = bearishBreak(i, lastLow);
        bullZone = null;
      }
    },
    get trend() {
      return trend;
    },
    get bullZone() {
      return bullZone;
    },
    get bearZone() {
      return bearZone;
    },
    killBull() {
      bullZone = null;
    },
    killBear() {
      bearZone = null;
    },
  };
}

// Extreme order block trend pullbacks. In an uptrend (by market structure),
// buy the first return to the extreme bullish order block once a candle
// closes back above it; in a downtrend, sell the first return to the extreme
// bearish block once a candle closes back below it. Stop beyond the zone's
// far edge plus an ATR buffer; target the impulse's extreme (the opposite
// liquidity), skipped under minRr and capped at maxRr.
export function createExtremeOrderBlockStrategy(options: ExtremeOrderBlockOptions = {}): Strategy {
  const {
    swingLookback = 5,
    obSearchBars = 10,
    requireFvg = false,
    atrPeriod = 14,
    stopBufferAtr = 0.1,
    minRr = 2,
    maxRr = 5,
    htfCandles,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: htfCandles ? "Extreme Order Block (HTF Zones + LTF Trigger)" : "Extreme Order Block (Trend Pullback)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      const src = htfCandles && htfCandles.length > 0 ? htfCandles : candles;
      const structure = createStructure(src, swingLookback, obSearchBars, requireFvg);
      const atrValues = atr(candles, atrPeriod);
      let next = 0;

      for (let t = 0; t < n; t++) {
        const c = candles[t];
        // Only source candles that have closed by this candle's close.
        while (next < src.length && src[next].closeTime <= c.closeTime) structure.step(next++);

        const buffer = stopBufferAtr > 0 ? stopBufferAtr * atrValues[t] : 0;

        const bull = structure.trend === "up" ? structure.bullZone : null;
        if (bull && c.closeTime > bull.createdAt) {
          bull.extreme = Math.max(bull.extreme, c.high);
          if (c.close < bull.low) {
            structure.killBull();
          } else {
            if (c.low <= bull.high) bull.touched = true;
            if (bull.touched && c.close > bull.high) {
              structure.killBull(); // first return only
              const stop = bull.low - buffer;
              const risk = c.close - stop;
              const rr = (bull.extreme - c.close) / risk;
              if (Number.isFinite(stop) && risk > 0 && rr >= minRr) {
                signals[t] = "BUY";
                computedTargets[t] = { stopLoss: stop, takeProfit: rr > maxRr ? c.close + maxRr * risk : bull.extreme };
              }
            }
          }
        }

        const bear = structure.trend === "down" ? structure.bearZone : null;
        if (bear && c.closeTime > bear.createdAt) {
          bear.extreme = Math.min(bear.extreme, c.low);
          if (c.close > bear.high) {
            structure.killBear();
          } else {
            if (c.high >= bear.low) bear.touched = true;
            if (bear.touched && c.close < bear.low) {
              structure.killBear();
              const stop = bear.high + buffer;
              const risk = stop - c.close;
              const rr = (c.close - bear.extreme) / risk;
              if (Number.isFinite(stop) && risk > 0 && rr >= minRr) {
                signals[t] = "SELL";
                computedTargets[t] = { stopLoss: stop, takeProfit: rr > maxRr ? c.close - maxRr * risk : bear.extreme };
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
