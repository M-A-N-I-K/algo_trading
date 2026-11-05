import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { Signal, Strategy, TradeTarget } from "../types";

export interface PerfectEntryOptions {
  // Higher-timeframe candles (4h in the registry) that give the context:
  // trend, points of interest and target. Without them the strategy reads
  // context from the execution candles themselves.
  htfCandles?: OHLC[];
  // Bars on each side of a fractal swing on the higher timeframe.
  htfSwingLookback?: number;
  // Bars on each side of a fractal swing on the execution timeframe.
  ltfSwingLookback?: number;
  // How far back from a low (high) to look for the zone's candle.
  obSearchBars?: number;
  atrPeriod?: number;
  // Stop sits this many ATRs beyond the sweep low (high).
  stopBufferAtr?: number;
  // Skip trades whose target is under this R:R.
  minRr?: number;
  // Give up on a setup this many execution bars after the point of interest
  // was hit without an entry.
  maxSetupBars?: number;
}

// All structure is tracked in "signed" prices so one code path serves both
// directions: for trend d = 1 prices are as-is; for d = -1 they're negated,
// so a downtrend reads as an uptrend (lows become highs).
type Dir = 1 | -1;
const fav = (c: OHLC, d: Dir) => (d === 1 ? c.high : -c.low); // extreme in the trend's favour
const adv = (c: OHLC, d: Dir) => (d === 1 ? c.low : -c.high); // extreme against it
const sc = (c: OHLC, d: Dir) => d * c.close;
const so = (c: OHLC, d: Dir) => d * c.open;

interface Level {
  price: number; // signed
  idx: number;
}

interface Poi {
  price: number; // signed: an internal low, or the top of the demand zone
  idx: number; // HTF bar it sits on
  internal: boolean;
  createdAt: number; // closeTime of the HTF candle that confirmed it
  used: boolean;
}

// The context (step 1): higher-timeframe trend by market structure.
//
// Uptrend: a close above the impulse high (the top swing of the current
// leg) is a break of structure, and the lowest point since the previous
// impulse high becomes the protected low. Only a close below the protected
// low ends the uptrend. Swing lows formed inside the leg, above the
// protected low, are internal lows: liquidity the market can sweep without
// changing the trend. The demand zone is the last bearish candle at the
// protected low. Both are points of interest. The target is the impulse's
// high. Downtrend is the mirror.
function createContext(src: OHLC[], n: number, obSearchBars: number) {
  let d: Dir | 0 = 0;
  let protectedLevel: Level | null = null;
  let bosLevel: Level | null = null; // impulse high a close must beat (signed)
  let extreme = -Infinity; // impulse high (signed): the target
  let pois: Poi[] = [];
  // Fractal swings before the first trend.
  let lastHigh: Level | null = null;
  let lastLow: Level | null = null;

  const isSwing = (r: number, kind: "high" | "low") => {
    for (let j = r - n; j <= r + n; j++) {
      if (j === r) continue;
      if (kind === "high" ? src[j].high >= src[r].high : src[j].low <= src[r].low) return false;
    }
    return true;
  };

  // Start a leg in direction dir whose protected level is the most adverse
  // point in (from, i]. On a continuation, internal lows already confirmed
  // after the new protected low carry over.
  const startLeg = (dir: Dir, from: number, i: number, carry = false) => {
    d = dir;
    let p = from + 1;
    for (let k = p; k <= i; k++) if (adv(src[k], dir) < adv(src[p], dir)) p = k;
    protectedLevel = { price: adv(src[p], dir), idx: p };
    bosLevel = null;
    extreme = -Infinity;
    for (let k = p; k <= i; k++) extreme = Math.max(extreme, fav(src[k], dir));
    const prot = protectedLevel;
    pois = carry ? pois.filter((x) => x.internal && x.idx > prot.idx && x.price > prot.price) : [];
    // Demand (supply) zone: the last candle against the trend at or up to
    // obSearchBars before the protected level. Its touch level is the top of
    // that candle's body.
    for (let ob = p; ob >= Math.max(0, p - obSearchBars); ob--) {
      if (sc(src[ob], dir) < so(src[ob], dir)) {
        pois.push({ price: so(src[ob], dir), idx: ob, internal: false, createdAt: src[i].closeTime, used: false });
        break;
      }
    }
  };

  return {
    step(i: number) {
      const r = i - n;
      const c = src[i];
      if (r >= n) {
        const high = isSwing(r, "high") ? { idx: r, price: src[r].high } : null;
        const low = isSwing(r, "low") ? { idx: r, price: src[r].low } : null;
        if (high) lastHigh = high;
        if (low) lastLow = low;
        if (d !== 0 && protectedLevel) {
          const favSwing = d === 1 ? high : low;
          const advSwing = d === 1 ? low : high;
          if (favSwing && favSwing.idx > protectedLevel.idx && (!bosLevel || d * favSwing.price > bosLevel.price)) {
            bosLevel = { price: d * favSwing.price, idx: favSwing.idx };
          }
          if (advSwing && advSwing.idx > protectedLevel.idx && d * advSwing.price > protectedLevel.price) {
            pois.push({ price: d * advSwing.price, idx: advSwing.idx, internal: true, createdAt: c.closeTime, used: false });
          }
        }
      }

      if (d === 0) {
        if (lastHigh && c.close > lastHigh.price) startLeg(1, lastHigh.idx, i);
        else if (lastLow && c.close < lastLow.price) startLeg(-1, lastLow.idx, i);
        return;
      }

      extreme = Math.max(extreme, fav(c, d));
      if (sc(c, d) < protectedLevel!.price) {
        // Trend change: the new protected level is the old leg's extreme.
        startLeg(d === 1 ? -1 : 1, protectedLevel!.idx - 1, i);
      } else if (bosLevel && sc(c, d) > bosLevel.price) {
        startLeg(d, bosLevel.idx, i, true);
      }
    },
    get trend() {
      return d;
    },
    get extreme() {
      return extreme;
    },
    set extreme(v: number) {
      extreme = v;
    },
    get pois() {
      return pois;
    },
  };
}

interface Setup {
  d: Dir;
  armedAt: number; // execution bar index
  low: Level; // the sweep low (signed): lowest point since the POI was hit
  stage: "confirm" | "entry";
  zoneLow: number;
  zoneHigh: number;
  touched: boolean;
}

// Context → Confirmation → Execution ("the perfect entry").
//
// 1. Context (4h): trade only in the higher-timeframe trend, and only after
//    price reaches a point of interest: it sweeps an internal low or touches
//    the demand zone at the protected low.
// 2. Confirmation (1h): after that, a candle closes above the most recent
//    1h swing high: the short-term trend has shifted back up. The demand
//    zone is the last bearish 1h candle at the sweep low.
// 3. Execution: buy when price pulls back into that zone and a candle closes
//    back above it. Stop under the sweep low; target the 4h impulse high;
//    skip the trade if it pays under 3R. Shorts are the mirror.
export function createPerfectEntryStrategy(options: PerfectEntryOptions = {}): Strategy {
  const {
    htfCandles,
    htfSwingLookback = 3,
    ltfSwingLookback = 3,
    obSearchBars = 10,
    atrPeriod = 14,
    stopBufferAtr = 0.1,
    minRr = 3,
    maxSetupBars = 72,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Perfect Entry (Context + Confirmation)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      const src = htfCandles && htfCandles.length > 0 ? htfCandles : candles;
      const context = createContext(src, htfSwingLookback, obSearchBars);
      const atrValues = atr(candles, atrPeriod);
      const m = ltfSwingLookback;
      let next = 0;
      let setup: Setup | null = null;
      let ltfHigh: Level | null = null; // latest 1h swing high (actual price)
      let ltfLow: Level | null = null; // latest 1h swing low (actual price)

      const isLtfSwing = (r: number, kind: "high" | "low") => {
        for (let j = r - m; j <= r + m; j++) {
          if (j === r) continue;
          if (kind === "high" ? candles[j].high >= candles[r].high : candles[j].low <= candles[r].low) return false;
        }
        return true;
      };

      for (let t = 0; t < n; t++) {
        const c = candles[t];
        const prevTrend = context.trend;
        while (next < src.length && src[next].closeTime <= c.closeTime) context.step(next++);
        const d = context.trend;
        if (prevTrend !== d) setup = null;

        const r = t - m;
        if (r >= m) {
          if (isLtfSwing(r, "high")) ltfHigh = { price: candles[r].high, idx: r };
          if (isLtfSwing(r, "low")) ltfLow = { price: candles[r].low, idx: r };
        }
        if (d === 0) continue;

        context.extreme = Math.max(context.extreme, fav(c, d));
        const target = context.extreme;

        // Context: price reaches a point of interest.
        let hit = false;
        for (const poi of context.pois) {
          if (!poi.used && c.closeTime > poi.createdAt && adv(c, d) <= poi.price) {
            poi.used = true;
            hit = true;
          }
        }
        if (hit && !setup) {
          setup = { d, armedAt: t, low: { price: adv(c, d), idx: t }, stage: "confirm", zoneLow: 0, zoneHigh: 0, touched: false };
          continue;
        }
        if (!setup) continue;

        if (t - setup.armedAt > maxSetupBars || fav(c, d) >= target) {
          setup = null;
          continue;
        }

        if (setup.stage === "confirm") {
          if (adv(c, d) < setup.low.price) setup.low = { price: adv(c, d), idx: t };
          // Confirmation: a close beyond the latest 1h swing high (low for shorts).
          const swing = d === 1 ? ltfHigh : ltfLow;
          if (!swing || t === setup.low.idx || sc(c, d) <= d * swing.price) continue;
          // The zone: the last candle against the trend at the sweep low.
          let ob = -1;
          for (let k = setup.low.idx; k >= Math.max(0, setup.low.idx - obSearchBars); k--) {
            if (sc(candles[k], d) < so(candles[k], d)) {
              ob = k;
              break;
            }
          }
          if (ob < 0) {
            setup = null;
            continue;
          }
          setup.stage = "entry";
          setup.zoneLow = setup.low.price;
          setup.zoneHigh = so(candles[ob], d);
          continue;
        }

        // Execution: wait for the pullback into the zone and a close back out.
        if (sc(c, d) < setup.zoneLow) {
          setup = null;
          continue;
        }
        if (adv(c, d) <= setup.zoneHigh) setup.touched = true;
        if (!setup.touched || sc(c, d) <= setup.zoneHigh) continue;

        const buffer = stopBufferAtr > 0 ? stopBufferAtr * atrValues[t] : 0;
        const entry = sc(c, d);
        const stop = setup.zoneLow - buffer;
        const risk = entry - stop;
        const rr = (target - entry) / risk;
        setup = null;
        if (Number.isFinite(stop) && risk > 0 && rr >= minRr) {
          signals[t] = d === 1 ? "BUY" : "SELL";
          computedTargets[t] = { stopLoss: d * stop, takeProfit: d * target };
        }
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
