import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/liquiditySweepStrategy.ts with its defaults:
// one chart (1h in the guide), swingLookback 3, ATR 14, equalTolAtr 0.1,
// stopBufferAtr 0.1, minRr 2, one trade per leg.
export const liquiditySweepGuide: StrategyGuide = {
  key: "liquidity-sweep",
  name: "Liquidity Sweep (Equal Highs/Lows)",
  tagline: "In a trend, let price run the stops under equal lows, then buy from demand back up the trend.",
  difficulty: "Intermediate",
  style: "Trend pullback into liquidity",
  timeframes: "One chart. 1h is the main setting; 15m and 4h also work",
  markets: "Liquid crypto (tested on BTCUSDT and ETHUSDT)",
  frequency: "About 1 trade every 2–3 weeks per market on 1h, about 1 a week on 15m",
  holdTime: "A day to a week on 1h",
  direction: "Long in an uptrend, short in a downtrend",

  summary: [
    "Markets move from one pool of orders to the next. When two lows line up at the same price (equal lows), many traders have bought above them and put their stop losses just below. Breakout traders also have sell orders waiting there. That pile of orders is liquidity.",
    "In an uptrend, price often dips just under equal lows to fill those orders and then keeps going up. A dip under them looks like the trend is breaking, but it's a sweep. This strategy waits for that sweep, lets price trade into the demand zone (the last candle before the big move up), and buys when a candle closes back above the zone. The stop goes under the low of the move, the target is the top of the move. Shorts are the mirror: equal highs, supply, sell.",
  ],

  terms: [
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the 3 candles on each side. You only know it's a swing once those 3 later candles have closed." },
    { term: "Uptrend / downtrend", meaning: "An uptrend makes higher highs and higher lows; a downtrend makes lower lows and lower highs. Sideways chop (consolidation) is neither." },
    { term: "Break of structure (BOS)", meaning: "A candle CLOSING above the top swing high of the current move (uptrend) or below the bottom swing low (downtrend). A wick through it doesn't count." },
    { term: "Impulse / correction", meaning: "The impulse is the strong move that breaks structure. The correction is the pullback after it." },
    { term: "Low of the move (protected low)", meaning: "The lowest point between the swing high that got broken and the candle that broke it. The uptrend only ends when a candle closes below it." },
    { term: "Demand zone", meaning: "The candle that made the low of the move: the last candle before the impulse. The zone runs from its low to its high. Big buyers stepped in here once and often do again." },
    { term: "Equal lows (liquidity)", meaning: "Two swing lows inside the current move, above the low of the move, within 0.1 × ATR of each other. Stop losses and sell stops collect just under them." },
    { term: "Sweep", meaning: "A candle's low dips under the lower of the equal lows. It takes out those orders, but in a healthy uptrend price doesn't stay down there." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle. Used to judge 'equal' and for a small stop buffer." },
    { term: "R", meaning: "Your risk on the trade. 2R means a profit twice the size of what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Open one chart", detail: "A 1-hour chart of the market. TradingView's free plan is enough." },
    { title: "Add ATR", detail: "Indicators → search “Average True Range” → length 14. You'll read its value to judge equal lows and set the stop buffer." },
    { title: "Have the horizontal-line and rectangle tools ready", detail: "You'll draw lines at the swing high, the equal lows, the stop and the target, and one rectangle for the demand zone." },
  ],

  long: [
    { title: "Find the uptrend", detail: "Mark swing highs and lows (3 candles each side). The trend turns up when a candle CLOSES above the latest swing high. It stays up until a candle closes below the low of the move." },
    { title: "Mark the low of the move and the demand zone", detail: "The low of the move is the lowest low between the broken swing high and the breakout candle. Draw a rectangle over the candle that made it, from its low to its high: the demand zone." },
    { title: "Mark the target", detail: "The highest high since the low of the move. Raise it whenever price makes a new high." },
    { title: "Find equal lows", detail: "Look for two swing lows after the broken swing high, above the low of the move, within 0.1 × ATR of each other (ATR 300 → within 30). Draw a line at the lower one. Swing lows that form later in the pullback count too." },
    { title: "Wait for the sweep", detail: "A candle's low must dip below that line. Until then, nothing to do." },
    { title: "Wait for price to reach the zone", detail: "After (or on) the sweep candle, a candle's low must reach the top of the demand zone or lower." },
    { title: "Wait for the close back above", detail: "A candle must CLOSE above the top of the demand zone. That's the signal. If a candle closes below the low of the move first, the trend is over: drop it." },
    { title: "Check it pays 2R", detail: "Price = the signal candle's close. Stop = low of the move − 0.1 × ATR. (target − price) ÷ (price − stop) must be at least 2. Under 2? Skip it, and this move is finished either way." },
  ],

  short: [
    { title: "Find the downtrend", detail: "A candle CLOSES below the latest swing low. It stays down until a candle closes above the high of the move: the highest high between that swing low and the breakdown candle." },
    { title: "Mark the supply zone and target", detail: "Supply zone: the candle that made the high of the move, from its low to its high. Target: the lowest low since then." },
    { title: "Find equal highs", detail: "Two swing highs below the high of the move, within 0.1 × ATR of each other. Line at the higher one." },
    { title: "Wait for the sweep and the zone", detail: "A candle's high goes above the equal-highs line, and a candle's high reaches the bottom of the supply zone." },
    { title: "Wait for the close back below", detail: "A candle CLOSES below the bottom of the supply zone. A close above the high of the move first ends the downtrend." },
    { title: "Check it pays 2R", detail: "(price − target) ÷ (stop − price) must be at least 2, with the stop at the high of the move + 0.1 × ATR." },
  ],

  entry: "Enter at the open of the candle right after the signal candle closes, with a market order. (The video uses a limit order in the zone. The backtest can only fill at the next open, so it waits for a close back out of the zone instead.)",
  stop: "Long: the low of the move minus 0.1 × ATR(14). Short: the high of the move plus 0.1 × ATR. Like the video, the stop clears the extreme rather than hugging the zone. Place it as a real stop order straight away.",
  target: "The top of the move (long) or the bottom (short): the next pool of liquidity in the trend's direction. No cap.",

  manage: [
    { title: "Set and forget", detail: "Place the stop and target as orders right after entry. The strategy never moves either." },
    { title: "One trade per move", detail: "After a signal (taken or skipped), wait for the next break of structure, then redraw everything: new low of the move, new zone, new equal lows." },
    { title: "Size from the stop", detail: "Decide your risk first (1% of the account is a sensible start), then quantity = risk ÷ (entry − stop). The Position size page does this for you." },
  ],

  skip: [
    "No clear trend: price is chopping sideways with no break of structure.",
    "There are no equal lows (highs) in the move, so there's no liquidity to sweep.",
    "The equal lows haven't been swept yet.",
    "The trade pays under 2R.",
    "A candle closed beyond the low (high) of the move: the trend is over.",
    "This move already gave a signal.",
  ],

  mistakes: [
    "Treating every dip under a low as a trend change. Under equal lows in an uptrend it's usually a sweep; only a close below the low of the move ends the trend.",
    "Buying the equal lows before they're swept. That's where the stops get run.",
    "Calling two lows 'equal' when they're far apart. Within 0.1 × ATR, or it isn't the same level.",
    "Trading it in sideways chop with no trend.",
    "Tucking the stop just under the zone's body instead of under the low of the move.",
  ],

  example: {
    title: "A long on the 1h chart (round numbers)",
    steps: [
      "The last swing high is 104. Price chops sideways and makes two swing lows at 98.5, with a wick down to 95 between them. ATR is 3, so 0.1 × ATR = 0.3: the two lows are equal.",
      "A candle closes at 105.5, above 104: uptrend. The low of the move is 95. The candle that made it ran from 95 to 100: the demand zone.",
      "The move tops out at 113. That's the target.",
      "Price pulls back. A candle dips to 98, under the 98.5 equal lows (the sweep) and into the zone (below 100). It closes at 98.8, still inside.",
      "The next candle closes at 100.6, above 100. Signal.",
      "Stop: 95 − 0.3 = 94.7. Risk ≈ 5.9. Reward to 113 ≈ 12.4 → 2.1R. Above 2, so take it.",
      "Risking $100: quantity = 100 ÷ 5.9 ≈ 17 units. Buy at the next open, stop 94.7, target 113, walk away.",
    ],
  },

  diagram: {
    caption: "A long setup. Shorts are the same picture upside down: equal highs, supply, sell.",
    price: [[0, 50], [8, 70], [14, 52], [19, 40], [23, 47], [27, 22], [30, 46], [34, 40], [38, 47], [44, 72], [50, 88], [56, 70], [61, 60], [66, 30], [70, 38], [80, 60], [92, 80], [98, 88]],
    zones: [{ x1: 25, x2: 100, y1: 22, y2: 34, label: "Demand zone", tone: "signal", labelAt: "end" }],
    levels: [
      { y: 70, x1: 10, x2: 46, label: "Swing high", tone: "muted", labelAt: "start" },
      { y: 40, x1: 15, x2: 60, label: "Equal lows (liquidity)", tone: "muted" },
      { y: 88, x1: 46, x2: 100, label: "Target: top of the move", tone: "gain" },
      { y: 17, x1: 55, x2: 100, label: "Stop: low of the move − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 27, y: 22, label: "Low of the move", tone: "muted", below: true },
      { x: 44, y: 72, label: "Break of structure", tone: "signal", anchor: "end" },
      { x: 66, y: 30, label: "Sweep", tone: "signal", below: true },
      { x: 70, y: 38, label: "Buy signal", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "The trend is clear: a candle CLOSED beyond the last swing, and nothing has closed beyond the low (high) of the move since.",
    "I found two swing lows (highs) within 0.1 × ATR inside this move.",
    "Price swept them and reached the demand (supply) zone.",
    "A candle closed back out of the zone in the trend's direction.",
    "My stop is beyond the low (high) of the move with the 0.1 ATR buffer, and my size is set from it.",
    "The target is at least 2R away, and this move hasn't given a signal yet.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "1h", trades: 9, winRatePct: 11.1, profitFactor: 0.48, returnPct: -4.0, maxDrawdownPct: 5.2 },
      { symbol: "ETHUSDT", timeframe: "1h", trades: 7, winRatePct: 85.7, profitFactor: 27.46, returnPct: 35.8, maxDrawdownPct: 4.2 },
      { symbol: "BTCUSDT", timeframe: "15m", trades: 29, winRatePct: 17.2, profitFactor: 0.5, returnPct: -6.9, maxDrawdownPct: 8.5 },
      { symbol: "ETHUSDT", timeframe: "15m", trades: 27, winRatePct: 37.0, profitFactor: 4.56, returnPct: 43.4, maxDrawdownPct: 4.6 },
    ],
    verdict:
      "Mixed, and the samples are small. It made a lot on ETH and lost on BTC on both timeframes. On 1h it also made money on SOLUSDT (+1.3%) and XRPUSDT (+6.9%). On 15m XRP lost (−7.6%) and SOL made a little (+3.9%). On 4h there were only 1–4 trades per coin. The ETH and BTC pattern held under every setting change tried (a looser or tighter 'equal', a 3R minimum, bigger or smaller swings), so the result isn't one lucky setting. But 7–9 trades per coin on 1h is far too few to trust: ETH's 6 wins in 7 could easily be luck. Paper-trade it and keep a journal before risking money.",
  },
};
