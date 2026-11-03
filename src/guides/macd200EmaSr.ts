import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/macd200EmaSrStrategy.ts with its defaults: EMA 200,
// MACD 12/26/9, swing lookback 5, crossover within 10 candles of the
// support/resistance touch, crossover below (above) zero for longs (shorts),
// stop at the EMA, target 1.5R.
export const macd200EmaSrGuide: StrategyGuide = {
  key: "macd-200ema-sr",
  name: "MACD + 200 EMA + S/R",
  tagline: "Trade with the 200 EMA trend, buy dips to support once MACD turns up.",
  difficulty: "Beginner",
  style: "Trend pullback with momentum confirmation",
  timeframes: "One chart, 15m",
  markets: "Liquid crypto (tested on BTCUSDT and ETHUSDT)",
  frequency: "About 2–3 trades a week per market",
  holdTime: "Hours to a day",
  direction: "Long above the 200 EMA, short below it",

  summary: [
    "The 200 EMA tells you the big trend: above it you only buy, below it you only sell. In an uptrend you wait for price to dip into a support level, then for MACD to cross up while it's still below zero, a sign the dip is ending.",
    "The stop goes at the 200 EMA itself and the target is 1.5 times your risk. It's a classic textbook strategy and the app's default.",
  ],

  terms: [
    { term: "EMA 200", meaning: "The exponential moving average of the last 200 closes. Price above it = uptrend, below = downtrend." },
    { term: "MACD", meaning: "Two lines that measure momentum: the MACD line (12/26) and its signal line (9). A crossover is when the MACD line crosses its signal line." },
    { term: "Below / above zero", meaning: "MACD's zero line. For a long, both lines must be below zero at the crossover (the dip was real). For a short, both above." },
    { term: "Support", meaning: "A swing low: a low lower than the 5 candles on each side, confirmed 5 candles later. It stays valid until a candle closes below it." },
    { term: "Resistance", meaning: "A swing high, valid until a candle closes above it." },
    { term: "Touch", meaning: "A candle whose low reaches a support level (or whose high reaches resistance)." },
  ],

  chartSetup: [
    { title: "15-minute chart", detail: "One chart is all you need." },
    { title: "Add EMA 200", detail: "Indicators → “Moving Average Exponential” → length 200, source close." },
    { title: "Add MACD", detail: "Indicators → “MACD” → fast 12, slow 26, signal 9 (the defaults)." },
    { title: "Draw support and resistance", detail: "A horizontal line at each confirmed swing low and swing high. Delete a support line when a candle closes below it, a resistance line when one closes above it." },
  ],

  long: [
    { title: "Price closes above the 200 EMA", detail: "Long-only mode. Every step below must happen with candles closing above the EMA." },
    { title: "A candle touches support", detail: "Its low reaches any of your active support lines, while it closes above the EMA. Remember which candle that was." },
    { title: "MACD crosses up below zero", detail: "Within 10 candles of the touch (the touch candle counts as 0), the MACD line crosses above the signal line, and both are below zero at that moment." },
    { title: "Check the stop", detail: "The signal candle's close must be above the 200 EMA (it will be, from step 1). That EMA value is your stop." },
  ],

  short: [
    { title: "Price closes below the 200 EMA", detail: "Short-only mode." },
    { title: "A candle touches resistance", detail: "Its high reaches an active resistance line while it closes below the EMA." },
    { title: "MACD crosses down above zero", detail: "Within 10 candles of the touch, the MACD line crosses below the signal line with both above zero." },
    { title: "Stop at the EMA", detail: "The 200 EMA value on the signal candle." },
  ],

  entry: "Enter at the open of the next 15m candle after the crossover candle closes.",
  stop: "The 200 EMA's value on the signal candle. Write it down as a fixed price; it doesn't follow the EMA afterwards.",
  target: "1.5 × your risk. Long: signal close + 1.5 × (signal close − EMA). Short: signal close − 1.5 × (EMA − signal close).",

  manage: [
    { title: "Set and forget", detail: "Stop and target as orders. Nothing moves." },
    { title: "Watch the stop distance", detail: "When price is far above the EMA the stop is wide and your position small; when it's hugging the EMA the stop is tight. Always size from the stop." },
  ],

  skip: [
    "The crossover came more than 10 candles after the touch.",
    "The MACD lines were on the wrong side of zero at the crossover.",
    "Price is on the wrong side of the 200 EMA.",
    "The support you touched had already been closed through (it's no longer valid).",
  ],

  mistakes: [
    "Taking any MACD crossover. It has to follow a support touch within 10 candles, and be below zero.",
    "Letting the stop trail the EMA. It's fixed at entry.",
    "Keeping support lines that price has closed below.",
    "Trading on a timeframe where 200 candles is barely any history (e.g. 1m).",
  ],

  example: {
    title: "A long on 15m",
    steps: [
      "Price is above the 200 EMA (EMA at 61,200). Active support: 61,850.",
      "A candle dips to 61,840 and closes at 61,900: a touch.",
      "Four candles later, MACD crosses above its signal line at −35 / −42. Below zero, within 10 candles. Signal; the candle closes at 62,050.",
      "Stop = EMA = 61,200. Risk = 850. Target = 62,050 + 1,275 = 63,325.",
      "Buy at the next open with stop 61,200 and target 63,325.",
    ],
  },

  diagram: {
    caption: "A long above the 200 EMA. Shorts are the mirror below it.",
    price: [[0, 62], [9, 72], [17, 64], [25, 55], [32, 64], [40, 76], [47, 67], [53, 55], [58, 59], [63, 66], [72, 77], [82, 85], [93, 90]],
    lines: [{ points: [[0, 12], [100, 30]], label: "EMA 200", tone: "fees" }],
    levels: [
      { y: 55, x1: 4, x2: 100, label: "Support", tone: "muted", labelAt: "start" },
      { y: 23, x1: 30, x2: 66, label: "Stop: EMA value at signal", tone: "loss", labelAt: "start" },
      { y: 90, x1: 66, x2: 100, label: "Target: 1.5 × risk", tone: "gain", labelAt: "start" },
    ],
    marks: [
      { x: 53, y: 55, label: "Touch support", tone: "signal", below: true },
      { x: 63, y: 66, label: "MACD crosses up (below zero) → buy", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "Price closed on the trend side of the 200 EMA.",
    "A candle touched an active support (or resistance) level.",
    "MACD crossed within 10 candles of that touch, on the correct side of zero.",
    "Stop fixed at the EMA's value on the signal candle; target 1.5R.",
    "Size set from the stop distance.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "15m", trades: 57, winRatePct: 31.6, profitFactor: 0.63, returnPct: -10.6, maxDrawdownPct: 13.9 },
      { symbol: "ETHUSDT", timeframe: "15m", trades: 66, winRatePct: 37.9, profitFactor: 0.95, returnPct: -1.7, maxDrawdownPct: 11.4 },
    ],
    verdict:
      "Lost on both coins. With a 1.5R target it needs to win about 40% of trades plus fees; it won 32–38%. Easy to learn, but test it on other timeframes before trading it.",
  },
};
