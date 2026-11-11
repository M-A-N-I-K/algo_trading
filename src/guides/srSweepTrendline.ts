import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/srSweepTrendlineStrategy.ts with its defaults
// (SR_SWEEP_TRENDLINE_DEFAULTS): 200 EMA trend filter on, swing levels 3
// candles each side, equal lows within 0.25 ATR(14) and at most 100 candles
// apart, a level can be swept up to 300 candles after it forms, the sweep must
// close back above within 3 candles, trend line through the last two falling
// swing highs (3 candles each side) up to 80 candles before the sweep, break
// candle green with a body of at least 1 ATR, within 48 candles of the
// reclaim; stop = lowest low since the sweep − 0.1 ATR, target 3R.
export const srSweepTrendlineGuide: StrategyGuide = {
  key: "sr-sweep-trendline",
  name: "S/R Sweep + Trend-Line Break",
  tagline: "Let price run the stops under a level, then buy the big candle that breaks the little downtrend into it.",
  difficulty: "Intermediate",
  style: "Reversal after a liquidity sweep, confirmed by a trend-line break",
  timeframes: "One chart: 1h",
  markets: "Stock indices. It held up on NAS100 (and SPX500) 1h; it lost on gold, silver, crypto and GBP/USD",
  frequency: "About one trade a month on NAS100 1h",
  holdTime: "Hours to a few days",
  direction: "Both: buys above the 200 EMA after a support sweep, sells below it after a resistance sweep",

  summary: [
    "Price often bounces twice from the same price: that's support. Traders who buy there put their stop losses just under it, so a pile of orders (liquidity) sits below the level. Big players push price into those stops, fill their own orders, then price turns back up. That dip below the level is the sweep.",
    "On the way down into the sweep, price makes a small downtrend: lower highs you can join with a trend line. This strategy waits for the sweep, waits for price to close back above the level, then buys when a big green candle closes above that trend line, in the direction of the 200 EMA. The stop goes under the sweep low and the target is 3 times the risk. Shorts are the mirror: resistance, a spike above it, a close back below, a big red candle breaking the small uptrend line, below the 200 EMA.",
    "It comes from a YouTube gold-scalping video. On 6.5 years of MT5 data the video's version (gold, 5 minutes) didn't survive: moving the candles by one minute turned it into a loser. The same rules on NAS100 1h did hold up, so that's how this guide sets it up.",
  ],

  terms: [
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the 3 candles on each side. You only know it's a swing after those 3 later candles have closed." },
    { term: "Support level (equal lows)", meaning: "Two swing lows within 0.25 × ATR of each other, at most 100 candles apart, with no candle between them dipping below the lower one. The level is the lower of the two. Resistance (equal highs) is the mirror." },
    { term: "Liquidity", meaning: "The stop losses and pending orders sitting just beyond an obvious level." },
    { term: "Sweep", meaning: "A candle's low trades below the support level. The level must have formed within the last 300 candles." },
    { term: "Reclaim", meaning: "A candle CLOSES back above the level. It must happen on the sweep candle or within the next 2 candles (3 candles in all), or the setup is off." },
    { term: "Sweep low", meaning: "The lowest low since the sweep. It moves lower if price dips again without closing back below the level." },
    { term: "Trend line", meaning: "A straight line through the last two swing highs that formed at or before the sweep candle (within 80 candles of it), where the later high is lower than the earlier one. Extend it to the right. It describes the small downtrend into the sweep." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle (14-candle average). It sets the 'equal' tolerance, the big-candle size and the stop buffer." },
    { term: "200 EMA", meaning: "The 200-period exponential moving average of the closes. Buy only when the signal candle closes above it, sell only below it." },
    { term: "R", meaning: "Your risk on the trade: entry minus stop. 3R is a profit three times that." },
  ],

  chartSetup: [
    { title: "Open a 1-hour chart", detail: "NAS100 (US Tech 100) on your broker's platform. MT5 users can add the PB indicator from the Indicators page, which marks every signal." },
    { title: "Add the 200 EMA", detail: "Indicators → Moving Average Exponential → length 200, source close." },
    { title: "Add ATR", detail: "Indicators → Average True Range → length 14. Read its value for the equal-lows check, the big-candle check and the stop buffer." },
    { title: "Have the line tools ready", detail: "A horizontal line for the level, a trend line, and lines for entry, stop and target." },
  ],

  long: [
    { title: "Mark swing lows and highs", detail: "A swing low has 3 higher lows on each side; a swing high has 3 lower highs on each side." },
    { title: "Find support", detail: "Two swing lows within 0.25 × ATR (ATR 60 points → within 15), no more than 100 candles apart, with nothing in between dipping below the lower one. Draw a line at the lower one." },
    { title: "Wait for the sweep", detail: "A candle's low goes below the line. Note the sweep low: the lowest low from here on." },
    { title: "Wait for the reclaim", detail: "A candle must CLOSE above the line, on the sweep candle or one of the next 2. If 3 candles in a row close below it, the setup is dead." },
    { title: "Draw the trend line", detail: "Take the last two swing highs that formed at or before the sweep candle. The second must be lower than the first. Join them and extend the line to the right. If they aren't falling, there's no line and no trade." },
    { title: "Watch for new lows", detail: "If price dips below the sweep low again: a close back at or below the level kills the setup; otherwise the sweep low (and your stop) moves down to the new low." },
    { title: "Wait for the break", detail: "Within 48 candles of the reclaim, a GREEN candle must close above the trend line, with a body (close − open) of at least 1 × ATR, and close above the 200 EMA. That candle is the signal. If 48 candles pass first, drop it." },
    { title: "Set stop and target", detail: "Stop = sweep low − 0.1 × ATR. Risk = signal close − stop. Target = signal close + 3 × risk." },
  ],

  short: [
    { title: "Find resistance", detail: "Two swing highs within 0.25 × ATR, up to 100 candles apart, nothing between them trading above the higher one. Line at the higher one." },
    { title: "Wait for the sweep and the reclaim", detail: "A candle's high goes above the line, and a candle closes back below it within 3 candles. Track the sweep high." },
    { title: "Draw the trend line", detail: "Through the last two swing lows at or before the sweep candle, the second higher than the first (a small uptrend). Extend it." },
    { title: "Wait for the break", detail: "Within 48 candles, a RED candle closes below the line with a body of at least 1 × ATR, below the 200 EMA. A new high that closes back at or above the level kills it." },
    { title: "Set stop and target", detail: "Stop = sweep high + 0.1 × ATR. Target = signal close − 3 × risk." },
  ],

  entry: "Enter with a market order at the open of the candle after the signal candle closes. The backtest skips the trade if that open is already past the stop or the target.",
  stop: "Long: the lowest low since the sweep minus 0.1 × ATR(14). Short: the highest high since the sweep plus 0.1 × ATR. Place it as a real stop order straight away.",
  target: "3 × the risk from the signal close. Fixed: it doesn't look for the next level. The Playbook also trades it on ETH 4h with a 1.5 × risk target (30 trades on MT5 bars since 2020, profit factor 2.83, a small sample).",

  manage: [
    { title: "Set and forget", detail: "Place the stop and the target right after entry. The strategy never moves them." },
    { title: "One trade per level", detail: "Once a level has been swept it's used up, whether or not a trade came of it. Wait for a new level." },
    { title: "One setup at a time per side", detail: "While a sweep is being worked, other levels are ignored until it signals or dies." },
    { title: "Size from the stop", detail: "Risk a fixed amount (the Playbook sets it per account), then size = risk ÷ (entry − stop). The Position size page does this." },
  ],

  skip: [
    "There are no equal lows (or highs) nearby: no level, no setup.",
    "Price swept the level but closed below it 3 candles running.",
    "The two swing highs before the sweep aren't falling (or there aren't two): no trend line.",
    "The break candle is small (body under 1 ATR), red, or closes on the wrong side of the 200 EMA.",
    "A new low closed back at or below the level.",
    "More than 48 candles have passed since the reclaim.",
    "The market is gold, silver, crypto or GBP/USD: the same rules lost money there on 6.5 years of MT5 data.",
  ],

  mistakes: [
    "Buying the moment price dips under support. The sweep is only the trigger to start watching.",
    "Drawing the trend line through any two highs. It has to be the last two swing highs at or before the sweep, and they must be falling.",
    "Taking a small break candle. The 1-ATR body was part of what made it work; small breaks lost.",
    "Trading against the 200 EMA because the setup 'looks perfect'.",
    "Moving the target to the next level. The tested version always aims for 3R.",
    "Trading it on 5-minute charts like the video. It lost there on every market tested.",
  ],

  example: {
    title: "A long on NAS100 1h (round numbers)",
    steps: [
      "Price is above the 200 EMA (24,600). Two swing lows form at 24,800 and 24,812. ATR is 60, so 0.25 × ATR = 15: equal. Nothing between them went below 24,800, so support is 24,800.",
      "Price rallies to a swing high at 24,950, then drifts down: a lower swing high at 24,900. The trend line joins 24,950 and 24,900 and slopes down.",
      "A candle dips to 24,770 (the sweep) and closes at 24,790, below the level. The next candle closes at 24,815, back above it: reclaimed within 3 candles.",
      "Four candles later a green candle opens at 24,820 and closes at 24,890. Its body is 70, more than 1 ATR, the trend line is at 24,860 there, and the close is above the EMA. Signal.",
      "Stop = 24,770 − 6 = 24,764. Risk = 24,890 − 24,764 = 126 points. Target = 24,890 + 3 × 126 = 25,268.",
      "Risking $50: size = 50 ÷ 126 ≈ 0.4 lots of a $1-per-point contract. Buy at the next candle's open, stop 24,764, target 25,268, then leave it.",
    ],
  },

  diagram: {
    caption: "A long setup. Shorts are the same picture upside down: resistance, a spike above it, a close back below, a big red candle breaking the small uptrend line.",
    price: [[0, 85], [8, 64], [14, 74], [20, 44], [28, 60], [34, 44.6], [40, 80], [46, 62], [52, 72], [60, 39], [64, 47], [70, 45], [76, 59], [86, 76], [96, 96]],
    lines: [{ points: [[40, 80], [52, 72], [76, 56]], label: "Trend line", tone: "muted" }],
    levels: [
      { y: 96, x1: 76, x2: 100, label: "Target: 3R", tone: "gain" },
      { y: 44, x1: 0, x2: 66, label: "Support: equal lows", tone: "muted", labelAt: "start" },
      { y: 36, x1: 62, x2: 100, label: "Stop: sweep low − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 60, y: 39, label: "Sweep", tone: "signal", below: true, anchor: "end" },
      { x: 76, y: 59, label: "Big green break = buy", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "The signal candle closed above (below) the 200 EMA.",
    "There were two swing lows (highs) within 0.25 × ATR, and price swept them.",
    "A candle closed back above (below) the level within 3 candles of the sweep.",
    "My trend line runs through the last two falling (rising) swing highs (lows) at or before the sweep.",
    "The break candle is green (red), its body is at least 1 ATR, and it closed beyond the line within 48 candles of the reclaim.",
    "My stop is 0.1 ATR beyond the sweep extreme, my target is 3R, and my size is set from the stop.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "1h", trades: 7, winRatePct: 42.9, profitFactor: 1.62, returnPct: 5.2, maxDrawdownPct: 7.6 },
      { symbol: "ETHUSDT", timeframe: "1h", trades: 10, winRatePct: 50.0, profitFactor: 3.47, returnPct: 22.6, maxDrawdownPct: 6.4 },
      { symbol: "XAUUSDT", timeframe: "1h", trades: 9, winRatePct: 55.6, profitFactor: 4.33, returnPct: 18.6, maxDrawdownPct: 3.8 },
      { symbol: "BTCUSDT", timeframe: "15m", trades: 38, winRatePct: 15.8, profitFactor: 0.52, returnPct: -15.1, maxDrawdownPct: 20.1 },
      { symbol: "NAS100", timeframe: "1h", trades: 4, winRatePct: 25.0, profitFactor: 0.6, returnPct: -2.0, maxDrawdownPct: 5.1 },
    ],
    verdict:
      "Six months is too few trades to judge on 1h (4 to 10 per market), and those happened to go well on crypto and gold and badly on NAS100. The long test says the opposite. On FundingPips' MT5 bars from 2020 to Nov 2026, at the platform's costs, NAS100 1h made 84 trades, won 46%, profit factor 2.57, +71R, profitable every year. Rebuilding the hourly candles to start at :15, :30 or :45 instead of :00 cut that to profit factor 1.20–1.46 (still profitable in both halves), so expect something nearer 1.3 than 2.6 live. SPX500 1h made profit factor 1.41 and USDJPY 1h 1.80. Gold 1h lost (0.87), as did silver, BTC, ETH and GBP/USD, and every 5m version lost, including the video's gold 5m. The video's '70% win rate' and 'one loss a month' never showed up: the best gold versions won 35–45%. The 15m BTC row above lost 15%. Trade it on NAS100 1h only, and expect long losing runs (up to 7 in a row in the test).",
  },
};
