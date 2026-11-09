import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/vwapStrategy.ts with its defaults: session VWAP
// reset at 00:00 UTC, no signals in a session's first 3 candles, retest
// within 12 candles of the breakout, swing lows 3 candles a side from the
// last 48 candles, ATR(14), stop 0.1 ATR beyond the signal candle's extreme
// but at least 0.5 ATR from entry, target 2R (or VWAP when it is at least 2R
// away), at most 2 signals per direction per session.
export const vwapGuide: StrategyGuide = {
  key: "vwap",
  name: "VWAP Retest + Liquidity Sweep",
  tagline: "Buy above VWAP only after price comes back and holds it, or after a stop hunt below a swing low, using VWAP as the target when price is far from it.",
  difficulty: "Beginner",
  style: "Intraday: VWAP as dynamic support/resistance, plus liquidity-sweep reversals",
  timeframes: "5m (the video's suggestion for new traders; 3m and 15m also work the same way)",
  markets: "Anything with real volume. Tested on 12 crypto markets and gold/silver (Binance), and on the Nifty 50 ETF (NIFTYBEES, NSE)",
  frequency: "Often: about 25 signals a week per market on 5m, at most 2 longs and 2 shorts a day",
  holdTime: "Minutes to a few hours",
  direction: "Both",

  summary: [
    "VWAP is the average price everyone has paid today, weighted by how much traded at each price. Big funds use it to judge whether they bought well, so price often reacts to it. This guide turns the video's two ways of using it into exact rules.",
    "Setup 1, the breakout retest: price has been below VWAP, then a candle closes above it. You do NOT buy that candle. You wait for price to come back down, touch VWAP and close back above it. VWAP has flipped from resistance to support, and you buy there with a stop under the retest candle and a target of twice your risk (2R).",
    "Setup 2, the liquidity sweep: a candle wicks below a recent swing low (where other traders' stops sit) and closes back above it. If that close is above VWAP, buy with a 2R target. If it's below VWAP, VWAP itself is the target, and you only take it if VWAP is at least 2R away.",
    "Be warned before you start: in testing it lost money on every market, mostly because a 5m stop is so small that fees eat a large part of every trade. Read the backtest section before risking anything.",
  ],

  terms: [
    { term: "VWAP (Volume Weighted Average Price)", meaning: "The average price of the day, where each candle's price counts more when more volume traded on it. It starts again every session. Here a session is one UTC day (starts 05:30 IST). The NSE day sits inside one UTC day, so on Nifty it simply resets each morning." },
    { term: "Typical price", meaning: "(high + low + close) ÷ 3 of a candle. VWAP is the volume-weighted average of these since the session started." },
    { term: "Breakout (above VWAP)", meaning: "A candle CLOSES above VWAP when the candle before it closed at or below VWAP." },
    { term: "Retest", meaning: "After the breakout, a later candle's low touches VWAP (or goes below it) but the candle CLOSES back above it. It has to happen within 12 candles (1 hour on 5m), and no candle in between may close below VWAP." },
    { term: "Dynamic support / resistance", meaning: "VWAP moves during the day, so it's a moving floor (support) when price is above it and a moving ceiling (resistance) when price is below it." },
    { term: "Swing low / swing high", meaning: "A candle whose low is lower than the 3 candles before and the 3 after it (highs: higher). You only know it's a swing once those 3 later candles have closed." },
    { term: "Liquidity", meaning: "The stop-loss orders sitting just below a swing low (above a swing high). Larger traders push price into them to fill their own orders." },
    { term: "Liquidity sweep", meaning: "A candle trades below a swing low from the last 48 candles (4 hours on 5m) and CLOSES back above it. The swing low must not have been traded through earlier." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle, averaged over 14 candles. Used for the stop buffer and the minimum stop distance." },
    { term: "R", meaning: "Your risk on the trade: entry minus stop. A 2R target is twice that distance above entry." },
    { term: "Mean reversion", meaning: "Betting that price far from its average comes back to it. That's the sweep below VWAP with VWAP as the target." },
  ],

  chartSetup: [
    { title: "Open a 5m chart", detail: "On TradingView or your broker's chart. Set the chart timezone to UTC, or remember the VWAP session starts at 05:30 IST." },
    { title: "Add VWAP", detail: "Indicators → type VWAP → Volume Weighted Average Price. Leave the inputs alone (anchor: Session). In Style, turn off the upper band, lower band and band fill so only the single VWAP line is left." },
    { title: "Add ATR (length 14)", detail: "You need its value for the stop. Read it off the signal candle." },
    { title: "Use a market with real volume", detail: "VWAP needs volume. The Nifty 50 index itself has none; use Nifty futures (NIFTY1!) or the NIFTYBEES ETF. Spot forex has no central volume either." },
    { title: "Mark the swing lows and highs", detail: "Put a horizontal line on each swing low and high from the last 4 hours. Delete a line once price has traded through it." },
  ],

  long: [
    { title: "Skip the first 15 minutes", detail: "Ignore the first 3 candles of the session (00:00–00:15 UTC, 05:30–05:45 IST). VWAP is built from only one or two candles then." },
    { title: "Setup 1: spot the breakout", detail: "A candle CLOSES above VWAP and the one before it closed at or below VWAP. Do not buy it. Note the time: the retest must come within 12 candles." },
    { title: "Setup 1: wait for the retest", detail: "If any candle closes back below VWAP, the breakout has failed: forget it. If a candle's low touches VWAP and it CLOSES above VWAP, that's your signal." },
    { title: "Setup 2: spot a sweep", detail: "A candle's low goes below a marked swing low and the candle CLOSES back above that swing low." },
    { title: "Setup 2: check where VWAP is", detail: "Sweep candle closed above VWAP: it's a long with a 2R target. Closed below VWAP: VWAP is the target, so it must be at least 2R above the close; if not, skip it." },
    { title: "Work out the stop", detail: "Signal candle's low − 0.1 × ATR. But if that is closer than 0.5 × ATR below the close, put the stop at close − 0.5 × ATR instead." },
    { title: "Check today's count", detail: "At most 2 long signals per session. After the second, stop looking for longs until tomorrow." },
  ],

  short: [
    { title: "Setup 1: breakdown, then retest", detail: "A candle CLOSES below VWAP after one that closed at or above it. Don't sell it. Within 12 candles, a candle's high touches VWAP and it CLOSES back below. Any close above VWAP in between cancels it." },
    { title: "Setup 2: sweep of a swing high", detail: "A candle's high goes above a swing high from the last 48 candles and it CLOSES back below it. Closed below VWAP: 2R target. Closed above VWAP: VWAP is the target, if it's at least 2R below." },
    { title: "Stop above the signal candle", detail: "Signal candle's high + 0.1 × ATR, and at least 0.5 × ATR above the close." },
    { title: "At most 2 short signals a session", detail: "Counted separately from the longs." },
  ],

  entry: "Enter with a market order at the open of the next candle after the signal candle closes. If a long and a short signal appear on the same candle, take neither. If you're already in a trade, skip new signals until it closes.",
  stop: "Long: the signal candle's low minus 0.1 × ATR(14), but never closer than 0.5 × ATR below the signal close. Short: the signal candle's high plus 0.1 × ATR, at least 0.5 × ATR above the close. Place it as soon as you're filled and don't move it.",
  target: "On the right side of VWAP (long above it, short below it): 2R, twice the stop distance from the signal close. For a sweep on the wrong side of VWAP: VWAP's value on the signal candle, as a fixed price. VWAP keeps moving afterwards; the target doesn't.",

  manage: [
    { title: "Set stop and target straight away", detail: "Use a bracket (OCO) order so both are on the exchange. The backtest never moves them." },
    { title: "Size from the stop", detail: "Risk 1% of the account: quantity = (1% of account) ÷ (entry − stop). The Position size page does it for you." },
    { title: "Break-even is optional", detail: "The video's trader moves the stop to entry once price is halfway to the target. The backtest does NOT do that. Your results will differ if you do." },
    { title: "Count your fees first", detail: "Work out the round-trip fee as a share of your risk before entering. In the backtest the typical BTC 5m stop was only 0.09% of price. At 0.04% per side the round trip costs 0.08%, almost a whole 1R, on every trade, win or lose." },
    { title: "Flat by the close on Indian markets", detail: "VWAP resets every morning. In the Nifty test, any open trade was closed at the next session's open. Close it yourself before 15:30 IST." },
  ],

  skip: [
    "The breakout candle itself. Never buy the first close above VWAP; wait for the retest.",
    "Price closed back below VWAP before retesting it, or more than 12 candles passed.",
    "The first 15 minutes of the session.",
    "A sweep below VWAP where VWAP is less than 2R away.",
    "A market with no real volume (the Nifty index, spot forex). VWAP there is meaningless.",
    "You've already had 2 signals in that direction today.",
    "Your fees are a large share of your stop. That's the main reason it lost money in testing.",
  ],

  mistakes: [
    "Buying the breakout. The video says it plainly: enter on the retest, not the breakout.",
    "Using a VWAP with the bands still on and treating the bands as levels. Only the middle line is used here.",
    "Calling every wick near VWAP a retest. The candle must touch VWAP and CLOSE on the right side of it.",
    "Letting the VWAP target drift. Fix the target at VWAP's value when the signal fires.",
    "Tightening the stop to the exact wick to get a bigger position. Tiny stops on 5m are mostly fees.",
    "Trusting hand-picked chart examples. In the backtest the same rules won only about 1 trade in 4 after fees.",
  ],

  example: {
    title: "Two longs on a 5m chart (round numbers)",
    steps: [
      "Setup 1. All morning price has been under VWAP. At 10:05 a candle closes at 100.60 with VWAP at 100.05: a breakout. You don't buy it.",
      "At 10:15 a candle dips to 100.10 (VWAP is now 100.12, so the low touched it) and closes at 100.50, above VWAP. No candle closed below VWAP in between, and it's within 12 candles. That's the signal.",
      "ATR(14) is 0.40. Stop: 100.10 − 0.1 × 0.40 = 100.06. Minimum distance: 100.50 − 0.5 × 0.40 = 100.30. 100.06 is further away, so the stop is 100.06. Risk = 100.50 − 100.06 = 0.44. Target = 100.50 + 2 × 0.44 = 101.38.",
      "Risking $100: quantity = 100 ÷ 0.44 ≈ 227 units, about $22,800 of position. At 0.04% per side the fees are about $18 a round trip, or 0.18R. A win nets about +$182, a loss about −$118.",
      "Setup 2, another day. Price has fallen to 98.00 with VWAP at 100.00. Two hours ago there was a swing low at 97.50. A candle wicks to 97.30 and closes at 97.70, back above 97.50: a sweep, and it closed below VWAP.",
      "ATR is 0.40. Stop: 97.30 − 0.04 = 97.26 (further than 97.70 − 0.20 = 97.50, so keep 97.26). Risk 0.44. VWAP is 2.30 above the close: 5.2R, more than the 2R needed. Target: 100.00, fixed.",
    ],
  },

  diagram: {
    caption: "Setup 1, the long breakout retest. Price closes above VWAP (don't buy), comes back to touch it, and closes above it again: buy, stop under the retest low, target 2R. Shorts are the same picture upside down.",
    price: [[0, 62], [10, 50], [20, 40], [30, 44], [38, 40], [46, 58], [52, 64], [58, 53], [62, 57], [70, 64], [80, 73], [92, 78]],
    lines: [{ points: [[0, 60], [20, 52], [40, 49], [58, 52], [100, 56]], label: "VWAP", tone: "signal" }],
    levels: [
      { y: 73, x1: 58, x2: 100, label: "Target: 2R", tone: "gain", labelAt: "start" },
      { y: 44, x1: 58, x2: 100, label: "Stop: retest low − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 46, y: 58, label: "Breakout: don't buy", tone: "muted", anchor: "end" },
      { x: 58, y: 53, label: "Retest = buy", tone: "gain", below: true },
    ],
  },

  checklist: [
    "This market has real volume, and VWAP is the plain session line with the bands off.",
    "It's past the first 15 minutes of the session.",
    "Setup 1: the breakout candle came first, then within 12 candles a candle touched VWAP and closed back on the breakout side, with no close back through VWAP in between. Or setup 2: a candle swept a swing low (high) from the last 4 hours and closed back above (below) it.",
    "Stop is 0.1 ATR beyond the signal candle, and at least 0.5 ATR from entry.",
    "Target is 2R, or VWAP if I'm trading back towards it, and VWAP is at least 2R away.",
    "This is no more than my second signal in this direction today.",
    "I've sized 1% risk from the stop and checked the round-trip fee as a share of that risk.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "5m", trades: 666, winRatePct: 27.3, profitFactor: 0.37, returnPct: -42.1, maxDrawdownPct: 42.1 },
      { symbol: "ETHUSDT", timeframe: "5m", trades: 668, winRatePct: 28.7, profitFactor: 0.5, returnPct: -40.9, maxDrawdownPct: 41.2 },
      { symbol: "XAUUSDT", timeframe: "5m", trades: 630, winRatePct: 22.5, profitFactor: 0.29, returnPct: -38.2, maxDrawdownPct: 38.2 },
      { symbol: "XAGUSDT", timeframe: "5m", trades: 628, winRatePct: 26.6, profitFactor: 0.55, returnPct: -37.7, maxDrawdownPct: 39.2 },
      { symbol: "XRPUSDT", timeframe: "5m", trades: 655, winRatePct: 30.5, profitFactor: 0.63, returnPct: -34.3, maxDrawdownPct: 34.3 },
    ],
    verdict:
      "It lost money everywhere. In these 6 months all five markets lost 34–42%. Over 2 years at 0.059% per side (the fee CoinDCX actually charged), all 12 markets lost on both 5m and 15m: 24 of 24 runs, losing 57–97%, with profit factors of 0.28–0.80. The rules themselves have no edge even before costs: with zero fees the profit factor was 0.93–1.30 and usually close to 1.00. A 2R target needs a win rate above 33% just to break even before fees, and it won 28–33%. Fees then make it much worse, because a 5m stop is tiny. The typical BTC stop was 0.09% of price, and the round-trip fee at 0.059% per side is 0.12%, more than the whole risk. Gold did best before fees (profit factor 1.18 on 5m and 1.30 on 15m), but its typical stop was only 0.06%, so it lost the most after them. Taking only retests, wider 1-ATR stops, 1 trade a day, or using 15m candles didn't fix it: still 0 of 24 profitable. On Indian markets, NIFTYBEES (the Nifty 50 ETF, the only free Nifty intraday data with volume) over the last 60 days, during NSE hours, closing at the end of each day, at 0.03% per side: 5m 150 trades, win 26.7%, profit factor 0.27, −9.7%; 15m 80 trades, win 38.8%, profit factor 0.73, −2.4%. The video's trader picks the “important” levels by eye and trades Nifty options, which this test can't copy. Don't trade it as coded.",
  },
};
