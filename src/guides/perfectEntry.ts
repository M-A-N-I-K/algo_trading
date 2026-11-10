import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/perfectEntryStrategy.ts with its registry defaults:
// 4h context, 1h confirmation and entries, htfSwingLookback 3,
// ltfSwingLookback 3, obSearchBars 10, stopBufferAtr 0.1 (ATR 14), minRr 3,
// maxSetupBars 72.
export const perfectEntryGuide: StrategyGuide = {
  key: "perfect-entry",
  name: "Perfect Entry (Context + Confirmation)",
  tagline: "Know where you want to trade before you trade: right place, then proof, then a 3R-or-nothing entry.",
  difficulty: "Intermediate",
  style: "Trend pullback with confirmation",
  timeframes: "4h chart for the context (trend, points of interest, target), 1h chart for the confirmation and the entry",
  markets: "Liquid crypto (tested on BTCUSDT and ETHUSDT, plus NAS100)",
  frequency: "About 1 trade every 1–2 weeks per market",
  holdTime: "A day to a week",
  direction: "Long in a 4h uptrend, short in a 4h downtrend",

  summary: [
    "A good entry has three parts, in this order. Context: is price at a place where a reversal makes sense, in the direction of the bigger trend? Confirmation: has the smaller chart actually turned? Execution: where exactly are the entry, stop and target, and does the trade pay at least 3 times what it risks?",
    "On the 4h chart you find the trend and two kinds of points of interest: internal lows (small lows inside the up-move, where stop losses pile up) and the demand zone at the start of the move. When price reaches one, you drop to the 1h chart and wait for the short-term trend to flip back up. Then you buy the pullback into the 1h zone that caused the flip, stop under the low, target the top of the 4h move. Shorts are the mirror.",
    "Tight stops and big reward are not the goal; they're what you get when the first two steps are done properly. If the numbers don't reach 3R, you skip the trade instead of squeezing the stop.",
  ],

  terms: [
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the 3 candles on each side of it. You only know it's a swing once those 3 later candles have closed." },
    { term: "Break of structure", meaning: "A candle CLOSING beyond a swing. A wick through it doesn't count." },
    { term: "Impulse high", meaning: "The highest swing high of the current up-move. A 4h close above it continues the uptrend. A swing high that only matches it, or stays below it, is part of the same move." },
    { term: "Protected low", meaning: "The lowest point between the impulse high that got broken and the candle that broke it. The uptrend is only over when a 4h candle closes below it." },
    { term: "Internal low", meaning: "A 4h swing low that formed after the protected low and sits above it. Buyers' stop losses and sell orders gather under it. Price often dips through it to grab those orders, then carries on up. Breaking it does NOT end the uptrend." },
    { term: "Demand zone", meaning: "The last red candle (close below open) at the protected low, or up to 10 candles before it. The top of its body is the level to watch." },
    { term: "Point of interest", meaning: "A place where a reversal makes sense: an internal low or the demand zone. No point of interest, no trade." },
    { term: "Sweep low", meaning: "The lowest price reached after price hits the point of interest. Your stop goes under it." },
    { term: "Confirmation (shift)", meaning: "A 1h candle closing above the most recent 1h swing high. The 1h was making lower lows and lower highs; now it has broken up." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle. Used for a small buffer under the stop." },
    { term: "R", meaning: "Your risk on the trade. 3R means the target pays three times what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Open two charts of the same market", detail: "A 4-hour chart for the context and a 1-hour chart for the confirmation and entry. TradingView's free plan is enough." },
    { title: "Add ATR to the 1-hour chart", detail: "Indicators → search “Average True Range” → length 14. You only need its value when you place the stop." },
    { title: "Have the horizontal-line and rectangle tools ready", detail: "On the 4h you'll mark the protected low, internal lows, the demand level and the target. On the 1h you'll draw one rectangle (the entry zone)." },
  ],

  long: [
    { title: "Context 1: find the 4h trend", detail: "Mark 4h swing highs and lows (3 candles each side). The trend turns up when a 4h candle closes above a swing high. It stays up through every pullback until a 4h candle closes below the protected low." },
    { title: "Context 2: mark the protected low and the target", detail: "The protected low is the lowest low between the broken swing high and the breakout candle. The target is the highest high since the protected low. Raise it whenever price makes a new high." },
    { title: "Context 3: mark the points of interest", detail: "Every 4h swing low that forms above the protected low is an internal low: draw a line at it. Then find the last red 4h candle at the protected low (or up to 10 candles before it) and draw a line at the top of its body: the demand level." },
    { title: "Context 4: wait for price to reach one", detail: "Switch to 1h. A point of interest is hit when a 1h candle's low reaches an internal low line or the demand line. Each line counts once; once touched, erase it." },
    { title: "Confirmation 1: track the sweep low", detail: "From that candle on, note the lowest low price makes. That's the sweep low. It keeps moving down while price keeps falling." },
    { title: "Confirmation 2: wait for the 1h shift", detail: "Mark the most recent 1h swing high (3 candles each side). You need a 1h candle to CLOSE above it. Until that happens there is no trade, however good the zone looks." },
    { title: "Confirmation 3: draw the 1h zone", detail: "From the sweep-low candle walk left, up to 10 candles, to the first red 1h candle. Zone: from the sweep low up to that candle's open. No red candle within 10? Drop the setup." },
    { title: "Execution 1: wait for the pullback", detail: "A 1h candle's low must dip to the top of the zone or below. Then a 1h candle must CLOSE back above the zone's top. That's the signal. If a candle closes below the sweep low first, the confirmation failed: drop the setup." },
    { title: "Execution 2: check it pays 3R", detail: "Price = the signal candle's close. Stop = sweep low − 0.1 × ATR. (target − price) ÷ (price − stop) must be at least 3. Under 3? Skip it. Don't move the stop closer to make it fit." },
  ],

  short: [
    { title: "Context: a 4h downtrend", detail: "A 4h candle closed below a swing low. The protected high is the highest high between that swing low and the breakdown candle. The trend stays down until a 4h close above the protected high. Target: the lowest low since the protected high." },
    { title: "Points of interest", detail: "Internal highs: 4h swing highs that form after the protected high and sit below it. Supply level: the last green 4h candle at the protected high (or up to 10 before it), at the bottom of its body." },
    { title: "Wait for a 1h high to reach one", detail: "From then on track the highest high: the sweep high." },
    { title: "Wait for the 1h shift down", detail: "A 1h candle CLOSES below the most recent 1h swing low." },
    { title: "Draw the 1h zone", detail: "From the sweep-high candle walk left up to 10 candles to the first green 1h candle. Zone: from that candle's open up to the sweep high." },
    { title: "Wait for the rally into the zone and a close back below it", detail: "A 1h high reaches the zone's bottom, then a 1h candle closes below the zone's bottom. A close above the sweep high first kills the setup. (price − target) ÷ (stop − price) must be at least 3." },
  ],

  entry: "Enter at the open of the 1h candle right after the signal candle closes, with a market order. (In the video the trader leaves a limit order in the zone. The backtest waits for a candle to close back out of the zone instead, which is easier to follow by hand.)",
  stop: "Long: the sweep low minus 0.1 × the 1h ATR(14). Short: the sweep high plus 0.1 × ATR. It sits where the trade is proven wrong: a new low means the 1h shift failed. Place it as a real stop order straight away.",
  target: "The top of the 4h move (the highest high since the protected low) for longs, the bottom of the move for shorts. No cap: if the trade passes the 3R test, the target stays at the 4h extreme.",

  manage: [
    { title: "Set and forget", detail: "Place the stop and target as orders right after entry. The strategy never moves either; it only exits at one of them." },
    { title: "One setup at a time", detail: "While you're waiting on one setup, other points of interest that get touched are used up. Don't stack a second idea on top." },
    { title: "Size from the stop", detail: "Decide your risk first (1% of the account is a sensible start), then quantity = risk ÷ (entry − stop). The Position size page does this for you." },
  ],

  skip: [
    "Price isn't at a point of interest. A perfect-looking 1h shift in the middle of nowhere is not a trade.",
    "The 1h never closed above its swing high.",
    "The trade pays less than 3R.",
    "More than 3 days (72 1h candles) passed since the point of interest was hit without an entry.",
    "Price already reached the target before your entry.",
    "The 4h trend flipped: a 4h candle closed beyond the protected level.",
  ],

  mistakes: [
    "Starting with the risk-reward instead of the context: hunting for tiny stops and huge targets, then inventing a reason to take the trade.",
    "Thinking a break of an internal low ends the uptrend. Only a close below the protected low does.",
    "Leaving buy limits on every zone without confirmation. If price keeps falling you lose twice.",
    "Pulling the stop in to turn a 2R trade into 3R. The stop then sits where normal noise hits it.",
    "Counting a wick above the 1h swing high as the shift. Only a CLOSE counts.",
  ],

  example: {
    title: "A long on the 4h/1h charts (round numbers)",
    steps: [
      "4h: price breaks above the swing high at 105 with a close at 106. The protected low is 94. The move tops at 113 (the target), dipping to 104 on the way: that 4h swing low is an internal low.",
      "1h: price pulls back and a candle dips to 103, under the 104 internal low. Point of interest hit. Sweep low: 103.",
      "The last 1h swing high was 108.7. A 1h candle closes at 109.2: the shift is confirmed.",
      "The last red 1h candle at the sweep low opened at 104.5. Zone: 103 to 104.5.",
      "Price pulls back to 104.3 and that candle closes at 104.8, back above 104.5. Signal.",
      "Stop: 103 − 0.1 × ATR (say ATR is 1 → 102.9). Risk ≈ 1.9. Reward to 113 ≈ 8.2 → 4.3R. Above 3, so take it.",
      "Risking $100: quantity = 100 ÷ 1.9 ≈ 52 units. Buy at the next 1h open, stop 102.9, target 113, walk away.",
    ],
  },

  diagram: {
    caption: "A long setup: the 4h context on the left, the 1h confirmation and entry on the right. Shorts are the same picture upside down.",
    price: [[0, 42], [8, 14], [16, 40], [22, 32], [30, 66], [35, 58], [42, 86], [47, 62], [51, 52], [55, 58], [61, 26], [65, 38], [69, 64], [74, 33], [79, 46], [90, 72], [98, 86]],
    zones: [{ x1: 59, x2: 100, y1: 26, y2: 35, label: "1h zone", tone: "signal", labelAt: "end" }],
    levels: [
      { y: 86, x1: 38, x2: 100, label: "Target: top of the 4h move", tone: "gain" },
      { y: 32, x1: 22, x2: 56, label: "4h internal low", tone: "muted" },
      { y: 58, x1: 55, x2: 74, label: "", tone: "muted" },
      { y: 16, x1: 59, x2: 100, label: "Stop: sweep low − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 8, y: 14, label: "4h protected low", tone: "muted", below: true },
      { x: 61, y: 26, label: "Sweep", tone: "signal", below: true, anchor: "end" },
      { x: 55, y: 58, label: "1h swing high", tone: "muted" },
      { x: 69, y: 64, label: "Confirmation close", tone: "signal", anchor: "end" },
      { x: 74, y: 33, label: "Buy signal", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "The 4h trend is in my direction: no 4h close beyond the protected level.",
    "Price reached a point of interest: an internal low or the demand level.",
    "A 1h candle CLOSED beyond the latest 1h swing in my direction.",
    "My zone is the last opposite-colour 1h candle at the sweep low, and price closed back out of it.",
    "My stop is beyond the sweep low with the 0.1 ATR buffer, and my size is set from it.",
    "The target (top or bottom of the 4h move) is at least 3R away.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "4h / 1h", trades: 16, winRatePct: 6.3, profitFactor: 0.3, returnPct: -11.6, maxDrawdownPct: 12.0 },
      { symbol: "ETHUSDT", timeframe: "4h / 1h", trades: 5, winRatePct: 20.0, profitFactor: 1.07, returnPct: 0.3, maxDrawdownPct: 4.5 },
      { symbol: "NAS100", timeframe: "4h / 1h", trades: 4, winRatePct: 25.0, profitFactor: 2.73, returnPct: 2.2, maxDrawdownPct: 0.7 },
    ],
    verdict:
      "Lost money on BTC and was flat on ETH (only 5 trades). It also lost on SOLUSDT (−7.0%, 8 trades) and XRPUSDT (−14.8%, 9 trades). Across the four coins 3 of 38 trades won. Each winner paid 4–4.5R, but with a 3R minimum you need roughly 1 win in 4 just to break even, and it managed about 1 in 13. Changing the settings (a 2R minimum, bigger or smaller swings) lost money too, so it isn't one unlucky setting. The video's trader also picks which point of interest matters and reads the daily chart, and code can't copy that judgement. Treat this as a way to think about entries, not a proven edge, and paper-trade it first. NAS100 made +2.2% in the 6 months from 1 winner in 4 trades: too few to count.",
  },
};
