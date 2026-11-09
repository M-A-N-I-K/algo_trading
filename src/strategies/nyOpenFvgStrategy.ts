import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";
import { flipCandles, type Swing } from "./liquidityReversalStrategy";

export interface NyOpenFvgOptions {
  // The 15m series the trend is read on.
  htfCandles?: OHLC[];
  // Bars on each side of a 15m swing point.
  htfSwingLookback?: number;
  // Bars on each side of a 1m swing point.
  ltfSwingLookback?: number;
  // New York session open, local time "HH:MM", and how long the entry window
  // stays open after it. The change of character, the fair value gap and the
  // fill all have to happen inside the window.
  sessionOpen?: string;
  windowMinutes?: number;
  // After the change of character, how many 1m bars to wait for a fair value
  // gap if the push itself didn't leave one.
  fvgWaitBars?: number;
  // Target as a multiple of the risk (the video says 3 to 4).
  targetR?: number;
  // Stop under the middle candle that made the gap (the video's rule), or
  // under the first candle of the three (a wider stop).
  stopAt?: "gap-candle" | "first-candle";
  timeZone?: string;
}

export const NY_OPEN_FVG_DEFAULTS = {
  htfSwingLookback: 3,
  ltfSwingLookback: 2,
  sessionOpen: "09:30",
  windowMinutes: 90,
  fvgWaitBars: 3,
  targetR: 3,
  stopAt: "gap-candle",
  timeZone: "America/New_York",
} as const;

// A limit order the setup places, and the bar it filled on.
export interface NyOpenFvgOrder {
  side: "long" | "short";
  day: number; // New York calendar day (days since the epoch), one trade a day
  chochIdx: number; // 1m bar that closed through the swing (change of character)
  fvgIdx: number; // third candle of the fair value gap; the order is live after it
  fillIdx: number; // first 1m bar that traded back to the entry
  entry: number; // middle of the fair value gap
  stop: number; // beyond the candle that made the gap
  target: number;
}

const DAY = 86_400_000;

const isSwingHigh = (c: OHLC[], r: number, k: number) => {
  for (let j = r - k; j <= r + k; j++) if (j !== r && c[j].high >= c[r].high) return false;
  return true;
};
const isSwingLow = (c: OHLC[], r: number, k: number) => {
  for (let j = r - k; j <= r + k; j++) if (j !== r && c[j].low <= c[r].low) return false;
  return true;
};

// Wall clock in `timeZone`. The UTC offset is looked up once per UTC day (at
// noon); clocks change on a Sunday night, when there's no session anyway.
function sessionClock(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const offsets = new Map<number, number>();
  const offsetFor = (t: number) => {
    const key = Math.floor(t / DAY);
    let off = offsets.get(key);
    if (off === undefined) {
      const noon = key * DAY + DAY / 2;
      const parts = fmt.formatToParts(new Date(noon));
      const v = (type: string) => Number(parts.find((p) => p.type === type)!.value);
      off = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - noon;
      offsets.set(key, off);
    }
    return off;
  };
  return (t: number) => {
    const local = t + offsetFor(t);
    return { day: Math.floor(local / DAY), minute: Math.floor((local % DAY) / 60_000), weekday: new Date(local).getUTCDay() };
  };
}

// NY Open FVG: trade the New York open in the direction of the 15m trend.
//
// 15m trend (closed bars only): it turns up when a candle closes above the
// last swing high and the swing low that formed after that high is higher
// than the swing low before it (higher high, higher low, break of
// structure). It stays up until a candle closes below the last swing low
// (the change of character that ends it). Down is the mirror image.
//
// 1m entry, inside the window that opens at 09:30 New York time:
//   1. Change of character: the last 1m swing high was a lower high (sellers
//      in control on 1m) and a candle closes above it.
//   2. Fair value gap: three candles in that push where the first candle's
//      high is below the third candle's low. The latest one in the push is
//      used; if there is none, wait up to fvgWaitBars bars for one.
//   3. Limit order at the middle of the gap, stop under the low of the
//      middle (gap-making) candle, target targetR times the risk.
// The order is cancelled if a candle closes under the stop, price reaches
// the target first, or the window ends. One trade per New York day.
//
// The strategy signals on the bar that trades back to the middle of the gap,
// and the backtest engine fills at the next bar's open, so its fills differ
// a little from a resting limit order. findNyOpenFvgOrders returns the exact
// limit-order levels for a fill-accurate simulation.
export function findNyOpenFvgOrders(ltf: OHLC[], htf: OHLC[], options: NyOpenFvgOptions = {}): NyOpenFvgOrder[] {
  const o = { ...NY_OPEN_FVG_DEFAULTS, ...options };
  const longs = scanLongs(ltf, htf, o).map((x) => ({ ...x, side: "long" as const }));
  const shorts = scanLongs(flipCandles(ltf), flipCandles(htf), o).map((x) => ({
    ...x,
    side: "short" as const,
    entry: -x.entry,
    stop: -x.stop,
    target: -x.target,
  }));
  // One trade per day: the first fill wins; a long and a short on the same bar cancel out.
  const byDay = new Map<number, NyOpenFvgOrder[]>();
  for (const x of [...longs, ...shorts]) byDay.set(x.day, [...(byDay.get(x.day) ?? []), x]);
  const out: NyOpenFvgOrder[] = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => a.fillIdx - b.fillIdx);
    if (list.length > 1 && list[1].fillIdx === list[0].fillIdx) continue;
    out.push(list[0]);
  }
  return out.sort((a, b) => a.fillIdx - b.fillIdx);
}

type Opts = Required<Omit<NyOpenFvgOptions, "htfCandles">>;
type RawOrder = Omit<NyOpenFvgOrder, "side">;

function scanLongs(ltf: OHLC[], htf: OHLC[], o: Opts): RawOrder[] {
  const out: RawOrder[] = [];
  const clock = sessionClock(o.timeZone);
  const [hh, mm] = o.sessionOpen.split(":").map(Number);
  const winStart = hh * 60 + mm;
  const winEnd = winStart + o.windowMinutes;

  // 15m structure.
  const kH = o.htfSwingLookback;
  const hHighs: Swing[] = [];
  const hLows: Swing[] = [];
  let trendUp = false;
  let nextHtf = 0;
  const stepHtf = (j: number) => {
    const r = j - kH;
    if (r >= kH) {
      if (isSwingHigh(htf, r, kH)) hHighs.push({ price: htf[r].high, idx: r });
      if (isSwingLow(htf, r, kH)) hLows.push({ price: htf[r].low, idx: r });
    }
    const close = htf[j].close;
    const lastHigh = hHighs.at(-1);
    const lastLow = hLows.at(-1);
    const prevLow = hLows.at(-2);
    if (trendUp) {
      if (lastLow && close < lastLow.price) trendUp = false;
    } else if (lastHigh && lastLow && prevLow && lastLow.idx > lastHigh.idx && lastLow.price > prevLow.price && close > lastHigh.price) {
      trendUp = true;
    }
  };

  // 1m state.
  const k = o.ltfSwingLookback;
  const highs: Swing[] = [];
  let brokenHighIdx = -1; // the last 1m swing high a close has gone through
  let day = -1;
  let doneToday = false;
  let waiting: { legLowIdx: number; legLow: number; chochIdx: number; until: number } | null = null;
  let order: { entry: number; stop: number; target: number; chochIdx: number; fvgIdx: number } | null = null;

  const orderFrom = (i: number, chochIdx: number) => {
    const entry = (ltf[i - 2].high + ltf[i].low) / 2;
    let stop = o.stopAt === "first-candle" ? Math.min(ltf[i - 2].low, ltf[i - 1].low) : ltf[i - 1].low;
    if (stop >= entry) stop = ltf[i - 2].low; // the middle candle gapped up: use the first candle
    if (!(stop < entry)) return null;
    return { entry, stop, target: entry + o.targetR * (entry - stop), chochIdx, fvgIdx: i };
  };
  const isBullFvg = (i: number, from: number) => i - 2 >= from && ltf[i - 2].high < ltf[i].low;

  for (let t = 0; t < ltf.length; t++) {
    const c = ltf[t];
    while (nextHtf < htf.length && htf[nextHtf].closeTime <= c.closeTime) stepHtf(nextHtf++);

    const r = t - k;
    if (r >= k && isSwingHigh(ltf, r, k)) highs.push({ price: ltf[r].high, idx: r });

    const now = clock(c.openTime);
    if (now.day !== day) {
      day = now.day;
      doneToday = false;
      waiting = null;
      order = null;
    }
    const inWindow = now.weekday >= 1 && now.weekday <= 5 && now.minute >= winStart && now.minute < winEnd;

    // A resting order: fill, or cancel.
    if (order) {
      if (!inWindow) order = null;
      else if (c.low <= order.entry) {
        out.push({ day, chochIdx: order.chochIdx, fvgIdx: order.fvgIdx, fillIdx: t, entry: order.entry, stop: order.stop, target: order.target });
        order = null;
        doneToday = true;
      } else if (c.high >= order.target || c.close < order.stop) order = null;
    }

    // Change of character on 1m (tracked all day, so a break before the
    // window doesn't count as a fresh one inside it).
    const h = highs.at(-1);
    const prev = highs.at(-2);
    let choch = false;
    if (h && h.idx !== brokenHighIdx && c.close > h.price) {
      brokenHighIdx = h.idx;
      choch = !!prev && h.price < prev.price;
    }

    if (doneToday || order || !inWindow || !trendUp) {
      if (!inWindow) waiting = null;
      continue;
    }

    if (choch && h) {
      let legLowIdx = h.idx;
      for (let i = h.idx + 1; i <= t; i++) if (ltf[i].low < ltf[legLowIdx].low) legLowIdx = i;
      waiting = null;
      for (let i = t; i >= legLowIdx + 2; i--) {
        if (isBullFvg(i, legLowIdx)) {
          order = orderFrom(i, t);
          break;
        }
      }
      if (!order) waiting = { legLowIdx, legLow: ltf[legLowIdx].low, chochIdx: t, until: t + o.fvgWaitBars };
      continue;
    }

    if (waiting) {
      if (c.close < waiting.legLow || t > waiting.until) waiting = null;
      else if (isBullFvg(t, waiting.legLowIdx)) {
        order = orderFrom(t, waiting.chochIdx);
        waiting = null;
      }
    }
  }
  return out;
}

export function createNyOpenFvgStrategy(options: NyOpenFvgOptions = {}): Strategy {
  const { htfCandles = [] } = options;
  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "NY Open FVG (15m Trend + 1m Entry)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0 || htfCandles.length === 0) return signals;
      for (const x of findNyOpenFvgOrders(candles, htfCandles, options)) {
        signals[x.fillIdx] = x.side === "long" ? "BUY" : "SELL";
        computedTargets[x.fillIdx] = { stopLoss: x.stop, takeProfit: x.target };
      }
      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
