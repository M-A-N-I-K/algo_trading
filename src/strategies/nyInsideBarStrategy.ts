import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface NyInsideBarOptions {
  // New York cash open, local time "HH:MM", and the opening range after it.
  sessionOpen?: string;
  rangeMinutes?: number;
  // Last time a stop order may be live (the candle it could fill on must
  // start before this), and when every open trade is closed.
  lastEntry?: string;
  flatAt?: string;
  // Candles after the inside candle that its high/low may be broken in.
  waitBars?: number;
  // Target as a multiple of the risk from the entry trigger.
  targetR?: number;
  maxTradesPerDay?: number;
  timeZone?: string;
}

export const NY_INSIDE_BAR_DEFAULTS = {
  sessionOpen: "09:30",
  rangeMinutes: 30,
  lastEntry: "15:00",
  flatAt: "16:00",
  waitBars: 3,
  targetR: 1,
  maxTradesPerDay: 2,
  timeZone: "America/New_York",
} as const;

const DAY = 86_400_000;
const MIN = 60_000;

// UTC ms of a New York wall-clock time on the New York day containing t.
function clock(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const offsets = new Map<number, number>();
  // Offset of local time from UTC, looked up at UTC noon of the day.
  const offsetOn = (utcDay: number) => {
    let off = offsets.get(utcDay);
    if (off === undefined) {
      const noon = utcDay * DAY + DAY / 2;
      const parts = fmt.formatToParts(new Date(noon));
      const v = (type: string) => Number(parts.find((p) => p.type === type)!.value);
      off = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - noon;
      offsets.set(utcDay, off);
    }
    return off;
  };
  return {
    // The local calendar day (days since the epoch) of time t.
    day: (t: number) => Math.floor((t + offsetOn(Math.floor(t / DAY))) / DAY),
    // UTC ms of local minute-of-day `minute` on local day `day`.
    at: (day: number, minute: number) => day * DAY + minute * MIN - offsetOn(day),
  };
}
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// One trade the strategy takes: the stop order, where it filled and how it ended.
export interface NyInsideBarTrade {
  side: "long" | "short";
  insideIdx: number; // the inside candle
  fillIdx: number;
  entry: number; // the trigger, or the open if price gapped past it
  stop: number;
  target: number;
  exitIdx: number;
}

// NY Inside Bar: the New York open on 15-minute candles, 1:1.
//
// 1. Opening range: the candles from 09:30 to 10:00 New York time. Its colour
//    (last close vs first open) is the day's bias: up = longs only, down =
//    shorts only, flat = no trade.
// 2. After it, a candle whose body (open to close) sits inside the previous
//    candle's body is an inside candle. On an up day, a buy stop goes at its
//    high; on a down day, a sell stop at its low.
// 3. The order lives for the next 3 candles. It's cancelled if price breaks
//    the other side of the inside candle first (or both sides in one candle),
//    or if a newer inside candle forms (its order replaces this one).
// 4. Stop beyond both candles (the lower of the two lows for a buy), target
//    1 × the risk from the trigger. At most 2 trades a day, one at a time, and
//    the inside candle must form after the last trade ended. No order can fill
//    on a candle starting 15:00 or later; anything open is closed at 16:00.
//
// The strategy tracks its own trades with the backtest engine's rules (stop
// before target inside a candle, the time exit at the open), so it knows when
// it is flat and how many trades it took. Signals repeat on each candle the
// stop order is live, with the order in the trade target (entryStop).
export function findNyInsideBarTrades(candles: OHLC[], options: NyInsideBarOptions = {}): { trades: NyInsideBarTrade[]; signals: Signal[]; targets: (TradeTarget | null)[] } {
  const o = { ...NY_INSIDE_BAR_DEFAULTS, ...options };
  const n = candles.length;
  const signals: Signal[] = new Array(n).fill("HOLD");
  const targets: (TradeTarget | null)[] = new Array(n).fill(null);
  const trades: NyInsideBarTrade[] = [];
  if (n < 2) return { trades, signals, targets };

  const barMs = candles[1].openTime - candles[0].openTime;
  if (!(barMs > 0) || barMs > o.rangeMinutes * MIN) return { trades, signals, targets };

  const c = clock(o.timeZone);
  const openMin = minutes(o.sessionOpen);
  const bodyLo = (b: OHLC) => Math.min(b.open, b.close);
  const bodyHi = (b: OHLC) => Math.max(b.open, b.close);

  let day = -1;
  let rangeEnd = 0, lastEntry = 0, flat = 0;
  let rangeOpen = NaN, rangeClose = NaN, rangeBars = 0, bias = 0;
  let taken = 0;
  let lastExit = -1; // index of the bar the last trade ended on
  let setup: { idx: number; trigger: number; cancel: number; stop: number; target: number } | null = null;
  let trade: { fill: number; d: number; entry: number; stop: number; target: number; insideIdx: number; flat: number } | null = null;

  for (let t = 0; t < n; t++) {
    const bar = candles[t];
    const d0 = c.day(bar.openTime);
    if (d0 !== day) {
      day = d0;
      const open = c.at(day, openMin);
      rangeEnd = open + o.rangeMinutes * MIN;
      lastEntry = c.at(day, minutes(o.lastEntry));
      flat = c.at(day, minutes(o.flatAt));
      rangeOpen = NaN;
      rangeBars = 0;
      bias = 0;
      taken = 0;
      setup = null;
    }
    if (bar.openTime >= c.at(day, openMin) && bar.openTime < rangeEnd) {
      if (rangeBars === 0) rangeOpen = bar.open;
      rangeClose = bar.close;
      rangeBars++;
      if (bar.openTime + barMs >= rangeEnd) bias = rangeBars >= Math.max(1, Math.floor((o.rangeMinutes * MIN) / barMs) - 1) ? Math.sign(rangeClose - rangeOpen) : 0;
    }

    // An open trade: the time exit at the open, then stop, then target.
    if (trade) {
      if (t > trade.fill && bar.openTime >= trade.flat) lastExit = t;
      else if (trade.d > 0 ? bar.low <= trade.stop : bar.high >= trade.stop) lastExit = t;
      else if (trade.d > 0 ? bar.high >= trade.target : bar.low <= trade.target) lastExit = t;
      if (lastExit === t) {
        trades.push({ side: trade.d > 0 ? "long" : "short", insideIdx: trade.insideIdx, fillIdx: trade.fill, entry: trade.entry, stop: trade.stop, target: trade.target, exitIdx: t });
        trade = null;
      }
      continue;
    }

    // A live stop order from the previous candle's close: fill, cancel or keep.
    if (setup && t > setup.idx) {
      const d = bias;
      const hit = d > 0 ? bar.high >= setup.trigger : bar.low <= setup.trigger;
      const other = d > 0 ? bar.low <= setup.cancel : bar.high >= setup.cancel;
      if (hit && !other) {
        const entry = d > 0 ? Math.max(bar.open, setup.trigger) : Math.min(bar.open, setup.trigger);
        const s = setup;
        setup = null;
        // Gapped past the target: the engine skips it, and so does the strategy.
        if (d > 0 ? entry < s.target : entry > s.target) {
          taken++;
          trade = { fill: t, d, entry, stop: s.stop, target: s.target, insideIdx: s.idx, flat };
          // The fill candle itself can reach the stop or the target.
          if (d > 0 ? bar.low <= s.stop : bar.high >= s.stop) lastExit = t;
          else if (d > 0 ? bar.high >= s.target : bar.low <= s.target) lastExit = t;
          if (lastExit === t) {
            trades.push({ side: d > 0 ? "long" : "short", insideIdx: s.idx, fillIdx: t, entry, stop: s.stop, target: s.target, exitIdx: t });
            trade = null;
          }
          continue;
        }
      }
      if (hit || other || t - setup.idx >= o.waitBars) setup = null;
    }

    // A new inside candle (only after the opening range, on a day with a bias,
    // and after the last trade ended) replaces any older order.
    const prev = candles[t - 1];
    if (prev && bias !== 0 && bar.openTime >= rangeEnd && t > lastExit && taken < o.maxTradesPerDay && bodyLo(bar) >= bodyLo(prev) && bodyHi(bar) <= bodyHi(prev)) {
      const d = bias;
      const trigger = d > 0 ? bar.high : bar.low;
      const stop = d > 0 ? Math.min(prev.low, bar.low) : Math.max(prev.high, bar.high);
      const risk = (trigger - stop) * d;
      if (risk > 0) setup = { idx: t, trigger, cancel: d > 0 ? bar.low : bar.high, stop, target: trigger + d * o.targetR * risk };
    }

    // The order stays live for the next candle if that candle starts before the cutoff.
    if (setup && bar.openTime + barMs < lastEntry) {
      signals[t] = bias > 0 ? "BUY" : "SELL";
      targets[t] = { stopLoss: setup.stop, takeProfit: setup.target, entryStop: setup.trigger, cancelEntryAt: setup.cancel, exitAt: flat };
    }
  }
  return { trades, signals, targets };
}

export function createNyInsideBarStrategy(options: NyInsideBarOptions = {}): Strategy {
  let computedTargets: (TradeTarget | null)[] = [];
  return {
    name: "NY Inside Bar (Opening-Range Bias, 1:1)",
    generateSignals(candles: OHLC[]): Signal[] {
      const { signals, targets } = findNyInsideBarTrades(candles, options);
      computedTargets = targets;
      return signals;
    },
    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
