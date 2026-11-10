import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS, NAS100_60D } from "./shared";

// Matches src/strategies/liquidityReversalMtfStrategy.ts with its defaults:
// the 1h setup uses the Liquidity Reversal defaults (swingLookback 3, ATR 14,
// equal lows within 0.1 ATR and up to 100 bars apart, demand searched 10 bars
// back, stop buffer 0.1 ATR, targets from the last 200 1h bars, 48 bars from
// sweep to shift); the 5m entry uses swings of 3 bars a side; minRr 2; a zone
// lives 24 1h bars after the shift; one trade per zone.
export const liquidityReversalMtfGuide: StrategyGuide = {
  key: "liquidity-reversal-mtf",
  name: "Liquidity Reversal MTF (1h Setup + 5m Entry)",
  tagline: "Find the sweep and shift on the 1h chart, then wait on the 5m chart for buyers to show up inside the zone before you enter.",
  difficulty: "Advanced",
  style: "Reversal after a liquidity sweep, two timeframes",
  timeframes: "Two charts: 1h to find the setup, 5m to time the entry",
  markets: "Liquid crypto and gold (tested on BTCUSDT, ETHUSDT, XAUUSDT, XAGUSDT, XRPUSDT, plus NAS100)",
  frequency: "About 1 trade a month per market. Rare by design",
  holdTime: "Hours to a few days",
  direction: "Both: long after equal lows are swept, short after equal highs are swept",

  summary: [
    "This is the Liquidity Reversal strategy with one extra filter. On the 1h chart you wait for exactly the same thing: equal lows get swept (the stops under them are taken), then a 1h candle closes above the last swing high, which marks a demand zone where buyers took over.",
    "Instead of buying as soon as a 1h candle closes back above the zone, you drop to the 5m chart. You wait for price to pull back into the zone and then for a small 5m change of structure: a 5m candle closing above the last 5m swing high. That's proof buyers are active right now, not just an hour ago. The stop stays under the 1h sweep low, exactly where the 1h strategy puts it. The 5m chart decides when to get in, not where the stop goes.",
    "Why not a tight stop under the 5m low? It was tested: it got hit by ordinary noise so often that it made almost nothing. With the 1h stop, the 5m filter skipped about half of the 1h trades, and the ones it kept did about twice as well per trade.",
  ],

  terms: [
    { term: "MTF (multi-timeframe)", meaning: "Using two charts of the same market: a slower one (1h) for the setup and a faster one (5m) for the entry." },
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the 3 candles on each side. You only know it's a swing once those 3 later candles have closed. This applies on both charts." },
    { term: "Liquidity", meaning: "A cluster of waiting orders: stop losses and breakout orders. They collect just beyond obvious highs and lows." },
    { term: "Equal lows / equal highs", meaning: "Two 1h swing lows (highs) within 0.1 × ATR of each other, at most 100 candles apart, with nothing in between trading below (above) them." },
    { term: "Sweep and sweep low", meaning: "A 1h candle dips below the equal lows: the sweep. The sweep low is the lowest low reached after it." },
    { term: "Shift (change of structure)", meaning: "A 1h candle CLOSING above the last 1h swing high that formed before the sweep low. A wick doesn't count." },
    { term: "Demand zone", meaning: "The last red 1h candle at or up to 10 candles before the sweep low, from its open down to the sweep low. It's where buyers took over." },
    { term: "Pullback low", meaning: "Once price is back inside the zone, the lowest 5m low since it first got there." },
    { term: "5m break", meaning: "A 5m candle CLOSING above the last 5m swing high that formed after the 1h shift and before the pullback low. It's the entry signal." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle (14-candle average). Read it on the 1h chart for the stop buffer." },
    { term: "R", meaning: "Your risk on the trade. 2R means a profit twice the size of what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Open two charts side by side", detail: "The same market on a 1-hour chart and a 5-minute chart. TradingView's free plan allows this with two browser tabs." },
    { title: "Add ATR to the 1h chart", detail: "Indicators → “Average True Range” → length 14. You need its value to judge equal lows and set the stop buffer." },
    { title: "Draw on the 1h chart, copy to the 5m", detail: "Lines at the equal lows, last swing high, stop and target, and a rectangle for the demand zone. Drawings on TradingView show on every timeframe, so the zone appears on the 5m chart too." },
    { title: "Set an alert at the top of the zone", detail: "You don't need to watch the 5m chart until price is back in the zone. A price alert at the zone top tells you when." },
  ],

  long: [
    { title: "1h: find equal lows", detail: "Two 1h swing lows within 0.1 × ATR of each other (ATR 30 → within 3), at most 100 candles apart, with no candle between them dipping below the lower one." },
    { title: "1h: wait for the sweep", detail: "A 1h candle's low goes below them. Track the sweep low from here: the lowest low so far." },
    { title: "1h: wait for the shift", detail: "A 1h candle CLOSES above the most recent 1h swing high that formed before the sweep low, within 48 candles of the last sweep. No close, no setup." },
    { title: "1h: draw the demand zone and the stop", detail: "From the sweep low candle back up to 10 candles, find the most recent red candle. Zone = its open down to the sweep low (no red candle: use the sweep low candle's high as the top). Stop = sweep low − 0.1 × ATR. The zone is live for 24 hours after the shift." },
    { title: "5m: wait for the pullback into the zone", detail: "A 5m candle's low has to reach the top of the zone or lower. From then on, keep track of the lowest 5m low: the pullback low. If any 5m candle closes below the sweep low, the setup is dead." },
    { title: "5m: mark the last 5m swing high", detail: "The most recent 5m swing high that formed after the 1h shift candle closed and before the pullback low. If price fell straight into the zone without one, wait: it needs to exist." },
    { title: "5m: wait for the break", detail: "A 5m candle CLOSES above that 5m swing high. If price makes a lower pullback low first, use the 5m swing high before the new low." },
    { title: "Check the target pays 2R", detail: "Price = the 5m signal close. Risk = price − stop (the 1h stop). Look for 1h swing highs from the last 200 hours that price hasn't traded above since. Take the lowest one at least 2 × risk above the price. None? Skip it: the zone is used up either way." },
  ],

  short: [
    { title: "1h: equal highs, sweep, shift", detail: "Two 1h swing highs within 0.1 × ATR get swept, then a 1h candle CLOSES below the last 1h swing low before the sweep high." },
    { title: "1h: supply zone and stop", detail: "The most recent green 1h candle at or up to 10 candles before the sweep high: zone from its open up to the sweep high. Stop = sweep high + 0.1 × ATR." },
    { title: "5m: pullback into supply", detail: "A 5m high reaches the bottom of the zone. Track the highest 5m high since: the pullback high. A 5m close above the sweep high kills it." },
    { title: "5m: wait for the break", detail: "A 5m candle CLOSES below the last 5m swing low that formed after the 1h shift and before the pullback high." },
    { title: "Check the target pays 2R", detail: "Target = the highest untouched 1h swing low below that is at least 2R away. None? Skip it." },
  ],

  entry: "Enter at the open of the 5m candle right after the signal candle closes, with a market order.",
  stop: "Long: the 1h sweep low minus 0.1 × the 1h ATR(14). Short: the 1h sweep high plus 0.1 × ATR. Not under the 5m low: that was tested and lost to noise. Place it as a real stop order straight away.",
  target: "The nearest 1h swing high (long) or swing low (short) that price hasn't traded through yet and that is at least 2R away. If there isn't one, there's no trade.",

  manage: [
    { title: "Set and forget", detail: "Place the stop and target as orders right after entry. The strategy never moves either." },
    { title: "One trade per zone", detail: "After a 5m signal (taken or skipped), that zone is finished. Wait for a new 1h sweep and shift." },
    { title: "A new shift replaces the old zone", detail: "If a new 1h setup forms before the old zone triggers, forget the old zone and use the new one." },
    { title: "Size from the stop", detail: "Decide your risk first (1% of the account is a sensible start), then quantity = risk ÷ (entry − stop). The Position size page does this for you. The 1h stop is wide, so the quantity will be small. That's correct." },
  ],

  skip: [
    "There's no 1h sweep and shift. The 5m chart alone never gives a trade.",
    "Price never came back into the 1h zone, or more than 24 hours have passed since the shift.",
    "A 5m candle closed below the sweep low (above the sweep high).",
    "There's no 5m swing high between the shift and the pullback low yet.",
    "No untouched 1h swing on the other side is at least 2R away.",
    "You'd be entering a 5m break that wasn't inside a 1h zone. That's a different, untested trade.",
  ],

  mistakes: [
    "Moving the stop up under the 5m low to get a bigger R. It looks better on paper and loses in practice: that version was tested and made almost nothing.",
    "Watching the 5m chart all day. Nothing happens until price is back in the 1h zone; use an alert.",
    "Taking every 5m break. Only the first one inside a live 1h zone counts, once per zone.",
    "Counting a wick above the 5m swing high as the break. It has to be a 5m close.",
    "Using a 5m swing high from before the 1h shift. The break level must form after the 1h shift candle closed.",
  ],

  example: {
    title: "A long: 1h setup, 5m entry (round numbers)",
    steps: [
      "1h chart: two swing lows at 98 are swept by a red candle that opens at 99 and drops to 96. Two candles later a 1h candle closes at 102.5, above the 102 swing high: the shift. Demand zone 96–99. Above, there are untouched swing highs at 110 and 116.",
      "1h ATR is 2, so the stop is 96 − 0.2 = 95.8.",
      "5m chart: price drifts down from 102.5. On the way it makes a 5m swing high at 101.5. Then a 5m candle dips to 98.6, inside the zone: that's the pullback low.",
      "A few 5m candles later one closes at 101.8, above 101.5. Signal.",
      "Risk = 101.8 − 95.8 = 6. 2R needs a target at 113.8 or higher. 110 is too close (1.4R), and 116 hasn't been traded through: target 116, about 2.4R.",
      "Risking $100: quantity = 100 ÷ 6 ≈ 16.7 units. Buy at the next 5m open, stop 95.8, target 116, walk away.",
    ],
  },

  diagram: {
    caption: "A long setup. The 1h zone and stop come from the sweep; the entry waits for a 5m break inside the zone. Shorts are the same picture upside down.",
    price: [[0, 70], [8, 88], [16, 60], [24, 40], [30, 52], [38, 40], [46, 56], [54, 24], [62, 64], [66, 44], [70, 50], [75, 30], [81, 56], [94, 88]],
    zones: [{ x1: 50, x2: 100, y1: 24, y2: 37, label: "1h demand zone", tone: "signal", labelAt: "end" }],
    levels: [
      { y: 88, x1: 8, x2: 100, label: "Target: untouched 1h swing high", tone: "gain" },
      { y: 40, x1: 0, x2: 48, label: "Equal lows", tone: "muted", labelAt: "start" },
      { y: 56, x1: 30, x2: 64, label: "Last 1h swing high", tone: "muted", labelAt: "start" },
      { y: 50, x1: 66, x2: 79, label: "5m swing high", tone: "muted", labelAt: "start" },
      { y: 14, x1: 56, x2: 100, label: "Stop: 1h sweep low − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 54, y: 24, label: "Sweep", tone: "signal", below: true, anchor: "end" },
      { x: 62, y: 64, label: "1h close above = shift", tone: "signal", anchor: "end" },
      { x: 75, y: 30, label: "Pullback low", tone: "muted", below: true },
      { x: 81, y: 56, label: "5m break = buy", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "On the 1h chart, equal lows (highs) were swept and a 1h candle CLOSED through the last swing high (low).",
    "The shift was less than 24 hours ago and no 5m candle has closed beyond the sweep.",
    "Price came back into the 1h zone on the 5m chart.",
    "A 5m candle CLOSED through the last 5m swing that formed after the shift, and this is the first signal from this zone.",
    "My stop is beyond the 1h sweep with the 0.1 ATR buffer (not under the 5m low), and my size is set from it.",
    "My target is an untouched 1h swing on the other side, at least 2R away.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "5m (1h setup)", trades: 9, winRatePct: 55.6, profitFactor: 3.29, returnPct: 12.1, maxDrawdownPct: 3.3 },
      { symbol: "ETHUSDT", timeframe: "5m (1h setup)", trades: 5, winRatePct: 60.0, profitFactor: 3.59, returnPct: 7.9, maxDrawdownPct: 3.1 },
      { symbol: "XAUUSDT", timeframe: "5m (1h setup)", trades: 6, winRatePct: 33.3, profitFactor: 1.34, returnPct: 1.0, maxDrawdownPct: 3.5 },
      { symbol: "XAGUSDT", timeframe: "5m (1h setup)", trades: 5, winRatePct: 20.0, profitFactor: 0.59, returnPct: -3.0, maxDrawdownPct: 6.0 },
      { symbol: "XRPUSDT", timeframe: "5m (1h setup)", trades: 7, winRatePct: 14.3, profitFactor: 0.56, returnPct: -4.7, maxDrawdownPct: 10.7 },
      { symbol: "NAS100", timeframe: "5m (1h setup)", period: NAS100_60D, trades: 1, winRatePct: 100.0, profitFactor: null, returnPct: 2.9, maxDrawdownPct: 0.9 },
    ],
    verdict:
      "Made money on BTC (+12.1%, vs +6.4% for the plain 1h version), ETH (+7.9% vs −0.1%) and gold (+1.0% vs +6.7%: worse there). It lost on silver (−3.0%) and XRP (−4.7%). Six months gives only 5–9 trades per market, so treat these as a hint, not proof. Over 2 years at 0.059% per side (the fee CoinDCX actually charged on market orders): ETH 21 trades, profit factor 2.68, +31.1%; BTC 25 trades, 1.87, +17.1%; gold (11 months) 11 trades, 2.12, +7.3%; XRP 23 trades, 1.16, +5.1%; silver (10 months) 10 trades, 0.54, −6.2%. The rules were chosen on the first year only, and the second year held up on BTC, ETH and gold. A version with the stop under the 5m low was tested first and made close to nothing on BTC and lost on silver and XRP. It trades rarely: expect about one signal a month per market. Don't use it on silver or XRP. NAS100 gave a single trade in 58 days (a winner, +2.9%): no evidence either way.",
  },
};
