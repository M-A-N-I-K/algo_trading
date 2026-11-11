import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS, NAS100_60D } from "./shared";

// Matches src/strategies/smartMoneyConceptsStrategy.ts with its defaults:
// swingLookback 5, setups expire after 40 candles, FVG entry at its
// midpoint, FVGs expire after 60 candles, stop 0.2% beyond, target the
// larger of the nearest swing and 3R.
export const smartMoneyConceptsGuide: StrategyGuide = {
  key: "smc",
  name: "Smart Money Concepts",
  tagline: "Let price fake out below support, confirm a reversal, then buy the pullback into the gap it left behind.",
  difficulty: "Advanced",
  style: "Reversal after a liquidity sweep",
  timeframes: "One chart, 15m",
  markets: "Liquid crypto (tested on BTCUSDT and ETHUSDT, plus NAS100)",
  frequency: "About 4 trades a week per market",
  holdTime: "Hours to a day",
  direction: "Long after a sweep of support, short after a sweep of resistance",

  summary: [
    "Stops pile up just under obvious lows. Large traders often push price through them (a liquidity sweep) and then reverse. This strategy waits for that fake-out, then for proof the trend has turned (a change of character), then buys when price pulls back into the fair value gap the reversal left.",
    "It has the most steps here, so it's the hardest to do by hand. In exchange, every trade aims for at least 3R, so it can be profitable while losing most trades.",
  ],

  terms: [
    { term: "Swing high / swing low", meaning: "A candle whose high (low) beats the 5 candles on each side, confirmed once those 5 later candles have closed." },
    { term: "Support / resistance", meaning: "Here simply the latest confirmed swing low (support) and swing high (resistance)." },
    { term: "Liquidity sweep", meaning: "A candle wicks below support but closes no more than 0.2% under it (close above support × 0.998). For shorts: wicks above resistance, closes no more than 0.2% over it." },
    { term: "Lower high", meaning: "The last confirmed swing high before the sweep. Breaking it proves buyers are back." },
    { term: "Change of character (CHoCH)", meaning: "A candle CLOSES above that lower high (long) or below the last higher low (short), within 40 candles of the sweep." },
    { term: "Fair value gap (FVG)", meaning: "Three candles where the first candle's high is below the third candle's low and the middle one is green: price moved so fast it left a gap. Its midpoint is your entry level." },
  ],

  chartSetup: [
    { title: "One 15-minute chart", detail: "No indicators needed. You'll draw lines and rectangles by hand." },
    { title: "Optional helpers", detail: "TradingView has free community indicators that mark fair value gaps and swing points. They help, but check them against the rules below; definitions vary." },
  ],

  long: [
    { title: "Mark the latest swing low as support", detail: "A low beating the 5 candles on each side. It replaces the previous one as soon as it's confirmed." },
    { title: "Spot a liquidity sweep", detail: "A candle's low goes below support, but it closes above support × 0.998 (no more than 0.2% under). Note that candle's low: the sweep low." },
    { title: "Note the lower high", detail: "The last confirmed swing high before the sweep candle." },
    { title: "Wait for the change of character", detail: "Within 40 candles of the sweep, a candle must CLOSE above the lower high. No close above it in 40 candles → forget this setup." },
    { title: "Find the fair value gap", detail: "On the CHoCH candle, look back over the last ~6 candles for a bullish FVG (candle 1's high below candle 3's low, candle 2 green). Gap = candle 1's high to candle 3's low. No gap → no trade." },
    { title: "Wait for the pullback to the gap's midpoint", detail: "Within the next 60 candles, a candle's low reaches the midpoint and the candle closes at or above the gap's bottom. That's the signal. A close below the gap's bottom first cancels it." },
    { title: "One trade per gap", detail: "Once a gap has given a trade, it's used up." },
  ],

  short: [
    { title: "Mark the latest swing high as resistance", detail: "A high beating the 5 candles on each side." },
    { title: "Spot the sweep", detail: "A candle's high goes above resistance but it closes below resistance × 1.002. Note the sweep high." },
    { title: "Wait for the change of character", detail: "Within 40 candles, a candle CLOSES below the last swing low before the sweep." },
    { title: "Find the bearish FVG", detail: "Candle 1's low above candle 3's high, candle 2 red. Gap = candle 3's high to candle 1's low." },
    { title: "Wait for the rally to the midpoint", detail: "Within 60 candles, a candle's high reaches the midpoint and it closes at or below the gap's top. A close above the gap's top first cancels it." },
  ],

  entry: "Enter at the open of the next 15m candle after the signal candle closes.",
  stop: "Long: whichever is lower, the gap's bottom or the sweep low, then 0.2% further down. Short: whichever is higher, the gap's top or the sweep high, then 0.2% further up.",
  target: "Whichever is further away: the latest confirmed swing high (long) / swing low (short), or 3 × your risk. So it's always at least 3R.",

  manage: [
    { title: "Set and forget", detail: "Stop and target as orders straight away; nothing moves afterwards." },
    { title: "Expect lots of small losses", detail: "With 3R+ targets, winning 1 trade in 4 roughly breaks even after fees. Losing streaks of 6–8 are normal; size so they don't hurt." },
  ],

  skip: [
    "No change of character within 40 candles of the sweep.",
    "The CHoCH move left no fair value gap.",
    "Price closed through the gap's far side before reaching the midpoint.",
    "60 candles passed without a pullback to the midpoint.",
    "The sweep candle closed more than 0.2% beyond the level: that's a real breakdown, not a sweep.",
  ],

  mistakes: [
    "Treating any break of support as a sweep. The candle must close back near (within 0.2% of) the level.",
    "Entering at the CHoCH itself instead of waiting for the pullback into the gap.",
    "Entering at the top of the gap instead of its midpoint.",
    "Putting the stop at the gap only and forgetting the sweep low below it.",
  ],

  example: {
    title: "A long on 15m (round numbers)",
    steps: [
      "Support (latest swing low) is 100. A candle wicks to 99.2 and closes at 99.95: above 99.8 (100 × 0.998), so it's a sweep. Sweep low 99.2.",
      "The last swing high before it was 103: the lower high.",
      "Twelve candles later a candle closes at 103.6: change of character.",
      "In that move, candle 1's high was 101.8 and candle 3's low 102.6, with a green middle candle. Gap 101.8–102.6, midpoint 102.2.",
      "Price pulls back: a candle's low hits 102.1 and it closes at 102.4. Signal.",
      "Stop: lower of 101.8 and 99.2 = 99.2, minus 0.2% = 99.0. Risk ≈ 3.4. Target: 3R = 102.4 + 10.2 = 112.6 (unless the latest swing high is further).",
    ],
  },

  diagram: {
    caption: "A long after a sweep of support. The target is at least 3R.",
    price: [[0, 45], [7, 38], [14, 28], [21, 46], [27, 34], [31, 18], [34, 27], [38, 38], [41, 48], [44, 58], [48, 66], [52, 72], [57, 64], [62, 57], [68, 66], [77, 77], [87, 86], [96, 92]],
    zones: [{ x1: 40, x2: 100, y1: 52, y2: 62, label: "Fair value gap: enter at its middle", tone: "signal", labelAt: "end" }],
    levels: [
      { y: 28, x1: 8, x2: 40, label: "Support (swing low)", tone: "muted", labelAt: "start" },
      { y: 46, x1: 4, x2: 50, label: "Lower high", tone: "muted", labelAt: "start" },
      { y: 15, x1: 26, x2: 100, label: "Stop: sweep low − 0.2%", tone: "loss" },
      { y: 92, x1: 66, x2: 100, label: "Target: ≥ 3R", tone: "gain", labelAt: "start" },
    ],
    marks: [
      { x: 31, y: 18, label: "Sweep", tone: "signal", below: true },
      { x: 41, y: 48, label: "CHoCH (close above)", tone: "signal", anchor: "end" },
      { x: 62, y: 57, label: "Pullback to midpoint → buy next open", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "The sweep candle closed within 0.2% of the level.",
    "A candle CLOSED beyond the lower high (or higher low) within 40 candles.",
    "The move left a fair value gap, and I'm entering at its midpoint.",
    "Price hasn't closed through the gap's far side.",
    "Stop beyond both the gap and the sweep, plus 0.2%. Target at least 3R.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "15m", trades: 97, winRatePct: 21.6, profitFactor: 0.7, returnPct: -17.9, maxDrawdownPct: 18.3 },
      { symbol: "ETHUSDT", timeframe: "15m", trades: 107, winRatePct: 25.2, profitFactor: 1.01, returnPct: 0.7, maxDrawdownPct: 12 },
      { symbol: "NAS100", timeframe: "15m", period: NAS100_60D, trades: 18, winRatePct: 33.3, profitFactor: 1.19, returnPct: 1.4, maxDrawdownPct: 5.3 },
    ],
    verdict:
      "Break-even on ETH, a clear loss on BTC. A 3R target needs a win rate above ~25% to pay for fees; BTC fell short. Practise on a demo account first: it's the hardest one to spot correctly by eye. NAS100 made +1.4% on 18 trades over 58 days (profit factor 1.19), a small sample. On 4h candles it does better, and two 4h versions are Playbook setups, tested on the broker's own MT5 bars: gold since 2020 (56 trades, profit factor 1.56) and the FTSE 100 since July 2023 (27 trades, profit factor 3.03, too few trades to trust that number fully).",
  },
};
