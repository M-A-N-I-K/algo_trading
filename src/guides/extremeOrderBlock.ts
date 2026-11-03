import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/extremeOrderBlockStrategy.ts with its registry
// defaults: 1h structure and zones, 15m entries, swingLookback 5,
// obSearchBars 10, stopBufferAtr 0.1 (ATR 14), minRr 2, maxRr 5.
export const extremeOrderBlockGuide: StrategyGuide = {
  key: "extreme-order-block",
  name: "Extreme Order Block (Trend Pullback)",
  tagline: "Wait for the trend to prove itself, then buy the first pullback to where the move started.",
  difficulty: "Intermediate",
  style: "Trend pullback",
  timeframes: "1h chart to read the trend and draw the zone, 15m chart to time the entry",
  markets: "Liquid crypto and gold (tested on BTCUSDT and ETHUSDT)",
  frequency: "About 1–2 trades a week per market",
  holdTime: "Hours to a few days",
  direction: "Long in an uptrend, short in a downtrend",

  summary: [
    "When price breaks above its last swing high, the market has shown it wants to go up. The move that did the breaking started from a low point, the protected low. The last red candle sitting at that low is the extreme order block: the place big buyers stepped in.",
    "This strategy waits for price to come back to that block for the first time, and only buys once a candle closes back above it. The stop goes just under the block, and the target is the top of the move. Shorts are the exact mirror in a downtrend.",
  ],

  terms: [
    { term: "Swing high", meaning: "A candle whose high is higher than the 5 candles before it and the 5 after it. You only know it's a swing high once those 5 later candles have closed." },
    { term: "Swing low", meaning: "The same, upside down: a low lower than the 5 candles on each side." },
    { term: "Break of structure (BOS)", meaning: "A candle CLOSING above the latest swing high (uptrend) or below the latest swing low (downtrend). A wick poking through doesn't count." },
    { term: "Protected low", meaning: "The lowest point between the swing high that got broken and the candle that broke it. It's where the winning move started." },
    { term: "Extreme order block", meaning: "The last red candle at (or up to 10 candles before) the protected low. Its zone runs from the lowest low of those candles up to the top of the red candle's body." },
    { term: "Decisional order block", meaning: "The last red candle just before the breakout. This strategy ignores it on purpose; it's the trap most people buy." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle. Used here for a small buffer under the stop." },
    { term: "R", meaning: "Your risk on the trade. 2R means a profit twice the size of what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Open two charts of the same market", detail: "A 1-hour chart (to read the trend and draw the zone) and a 15-minute chart (to time the entry). TradingView's free plan is enough." },
    { title: "Add ATR to the 15-minute chart", detail: "Indicators → search “Average True Range” → length 14. You only need its current value when you place the stop." },
    { title: "Have the rectangle and horizontal-line tools ready", detail: "You'll draw one rectangle (the zone) and two lines (stop and target) on the 1-hour chart." },
  ],

  long: [
    { title: "Mark the swing highs and lows on the 1h chart", detail: "Find candles whose high (or low) beats the 5 candles on each side. Label them. Ignore the last 5 candles: their swings aren't confirmed yet." },
    { title: "Wait for a bullish break of structure", detail: "A 1h candle must CLOSE above the most recent swing high that hasn't been broken yet. Now the trend is up. If instead a candle closes below the latest swing low, the trend is down and you look for shorts." },
    { title: "Find the protected low", detail: "Look at the candles between that broken swing high and the breakout candle. The lowest low among them is the protected low." },
    { title: "Find the extreme order block", detail: "Start at the protected-low candle and walk left, up to 10 candles, until you hit a red candle (close below open). That's the block. No red candle within 10? No trade on this leg." },
    { title: "Draw the zone", detail: "Rectangle from the lowest low of the block candle through the protected low, up to the block candle's open (the top of its red body)." },
    { title: "Mark the target", detail: "The highest high of the move since the protected low. Keep raising it if price makes new highs before it pulls back." },
    { title: "Wait for the first pullback into the zone", detail: "Switch to 15m. You need a candle whose low dips to the top of the zone or lower. Be patient; this can take hours or days." },
    { title: "Wait for the rejection close", detail: "A 15m candle must CLOSE back above the top of the zone. That's your signal. If a candle closes BELOW the bottom of the zone first, the zone is dead: delete it and wait for the next break of structure." },
    { title: "Check the reward is worth it", detail: "Using the signal candle's close as your price: (target − price) ÷ (price − stop) must be at least 2. Under 2? Skip; this zone is used up either way." },
  ],

  short: [
    { title: "Wait for a bearish break of structure", detail: "A 1h candle CLOSES below the most recent unbroken swing low. The trend is now down." },
    { title: "Find the protected high", detail: "The highest high between that broken swing low and the breakdown candle." },
    { title: "Find the extreme bearish order block", detail: "From the protected-high candle walk left up to 10 candles to the first green candle (close above open). Zone: from that candle's open (bottom of its body) up to the highest high of those candles." },
    { title: "Mark the target", detail: "The lowest low of the move since the protected high, lowered as price makes new lows." },
    { title: "Wait for the first rally into the zone, then a close back below it", detail: "On 15m, a candle's high reaches the bottom of the zone, then a 15m candle CLOSES back below the zone's bottom. A close above the zone's top first kills the zone." },
    { title: "Check the reward", detail: "(price − target) ÷ (stop − price) must be at least 2, or skip." },
  ],

  entry: "Enter at the open of the 15m candle right after the signal candle closes. Use a market order the moment the new candle opens.",
  stop: "Long: the bottom of the zone minus 0.1 × the 15m ATR(14). Short: the top of the zone plus 0.1 × ATR. Place it as a real stop order immediately.",
  target: "The top of the move (long) or the bottom (short). If that's more than 5R away, put the target at exactly 5R instead.",

  manage: [
    { title: "Set and forget", detail: "Place the stop and the target as orders right after entry. The strategy never moves either; it only exits at one of them." },
    { title: "One trade per zone", detail: "Once a zone has given a signal (taken or skipped), it's finished. Don't re-enter on a second pullback." },
    { title: "Size from the stop", detail: "Decide your risk first (1% of the account is a sensible start), then quantity = risk ÷ (entry − stop). The Position size page does this for you." },
  ],

  skip: [
    "A candle closed beyond the far edge of the zone before your signal.",
    "The trend flipped: a 1h candle closed beyond the swing on the other side.",
    "The reward to the target is under 2R.",
    "The zone already gave a signal once.",
    "A new break of structure happened before the pullback. Redraw: the zone moves to the new leg's origin.",
  ],

  mistakes: [
    "Using the order block just before the breakout (the decisional one) instead of the one at the protected low.",
    "Calling a wick through the swing high a break of structure. Only a CLOSE counts.",
    "Entering the moment price touches the zone instead of waiting for a candle to close back out of it.",
    "Taking a second or third pullback to the same zone.",
    "Widening the stop when price gets close to it.",
  ],

  example: {
    title: "A long on the 1h/15m charts (round numbers)",
    steps: [
      "The latest 1h swing high is 105. Price drops to 95 (the protected low), then a 1h candle closes at 105.5: bullish break of structure.",
      "The last red 1h candle at the low opened at 99.5. Zone: 95 to 99.5.",
      "The move tops out at 112. That's the target.",
      "Price pulls back. A 15m candle dips to 98 and closes inside the zone; the next closes at 100.4, back above 99.5. Signal.",
      "Stop: 95 − 0.1 × ATR (say ATR is 1 → 94.9). Risk ≈ 5.5. Reward to 112 ≈ 11.6 → 2.1R. Above 2, so take it.",
      "Risking $100: quantity = 100 ÷ 5.5 ≈ 18 units. Buy at the next 15m open, stop 94.9, target 112, walk away.",
    ],
  },

  diagram: {
    caption: "A long setup. Shorts are the same picture upside down.",
    price: [[0, 45], [8, 55], [15, 70], [22, 55], [28, 40], [33, 26], [36, 20], [41, 36], [45, 52], [50, 73], [56, 88], [61, 76], [67, 56], [73, 36], [77, 26], [81, 33], [87, 52], [93, 72], [98, 87]],
    zones: [{ x1: 31, x2: 100, y1: 19, y2: 30, label: "Extreme order block (the zone)", tone: "signal" }],
    levels: [
      { y: 70, x1: 4, x2: 60, label: "Swing high: a close above = uptrend", tone: "muted", labelAt: "start" },
      { y: 88, x1: 52, x2: 100, label: "Target: the move's high", tone: "gain" },
      { y: 15, x1: 70, x2: 100, label: "Stop: zone − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 36, y: 20, label: "Protected low", tone: "muted", below: true },
      { x: 50, y: 73, label: "Break of structure", tone: "signal", anchor: "end" },
      { x: 45, y: 52, label: "Decisional block: not this one", tone: "muted", anchor: "end" },
      { x: 81, y: 33, label: "Close back above zone → buy next open", tone: "gain" },
    ],
  },

  checklist: [
    "A 1h candle CLOSED beyond the last swing (not just a wick).",
    "My zone is the block at the protected low, not the one just before the breakout.",
    "This is the first return to the zone, and no candle has closed through its far edge.",
    "A 15m candle closed back out of the zone in the trend's direction.",
    "The target is at least 2R away (capped at 5R).",
    "My stop is under the zone with the 0.1 ATR buffer, and my size is set from it.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "1h / 15m", trades: 41, winRatePct: 31.7, profitFactor: 0.89, returnPct: -1.9, maxDrawdownPct: 5.6 },
      { symbol: "ETHUSDT", timeframe: "1h / 15m", trades: 35, winRatePct: 17.1, profitFactor: 0.55, returnPct: -10.4, maxDrawdownPct: 14.7 },
    ],
    verdict:
      "Lost money on both coins in this period. Fees took about 0.2R per trade because stops are tight; before fees BTC was roughly break-even and ETH clearly negative. 35–41 trades is a small sample. Paper-trade it before risking money.",
  },
};
