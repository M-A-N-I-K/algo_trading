import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/sessionLondonOpenBosStrategy.ts with its registry
// defaults: 4h EMA(50) bias, sessions 00:00 / 07:00 / 12:00 UTC, pivots
// 5 left / 5 right on the execution chart (15m tested), 2R target.
export const sessionLondonBosGuide: StrategyGuide = {
  key: "session-london-bos",
  name: "Session-Based London Open BOS",
  tagline: "At each session open, pick a side from the 4-hour trend, then trade the first breakout in that direction.",
  difficulty: "Beginner",
  style: "Session breakout",
  timeframes: "4h chart for the bias, 15m chart for the trade",
  markets: "Liquid crypto and gold (tested on BTCUSDT and ETHUSDT)",
  frequency: "Up to 3 a day per market (one per session); about 4–5 a week in the last test",
  holdTime: "A few hours",
  direction: "Long or short, whichever the 4h trend allows",

  summary: [
    "Big moves often start when a major trading session opens: Asia, London or New York. At each of those openings you check one thing: is the last closed 4-hour candle above or below its 50 EMA? That decides whether you may only buy or only sell until the next session opens.",
    "Then you wait on the 15-minute chart for price to break the latest swing point in that direction. One breakout, one trade, a stop at the opposite swing point and a fixed 2:1 target. It's the most mechanical strategy here and the best performer on BTC in the last test.",
  ],

  terms: [
    { term: "Session open", meaning: "The start of a trading session in UTC. Asia 00:00, London 07:00, New York 12:00 UTC. In India (IST): 05:30, 12:30 and 17:30." },
    { term: "EMA 50 (4h)", meaning: "The exponential moving average of the last 50 four-hour closes. It's a line that shows the medium-term trend." },
    { term: "Bias", meaning: "The only direction you're allowed to trade. 4h close above the EMA → longs only. Below → shorts only." },
    { term: "Pivot high / pivot low", meaning: "A 15m candle whose high (low) is higher (lower) than the 5 candles on each side. You only know it once those 5 later candles have closed." },
    { term: "Break of structure", meaning: "A candle CLOSING above the latest pivot high (or below the latest pivot low) when the candle before it hadn't." },
    { term: "Armed", meaning: "Ready to take one trade. A session open arms you; taking a trade (or the next session open) resets it." },
  ],

  chartSetup: [
    { title: "4-hour chart with EMA 50", detail: "Indicators → “Moving Average Exponential” → length 50, source close." },
    { title: "15-minute chart", detail: "This is where you trade. Optional: TradingView's “Pivot Points High Low” indicator with left 5 and right 5 marks the pivots for you." },
    { title: "Set three alarms", detail: "00:00, 07:00 and 12:00 UTC (05:30, 12:30 and 17:30 IST). You only need to look at the market at these times and when a breakout is close." },
  ],

  long: [
    { title: "At the session open, read the bias", detail: "Look at the last 4h candle that has fully CLOSED (not the one forming now). If it closed above the 50 EMA, you're long-only until the next session open." },
    { title: "Find the latest 15m pivot high and pivot low", detail: "The most recent confirmed pivots. The pivot high is your trigger line; the pivot low will be your stop." },
    { title: "Wait for the breakout close", detail: "A 15m candle closes above the pivot high, and the candle before it closed at or below it. That's the signal. A new pivot high forming before that moves your trigger line." },
    { title: "Check the stop makes sense", detail: "The pivot low must be below the signal candle's close. If it isn't, skip: you're done until the next session open." },
    { title: "Only one trade", detail: "After a signal you're disarmed until the next session open, even if price keeps breaking out." },
  ],

  short: [
    { title: "At the session open, read the bias", detail: "Last closed 4h candle below the 50 EMA → short-only until the next session open." },
    { title: "Find the latest 15m pivot low and pivot high", detail: "The pivot low is your trigger; the pivot high is your stop." },
    { title: "Wait for the breakdown close", detail: "A 15m candle closes below the pivot low, after the previous candle closed at or above it." },
    { title: "Check the stop and take one trade", detail: "The pivot high must be above the close. Then you're disarmed until the next session open." },
  ],

  entry: "Enter at the open of the next 15m candle after the signal candle closes, with a market order.",
  stop: "Long: the latest 15m pivot low. Short: the latest 15m pivot high. Place it straight away as a stop order.",
  target: "2 × your risk. Long: signal close + 2 × (signal close − stop). Short: signal close − 2 × (stop − signal close).",

  manage: [
    { title: "Set and forget", detail: "Stop and target go in as orders. The strategy doesn't trail or move anything." },
    { title: "Your window lasts until the next session", detail: "You stay armed after the session's first two hours. A breakout at 10:00 UTC still counts for the London arming, until New York opens at 12:00." },
    { title: "A new session resets the bias", detail: "At the next session open, re-read the 4h bias. It may flip. An open trade is unaffected and runs to its stop or target." },
  ],

  skip: [
    "The bias is flat: the 4h candle closed exactly on the EMA (rare).",
    "The breakout is against the bias.",
    "You already took (or skipped) a signal since this session opened.",
    "The stop pivot is on the wrong side of price.",
  ],

  mistakes: [
    "Reading the bias from the 4h candle that's still forming. Use the last CLOSED one.",
    "Using a wick above the pivot as the signal. Only a close counts.",
    "Taking a second breakout in the same session window.",
    "Converting session times wrongly. They're UTC; in India add 5 hours 30 minutes.",
  ],

  example: {
    title: "A London-session long",
    steps: [
      "07:00 UTC (12:30 IST). The 03:00–07:00 4h candle closed at 3,410; the 4h EMA 50 is 3,380. Bias: long-only.",
      "On 15m, the latest pivot high is 3,425 and the latest pivot low is 3,395.",
      "At 08:15 UTC a 15m candle closes at 3,428, after the previous one closed at 3,420. Signal.",
      "Risk = 3,428 − 3,395 = 33. Target = 3,428 + 66 = 3,494.",
      "Buy at the 08:30 open. Stop 3,395, target 3,494. You're done until New York opens at 12:00 UTC.",
    ],
  },

  diagram: {
    caption: "A long after the London open. Shorts are the mirror below the EMA.",
    price: [[0, 26], [8, 30], [14, 25], [20, 31], [27, 36], [32, 30], [38, 22], [43, 27], [49, 33], [55, 41], [62, 50], [70, 60], [80, 72], [92, 84]],
    levels: [
      { y: 37, x1: 22, x2: 70, label: "Last pivot high: the trigger", tone: "signal", labelAt: "start" },
      { y: 22, x1: 34, x2: 100, label: "Stop: last pivot low", tone: "loss" },
      { y: 84, x1: 60, x2: 100, label: "Target: 2 × risk", tone: "gain" },
    ],
    verticals: [{ x: 16, label: "07:00 UTC: 4h close above EMA 50 → longs only" }],
    marks: [
      { x: 38, y: 22, label: "Pivot low", tone: "muted", below: true },
      { x: 55, y: 41, label: "Close above → buy next open", tone: "gain", anchor: "end" },
    ],
  },

  checklist: [
    "I read the bias from the last CLOSED 4h candle at this session's open.",
    "The breakout is in the bias direction.",
    "A 15m candle CLOSED beyond the pivot, and the previous one hadn't.",
    "This is my first signal since the session opened.",
    "Stop at the opposite pivot, target at exactly 2R, size set from the stop.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "4h / 15m", trades: 99, winRatePct: 38.4, profitFactor: 1.2, returnPct: 13.3, maxDrawdownPct: 12.5 },
      { symbol: "ETHUSDT", timeframe: "4h / 15m", trades: 126, winRatePct: 37.3, profitFactor: 0.95, returnPct: -4.8, maxDrawdownPct: 25.1 },
    ],
    verdict:
      "The best BTC result of all the strategies (+13%), but it lost on ETH with a 25% drawdown. With a 2R target it needs to win more than a third of trades; it did on both coins, just barely after fees on ETH.",
  },
};
