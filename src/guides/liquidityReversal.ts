import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/liquidityReversalStrategy.ts with its defaults:
// one chart (1h in the guide), swingLookback 3, ATR 14, equal lows within
// 0.1 ATR and at most 100 bars apart, demand searched 10 bars back from the
// sweep low, stopBufferAtr 0.1, minRr 2, targets up to 200 bars back,
// setups dropped after 48 bars without progress.
export const liquidityReversalGuide: StrategyGuide = {
  key: "liquidity-reversal",
  name: "Liquidity Reversal (Sweep + Shift)",
  tagline: "Wait for price to run the stops under equal lows, see the trend turn, then buy the retest of demand.",
  difficulty: "Intermediate",
  style: "Reversal after a liquidity sweep",
  timeframes: "One chart. 1h is the main setting; 15m also works",
  markets: "Liquid crypto (tested on BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT)",
  frequency: "About 2 trades a month per market on 1h, about 2 a week on 15m",
  holdTime: "Hours to a few days on 1h",
  direction: "Both: long after equal lows are swept, short after equal highs are swept",

  summary: [
    "When two lows line up at the same price (equal lows), lots of traders treat it as support: buyers put their stop losses just under it, and breakout sellers park sell orders there. That pile of orders is liquidity. Price is often pulled down to grab it.",
    "This strategy waits for that grab (the sweep), then waits for proof that the market has turned: a candle closing above the last swing high. Only then does it buy, on the pullback into the demand zone where the turn started. The stop goes under the sweep low and the target is the next untouched swing high above, where the next pile of orders sits. Shorts are the mirror: equal highs, sweep, close below the last swing low, sell from supply.",
  ],

  terms: [
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the 3 candles on each side. You only know it's a swing once those 3 later candles have closed." },
    { term: "Liquidity", meaning: "A cluster of waiting orders: stop losses and breakout orders. They collect just beyond obvious highs and lows." },
    { term: "Equal lows / equal highs", meaning: "Two swing lows (highs) within 0.1 × ATR of each other, at most 100 candles apart, with nothing in between trading below (above) them. This is the liquidity the strategy watches." },
    { term: "Sweep", meaning: "A candle's low dips below the equal lows (or high above the equal highs). The orders there get filled. It's the trigger to start watching, not a reason to trade yet." },
    { term: "Sweep low", meaning: "The lowest low reached after the sweep. It keeps moving down while price keeps falling." },
    { term: "Shift (change of structure)", meaning: "A candle CLOSING above the last swing high that formed before the sweep low. A wick through it doesn't count. It means sellers have lost control." },
    { term: "Demand zone", meaning: "The last red (down) candle at or just before the sweep low, from its open down to the sweep low. It's where buyers took over. Supply is the mirror: the last green candle before the sweep high, from its open up to the high." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle (14-candle average). Used to judge 'equal' and to add a small buffer to the stop." },
    { term: "R", meaning: "Your risk on the trade. 2R means a profit twice the size of what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Open one chart", detail: "A 1-hour chart of the market. TradingView's free plan is enough." },
    { title: "Add ATR", detail: "Indicators → search “Average True Range” → length 14. You'll read its value to judge equal lows and to set the stop buffer." },
    { title: "Have the horizontal-line and rectangle tools ready", detail: "You'll draw lines at the equal lows, the last swing high, the stop and the target, and one rectangle for the demand zone." },
  ],

  long: [
    { title: "Mark swing highs and lows", detail: "A swing low has 3 higher lows on each side; a swing high has 3 lower highs on each side." },
    { title: "Find equal lows", detail: "Two swing lows within 0.1 × ATR of each other (ATR 300 → within 30), no more than 100 candles apart, with no candle between them dipping below the lower one. Draw a line at the lower one." },
    { title: "Wait for the sweep", detail: "A candle's low goes below that line. Now track the sweep low: the lowest low from here on." },
    { title: "Mark the last swing high", detail: "The most recent swing high that formed before the sweep low. This is the level that has to break." },
    { title: "Wait for the shift", detail: "A candle CLOSES above that swing high. If it hasn't happened within 48 candles of the last sweep, forget the setup." },
    { title: "Draw the demand zone", detail: "Look back from the sweep low candle (it counts too) up to 10 candles for the most recent red candle. The zone runs from that candle's open down to the sweep low. No red candle? Use the high of the sweep low candle as the top." },
    { title: "Wait for the retest", detail: "A candle's low must come back down into the zone (to its top or lower). Then wait for a candle to CLOSE back above the top of the zone. That's the signal. If a candle closes below the sweep low, or 48 candles pass after the shift, drop it." },
    { title: "Pick the target and check it pays 2R", detail: "Price = the signal candle's close. Stop = sweep low − 0.1 × ATR. Look at swing highs above from the last 200 candles that price hasn't traded above since they formed. Take the lowest one that is at least 2 × (price − stop) above the price. None? Skip the trade." },
  ],

  short: [
    { title: "Find equal highs", detail: "Two swing highs within 0.1 × ATR, up to 100 candles apart, with nothing between them trading above the higher one. Line at the higher one." },
    { title: "Wait for the sweep", detail: "A candle's high goes above the line. Track the sweep high: the highest high from here on." },
    { title: "Wait for the shift", detail: "A candle CLOSES below the most recent swing low that formed before the sweep high, within 48 candles." },
    { title: "Draw the supply zone", detail: "The most recent green candle at or up to 10 candles before the sweep high candle: zone from its open up to the sweep high." },
    { title: "Wait for the retest", detail: "A candle's high reaches the bottom of the zone, then a candle CLOSES back below it. A close above the sweep high first kills the setup." },
    { title: "Pick the target and check it pays 2R", detail: "Stop = sweep high + 0.1 × ATR. Target = the highest untouched swing low below that is at least 2R away. None? Skip it." },
  ],

  entry: "Enter at the open of the candle right after the signal candle closes, with a market order. (The video places a limit order on the zone. The backtest can only fill at the next open, so it waits for a close back out of the zone instead.)",
  stop: "Long: the sweep low minus 0.1 × ATR(14). Short: the sweep high plus 0.1 × ATR. The stop goes beyond the whole sweep, not just the zone, to give price room to wick. Place it as a real stop order straight away.",
  target: "The next liquidity on the other side: the nearest swing high (long) or swing low (short) that price hasn't traded through yet and that is at least 2R away. If there isn't one, there's no trade.",

  manage: [
    { title: "Set and forget", detail: "Place the stop and target as orders right after entry. The strategy never moves either." },
    { title: "One trade per sweep", detail: "After a signal (taken or skipped), the setup is finished. Wait for a new sweep of new equal lows or highs." },
    { title: "Size from the stop", detail: "Decide your risk first (1% of the account is a sensible start), then quantity = risk ÷ (entry − stop). The Position size page does this for you." },
  ],

  skip: [
    "There are no equal lows or highs nearby: no liquidity, no setup.",
    "Price swept the lows but never closed above the last swing high.",
    "Price never came back into the demand (supply) zone after the shift.",
    "A candle closed beyond the sweep low (high): the turn failed.",
    "There's no untouched swing on the other side at least 2R away.",
    "The setup has been waiting more than 48 candles.",
  ],

  mistakes: [
    "Buying the moment the lows are swept. Without the shift, a sweep is often just the start of a bigger drop.",
    "Counting a wick above the swing high as the shift. It has to be a close.",
    "Calling two lows 'equal' when they're far apart. Within 0.1 × ATR, or it isn't the same level.",
    "Putting the stop just under the zone's body instead of under the sweep low.",
    "Aiming at a swing high price has already traded through. Those orders are gone; pick one that's still untouched.",
  ],

  example: {
    title: "A long on the 1h chart (round numbers)",
    steps: [
      "The last big swing high above is 110. Below, price makes two swing lows at 98 and 98: equal lows. Between them the lowest low is 99, so they're clean. In between, price makes a swing high at 102.",
      "A red candle opens at 99 and dips to 96: the sweep. The sweep low is 96 and the demand zone runs 96–99.",
      "Two candles later one closes at 102.5, above the 102 swing high: the shift.",
      "Price pulls back. A candle dips to 98.8, inside the zone, and closes at 99.5, back above 99. Signal.",
      "ATR is 2, so the stop is 96 − 0.2 = 95.8. Risk = 99.5 − 95.8 = 3.7, so 2R needs a target at 106.9 or higher.",
      "The swing high at 104 is too close (1.2R). The 110 high hasn't been traded through: target 110, about 2.8R.",
      "Risking $100: quantity = 100 ÷ 3.7 ≈ 27 units. Buy at the next open, stop 95.8, target 110, walk away.",
    ],
  },

  diagram: {
    caption: "A long setup. Shorts are the same picture upside down: equal highs, sweep, close below, sell from supply.",
    price: [[0, 70], [8, 88], [16, 60], [24, 40], [30, 52], [38, 40], [46, 56], [54, 24], [62, 64], [70, 34], [82, 62], [94, 88]],
    zones: [{ x1: 50, x2: 100, y1: 24, y2: 37, label: "Demand zone", tone: "signal", labelAt: "end" }],
    levels: [
      { y: 88, x1: 8, x2: 100, label: "Target: untouched swing high", tone: "gain" },
      { y: 40, x1: 0, x2: 48, label: "Equal lows", tone: "muted", labelAt: "start" },
      { y: 56, x1: 30, x2: 76, label: "Last swing high", tone: "muted", labelAt: "start" },
      { y: 18, x1: 56, x2: 100, label: "Stop: sweep low − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 54, y: 24, label: "Sweep", tone: "signal", below: true, anchor: "end" },
      { x: 62, y: 64, label: "Close above = shift", tone: "signal", anchor: "end" },
      { x: 70, y: 34, label: "Buy signal", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "I found two swing lows (highs) within 0.1 × ATR, and price swept them.",
    "A candle CLOSED above the last swing high (below the last swing low) after the sweep.",
    "Price came back into the demand (supply) zone and a candle closed back out of it.",
    "Nothing has closed beyond the sweep low (high), and the setup is under 48 candles old.",
    "My stop is beyond the sweep with the 0.1 ATR buffer, and my size is set from it.",
    "My target is an untouched swing on the other side, at least 2R away.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "1h", trades: 12, winRatePct: 50.0, profitFactor: 1.65, returnPct: 6.4, maxDrawdownPct: 6.3 },
      { symbol: "ETHUSDT", timeframe: "1h", trades: 10, winRatePct: 30.0, profitFactor: 0.99, returnPct: -0.1, maxDrawdownPct: 7.5 },
      { symbol: "BTCUSDT", timeframe: "15m", trades: 51, winRatePct: 37.3, profitFactor: 1.24, returnPct: 4.8, maxDrawdownPct: 9.8 },
      { symbol: "ETHUSDT", timeframe: "15m", trades: 44, winRatePct: 34.1, profitFactor: 0.93, returnPct: -1.6, maxDrawdownPct: 9.7 },
    ],
    verdict:
      "Roughly breakeven: no clear edge either way. BTC made a little on both timeframes and ETH lost a little. On 1h SOLUSDT (−1.2%) and XRPUSDT (−1.4%) also lost slightly. On 15m SOL made +1.2% and XRP +12.7%. On 4h there were only 1–3 trades per coin. Changing the settings moved results around without fixing that: counting every swing low as liquidity (not just equal lows) lost on all four coins on 1h (−1.8% to −10.6%), while a 3R minimum or wider swings helped on some coins and hurt on others. The video's examples are 3–5R winners on forex; here the average trade was close to 0R. Paper-trade it and keep a journal before risking money.",
  },
};
