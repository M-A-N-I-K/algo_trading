import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

// "8/33 EMA" (a Hindi YouTube method), as it survived testing on FundingPips'
// MT5 bars since 2020: the same rules as mt5/PB_EMA833Zones_EA.mq5.
//
// Long (shorts are the mirror), on a closed candle:
//  1. Trend: EMA 8 above EMA 33, and the candle closes above both.
//  2. Dominance candle: green, body at least `body` (0.6) of its range.
//  3. Cross entry: it closes above the previous candle's high.
//  4. Retest: this candle's low, or the previous one's, touched the 8 EMA.
//  5. Stop: the lowest low of the last `stopLook` (5) candles, this one included.
//  6. Room: the highest high of the last 100 candles must not sit between
//     entry and 3R.
//  7. Zones: no confirmed swing high or low (3 candles each side) of the last
//     200 candles between entry and 3R + 0.25R.
//  8. Session: the candle closes inside London (08:00–16:30 London time) or
//     New York (08:00–17:00 New York time) hours.
// Exit: stepped trail. Reach 3R and the stop moves to 2R, 4R to 3R, and so
// on; the take-profit is a far cap (10R) that almost never fills. With
// `trail` off, a fixed 3R target instead.
// Both EMAs are seeded on the first close, as in the EA.
export type Ema833Session = "all" | "london" | "ny" | "both";

export interface Ema833ZonesOptions {
  fast?: number;
  slow?: number;
  body?: number;
  stopLook?: number;
  rr?: number; // fixed target, or where the trail starts
  room?: boolean;
  zones?: boolean;
  session?: Ema833Session;
  trail?: boolean;
  capR?: number; // take-profit while trailing
}

export const EMA833_ZONES_DEFAULTS: Required<Ema833ZonesOptions> = {
  fast: 8,
  slow: 33,
  body: 0.6,
  stopLook: 5,
  rr: 3,
  room: true,
  zones: true,
  session: "both",
  trail: true,
  capR: 10,
};

const ROOM_LOOK = 100;
const ZONE_LOOK = 200;
const ZONE_SWING = 3;
const ZONE_BUFFER_R = 0.25;
const HOUR = 3_600_000;

function emaSeeded(x: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let e = x[0];
  for (let i = 0; i < x.length; i++) {
    e = i ? (x[i] - e) * k + e : x[0];
    out.push(e);
  }
  return out;
}

const nthSunday = (y: number, m: number, n: number) => {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return Date.UTC(y, m, 1 + ((7 - first) % 7) + 7 * (n - 1));
};
const lastSunday = (y: number, m: number) => {
  const last = new Date(Date.UTC(y, m + 1, 0));
  return Date.UTC(y, m, last.getUTCDate() - last.getUTCDay());
};
/** Minutes past midnight in London (BST from the last Sunday of March to the last of October, 01:00 UTC). */
export function londonMinute(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  const off = ms >= lastSunday(y, 2) + HOUR && ms < lastSunday(y, 9) + HOUR ? 60 : 0;
  const d = new Date(ms + off * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
/** Minutes past midnight in New York (EDT from the second Sunday of March to the first of November, 02:00 local). */
export function newYorkMinute(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  const off = ms >= nthSunday(y, 2, 2) + 7 * HOUR && ms < nthSunday(y, 10, 1) + 6 * HOUR ? -240 : -300;
  const d = new Date(ms + off * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
export function inEma833Session(ms: number, session: Ema833Session): boolean {
  if (session === "all") return true;
  const lo = londonMinute(ms), ny = newYorkMinute(ms);
  const london = lo >= 480 && lo <= 990, newYork = ny >= 480 && ny <= 1020;
  return session === "london" ? london : session === "ny" ? newYork : london || newYork;
}

export function createEma833ZonesStrategy(options: Ema833ZonesOptions = {}): Strategy {
  const o = { ...EMA833_ZONES_DEFAULTS, ...options };
  let targets: (TradeTarget | null)[] = [];

  return {
    name: "8/33 EMA + Swing Zones",
    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      targets = new Array(n).fill(null);
      if (n < 2) return signals;
      const closes = candles.map((c) => c.close);
      const fast = emaSeeded(closes, o.fast), slow = emaSeeded(closes, o.slow);
      let barMs = Infinity;
      for (let i = 1; i < Math.min(n, 50); i++) barMs = Math.min(barMs, candles[i].openTime - candles[i - 1].openTime);

      for (let j = Math.max(ROOM_LOOK, o.slow * 3); j < n; j++) {
        if (!inEma833Session(candles[j].openTime + barMs, o.session)) continue;
        for (const side of [1, -1] as const) {
          // Shorts run the long rules on prices turned upside down.
          const H = (i: number) => (side > 0 ? candles[i].high : -candles[i].low);
          const L = (i: number) => (side > 0 ? candles[i].low : -candles[i].high);
          const O = (i: number) => side * candles[i].open;
          const C = (i: number) => side * candles[i].close;
          const F = side * fast[j], S = side * slow[j];
          if (!(F > S)) continue;
          if (!(C(j) > F && C(j) > S)) continue;
          const body = C(j) - O(j);
          if (!(body > 0 && body >= o.body * (H(j) - L(j)))) continue;
          if (!(C(j) > H(j - 1))) continue;
          if (!(L(j) <= F || L(j - 1) <= side * fast[j - 1])) continue;
          let stop = Infinity;
          for (let i = j - o.stopLook + 1; i <= j; i++) stop = Math.min(stop, L(i));
          const entry = C(j), risk = entry - stop;
          if (!(risk > 0)) continue;
          const tgt = entry + o.rr * risk;
          if (o.room) {
            let res = -Infinity;
            for (let i = j - ROOM_LOOK; i < j; i++) res = Math.max(res, H(i));
            if (res > entry && res < tgt) continue;
          }
          if (o.zones && blockedByZone(H, L, j, entry, tgt + ZONE_BUFFER_R * risk)) continue;

          signals[j] = side > 0 ? "BUY" : "SELL";
          targets[j] = o.trail
            ? { stopLoss: side * stop, takeProfit: side * (entry + o.capR * risk), trailStepR: o.rr }
            : { stopLoss: side * stop, takeProfit: side * tgt };
          break;
        }
      }
      return signals;
    },
    getTradeTargets() {
      return targets;
    },
  };
}

// Any confirmed swing high or low (ZONE_SWING candles each side) of the last
// ZONE_LOOK candles that sits between the entry and `limit`.
function blockedByZone(H: (i: number) => number, L: (i: number) => number, j: number, entry: number, limit: number): boolean {
  for (let i = Math.max(ZONE_SWING, j - ZONE_LOOK); i <= j - ZONE_SWING - 1; i++) {
    let sh = true, sl = true;
    for (let q = 1; q <= ZONE_SWING; q++) {
      if (!(H(i) > H(i - q) && H(i) >= H(i + q))) sh = false;
      if (!(L(i) < L(i - q) && L(i) <= L(i + q))) sl = false;
    }
    if (sh && H(i) > entry && H(i) < limit) return true;
    if (sl && L(i) > entry && L(i) < limit) return true;
  }
  return false;
}
