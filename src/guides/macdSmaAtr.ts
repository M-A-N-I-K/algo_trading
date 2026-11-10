import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS, NAS100_60D } from "./shared";

// Matches src/strategies/macdSmaAtrStrategy.ts with its defaults: SMA 50,
// MACD 12/26/9 histogram, ATR 14 against its own 20-period SMA. It has no
// stop or target: an opposite signal closes the trade and reverses it.
export const macdSmaAtrGuide: StrategyGuide = {
  key: "macd-sma-atr",
  name: "MACD + SMA + ATR",
  tagline: "Ride momentum in the direction of the 50 SMA when the market is waking up; flip when it turns.",
  difficulty: "Beginner",
  style: "Momentum, always in the market",
  timeframes: "One chart, 15m",
  markets: "Liquid crypto (tested on BTCUSDT and ETHUSDT, plus NAS100)",
  frequency: "About 6 trades a week per market",
  holdTime: "Until the opposite signal: hours to days",
  direction: "Long or short; flips from one to the other",

  summary: [
    "Three simple checks: is price above or below the 50 SMA (trend), did the MACD histogram just flip sign (momentum), and is ATR above its own average (the market is moving, not dead)? All three in the same direction is a signal.",
    "There's no stop and no target. You stay in until the opposite signal, then close and reverse. That makes it the easiest to follow and the riskiest to hold, so read the safety note in “Stop loss” before trading it.",
  ],

  terms: [
    { term: "SMA 50", meaning: "The simple average of the last 50 closes. Price above = uptrend." },
    { term: "MACD histogram", meaning: "The bars under the MACD indicator: MACD line minus signal line. Flipping from zero-or-negative to positive = momentum turning up." },
    { term: "ATR 14", meaning: "Average True Range: how far price moves per candle on average over the last 14 candles." },
    { term: "ATR above its average", meaning: "ATR(14) is higher than the 20-candle average of ATR(14). Volatility is expanding, so the move has fuel." },
    { term: "Reverse", meaning: "Closing your trade and opening one in the other direction at the same time." },
  ],

  chartSetup: [
    { title: "15-minute chart with SMA 50", detail: "Indicators → “Moving Average” (simple) → length 50." },
    { title: "Add MACD", detail: "Fast 12, slow 26, signal 9. You'll watch the histogram bars." },
    { title: "Add ATR with a moving average on it", detail: "Add “Average True Range”, length 14. Then on the ATR pane, add a Moving Average (simple, length 20) with ATR as its source. You compare the two lines." },
  ],

  long: [
    { title: "Price closes above the SMA 50", detail: "Check on the candle that just closed." },
    { title: "The MACD histogram flips positive", detail: "The previous bar was zero or below; this one is above zero." },
    { title: "ATR is above its 20 SMA", detail: "On the same candle." },
    { title: "All three on one candle = BUY", detail: "If you're short, close the short and go long. If you're already long, do nothing." },
  ],

  short: [
    { title: "Price closes below the SMA 50", detail: "Check on the candle that just closed." },
    { title: "The MACD histogram flips negative", detail: "The previous bar was zero or above; this one is below zero." },
    { title: "ATR is above its 20 SMA", detail: "On the same candle." },
    { title: "All three on one candle = SELL", detail: "If you're long, close the long and go short. If you're already short, do nothing." },
  ],

  entry: "At the open of the next 15m candle after the signal candle closes, market order.",
  stop: "None in the strategy: the trade ends only at the opposite signal. Safety rule (not part of the backtest): always place an emergency stop 3 × ATR(14) from your entry so one sudden crash can't wipe you out. It will change results somewhat.",
  target: "None. You exit, and reverse, when the opposite signal appears.",

  manage: [
    { title: "Check once per 15-minute close", detail: "The only thing that ends a trade is an opposite signal. Set an alert for the MACD histogram crossing zero so you don't have to watch." },
    { title: "Reverse in one go", detail: "On a SELL while long: close the long and open the short at the same open. Same in reverse." },
    { title: "Size for the emergency stop", detail: "Risk ÷ (3 × ATR) = quantity. The backtest used the whole balance with no stop; don't do that with real money." },
  ],

  skip: [
    "ATR is below its average: the market is quiet, and signals there whipsaw.",
    "The histogram flipped but price is on the wrong side of the SMA.",
    "You're already in a trade in that direction.",
  ],

  mistakes: [
    "Trading without any stop because the backtest didn't have one.",
    "Acting on a histogram bar that hasn't closed yet. It can flip back before the candle ends.",
    "Using a moving average on price instead of on ATR for the volatility check.",
    "Taking every histogram flip: all three conditions must line up on the same candle.",
  ],

  example: {
    title: "A long and its reversal",
    steps: [
      "A 15m candle closes at 3,250, above the SMA 50 (3,230). The histogram goes from −0.8 to +1.1. ATR is 14.2, above its 20-SMA of 12.9. BUY.",
      "Buy at the next open (3,252). Emergency stop: 3,252 − 3 × 14.2 ≈ 3,209.",
      "Two days later a candle closes at 3,301, below the SMA (3,310), the histogram flips to −0.6 and ATR is above average. SELL.",
      "Close the long (about +49 per unit) and open a short at the next open, with a new emergency stop 3 × ATR above.",
    ],
  },

  diagram: {
    caption: "A long that is later reversed into a short. No fixed stop or target.",
    price: [[0, 26], [9, 22], [18, 28], [26, 38], [34, 52], [43, 62], [52, 68], [61, 64], [69, 54], [77, 36], [85, 30], [94, 22]],
    lines: [{ points: [[0, 30], [100, 40]], label: "SMA 50", tone: "fees" }],
    marks: [
      { x: 26, y: 38, label: "BUY: all three line up", tone: "gain", anchor: "end" },
      { x: 77, y: 36, label: "SELL: close long, go short", tone: "loss", below: true, anchor: "end" },
    ],
  },

  checklist: [
    "The candle has CLOSED.",
    "Price is on the right side of the SMA 50.",
    "The MACD histogram just flipped sign on this candle.",
    "ATR(14) is above its 20-candle average.",
    "My emergency stop (3 × ATR) is in and my size is set from it.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "15m", trades: 166, winRatePct: 31.3, profitFactor: 0.9, returnPct: -11.8, maxDrawdownPct: 33.5 },
      { symbol: "ETHUSDT", timeframe: "15m", trades: 162, winRatePct: 32.7, profitFactor: 1.3, returnPct: 44.9, maxDrawdownPct: 26.1 },
      { symbol: "NAS100", timeframe: "15m", period: NAS100_60D, trades: 30, winRatePct: 30.0, profitFactor: 1.16, returnPct: 2.3, maxDrawdownPct: 9.2 },
    ],
    verdict:
      "The biggest swing of all: +45% on ETH, −12% on BTC, with 26–34% drawdowns because there's no stop. One good trend on ETH can explain the gain. Don't read it as an edge yet. NAS100 made +2.3% on 30 trades over 58 days, but with a 9.2% drawdown on the way.",
  },
};
