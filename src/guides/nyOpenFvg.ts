import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/nyOpenFvgStrategy.ts with its defaults: 15m swings
// of 3 bars a side, 1m swings of 2 bars a side, window 09:30–11:00 New York
// time (America/New_York, so it follows US daylight saving), wait up to 3
// bars for a gap after the change of character, stop under the gap's middle
// candle, target 3R, one trade per New York day, weekdays only.
export const nyOpenFvgGuide: StrategyGuide = {
  key: "ny-open-fvg",
  name: "NY Open FVG (15m Trend + 1m Entry)",
  tagline: "Read the trend on 15m, then at the New York open wait for a 1m change of character and buy the pullback into its fair value gap.",
  difficulty: "Advanced",
  style: "Trend continuation at the session open, two timeframes",
  timeframes: "Two charts: 15m for the trend, 1m for the entry",
  markets: "Tested on XAUUSDT, ETHUSDT and BTCUSDT",
  frequency: "About 1.5–2 trades a week per market, at most one a day",
  holdTime: "Minutes to an hour or two: almost every trade hits its stop or target before 16:00 New York",
  direction: "Both: long in a 15m uptrend, short in a 15m downtrend",

  summary: [
    "This is the price-action model from a popular YouTube video, coded rule by rule so it could be tested. The idea: trade only in the direction of the 15m trend, and only in the first 90 minutes after the New York stock market opens, when volume floods in.",
    "On the 1m chart you wait for a change of character, which is the first sign the small pullback against the trend is over. Then you buy (or sell) the pullback into the fair value gap that push left behind. The stop is small and the target is 3 times the risk.",
    "Read the backtest before trading it. As taught, it lost money on gold, ETH and BTC over the whole test, even before costs. The 1m stops are so small that FundingPips' commission and spread add 0.2R (gold) to 1.5R (ETH, BTC) of loss to every trade. The guide is here so you can recognise the setup and know why it isn't in the Playbook.",
  ],

  terms: [
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the candles on each side: 3 on each side on the 15m chart, 2 on each side on the 1m chart. You only know it's a swing once those later candles have closed." },
    { term: "Higher high, higher low", meaning: "Each swing high above the one before, and each swing low above the one before. That's an uptrend. Lower highs and lower lows are a downtrend." },
    { term: "Break of structure (BOS)", meaning: "A candle CLOSING above the last swing high in an uptrend (below the last swing low in a downtrend). It confirms the trend is continuing." },
    { term: "Change of character (CHoCH)", meaning: "The first close the other way: in this strategy, on the 1m chart, a candle closing above a swing high that was a lower high. The small 1m down move is over." },
    { term: "Fair value gap (FVG)", meaning: "Three candles in a row where the first candle's high is below the third candle's low (bullish). The space between them is the gap. The middle candle is the one that made it. A bearish gap is the mirror: the first candle's low above the third candle's high." },
    { term: "New York open", meaning: "09:30 in New York, when US stocks start trading. That's 14:30 UTC (20:00 IST) in winter and 13:30 UTC (19:00 IST) in summer." },
    { term: "Limit order", meaning: "An order to buy at a set price or better. It waits until price comes to it." },
    { term: "R", meaning: "Your risk on the trade: entry minus stop. 3R means a profit three times what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Open two charts of the same market", detail: "A 15-minute chart and a 1-minute chart, side by side or in two tabs." },
    { title: "Show New York time", detail: "Set the chart clock to New York (TradingView: right-click the time axis → Time zone → New York), or remember 09:30 New York = 20:00 IST in winter, 19:00 IST in summer." },
    { title: "Mark the window", detail: "Draw a vertical line at 09:30 and another at 11:00 New York time. Nothing outside these lines counts." },
    { title: "No indicators needed", detail: "Everything is read from candles: swing points, closes and gaps." },
  ],

  long: [
    { title: "15m: confirm an uptrend", detail: "Find the last 15m swing high and the swing low after it. That swing low must be higher than the swing low before it. When a 15m candle CLOSES above that swing high, the trend is up. It stays up until a 15m candle closes below the most recent 15m swing low." },
    { title: "Wait for 09:30 New York", detail: "Only look for entries from 09:30 to 11:00 New York time, Monday to Friday." },
    { title: "1m: see the lower high", detail: "On the 1m chart, the most recent swing high is lower than the one before it. Price has been pulling back." },
    { title: "1m: change of character", detail: "A 1m candle CLOSES above that lower swing high, inside the window. A wick doesn't count, and it must be the first close above that swing high today." },
    { title: "1m: find the fair value gap", detail: "In the push from the lowest point since that swing high up to the change-of-character candle, find the most recent bullish gap (first candle's high below third candle's low). If there isn't one yet, give it 3 more 1m candles to form. Still none? No trade from this change of character." },
    { title: "Place a limit buy in the middle of the gap", detail: "Entry = (first candle's high + third candle's low) ÷ 2. Stop = the low of the middle candle. Target = entry + 3 × (entry − stop)." },
    { title: "Cancel if it doesn't fill cleanly", detail: "Cancel the order if price reaches the target before coming back, if a 1m candle closes below the stop, or at 11:00 New York." },
  ],

  short: [
    { title: "15m: confirm a downtrend", detail: "The last 15m swing high after a swing low is lower than the swing high before it, and a 15m candle CLOSES below that swing low. It stays down until a 15m close above the most recent 15m swing high." },
    { title: "1m: higher low, then change of character", detail: "Inside the window, the most recent 1m swing low is higher than the one before it, and a 1m candle CLOSES below it." },
    { title: "1m: find the bearish gap", detail: "In the drop from the highest point since that swing low, the most recent bearish gap (first candle's low above third candle's high), or one within 3 more candles." },
    { title: "Limit sell in the middle of the gap", detail: "Entry = middle of the gap. Stop = the high of the middle candle. Target = entry − 3 × (stop − entry). Same cancel rules, mirrored." },
  ],

  entry: "A limit order at the middle of the fair value gap, placed as soon as the third candle of the gap closes. It fills when price comes back to it before 11:00 New York.",
  stop: "Long: the low of the gap's middle candle (the candle that made the gap). Short: its high. This is a very small stop on a 1m chart, often 0.05–0.1% of price.",
  target: "3 times the risk. The video says 3 to 4; 4R and 2R were tested too and also lost.",

  manage: [
    { title: "Set and forget", detail: "Stop and target go in with the order. Neither moves." },
    { title: "One trade a day", detail: "After the first fill of the day, long or short, you're done until tomorrow's open." },
    { title: "Size from the stop, including costs", detail: "Risk ÷ (entry − stop) gives the size, but on 1m stops the spread and commission are a big slice of the risk. The Playbook's size calculator adds them in; check what share of your risk they are before you trade." },
  ],

  skip: [
    "The 15m chart has no confirmed trend in your direction.",
    "It's before 09:30 or after 11:00 New York, or a weekend.",
    "The 1m swing high you'd break wasn't a lower high, or price already closed above it earlier today.",
    "There's no gap in the push, or none within 3 candles after the change of character.",
    "Price hit the target or closed through the stop before your order filled.",
    "Costs (spread + commission) are more than about a fifth of your risk. On FundingPips that's most ETH and BTC trades.",
  ],

  mistakes: [
    "Trading it because it looks clean on a hand-picked chart. Over hundreds of trades it lost on every market tested.",
    "Ignoring costs. A $2.50 stop on gold carries about $0.35 of spread and commission per ounce: 0.14R gone before price moves.",
    "Chasing with a market order when price runs without pulling back. The rule is a limit at the middle of the gap or nothing.",
    "Taking a second trade after a loss the same morning. The test allows one a day.",
    "Counting a wick through the swing high as a change of character. It has to be a 1m close.",
  ],

  example: {
    title: "A gold long at the New York open (round numbers)",
    steps: [
      "15m chart: swing low 3,985, swing high 4,010, a higher swing low at 3,996, then a 15m candle closes at 4,012. Uptrend.",
      "09:41 New York, 1m chart: a swing high at 4,015.0, then a lower swing high at 4,012.0. Price dips to 4,006.0.",
      "A 1m candle opens at 4,008.0, runs to 4,014.0 and closes at 4,013.5, above 4,012.0: change of character. Its low was 4,007.5.",
      "The candle before it had a high of 4,009.0; the candle after it has a low of 4,011.0. Gap 4,009.0–4,011.0, middle 4,010.0.",
      "Limit buy at 4,010.0, stop 4,007.5 (the middle candle's low), risk 2.5, target 4,010.0 + 7.5 = 4,017.5.",
      "Risking $25 on FundingPips (100 oz per lot): 2.5 × 100 = $250 per lot, so 0.1 lot. Costs: spread 0.3 × 10 oz = $3 plus commission $0.50 = $3.50, 14% of your risk. A win pays $75 − $3.50; a loss costs $25 + $3.50.",
    ],
  },

  diagram: {
    caption: "A long on the 1m chart, inside a 15m uptrend. Shorts are the same picture upside down.",
    price: [[0, 62], [10, 80], [20, 52], [30, 70], [40, 22], [48, 36], [56, 78], [63, 84], [72, 50], [82, 66], [94, 92]],
    zones: [{ x1: 56, x2: 100, y1: 43, y2: 57, label: "FVG", tone: "signal" }],
    levels: [
      { y: 92, x1: 60, x2: 100, label: "Target: 3R", tone: "gain", labelAt: "start" },
      { y: 70, x1: 26, x2: 58, label: "1m lower high", tone: "muted", labelAt: "start" },
      { y: 80, x1: 6, x2: 30, label: "1m swing high", tone: "muted", labelAt: "start" },
      { y: 50, x1: 72, x2: 100, label: "Entry: middle of gap", tone: "signal" },
      { y: 36, x1: 48, x2: 100, label: "Stop: gap candle's low", tone: "loss" },
    ],
    verticals: [{ x: 4, label: "09:30 New York" }],
    marks: [
      { x: 56, y: 78, label: "Close above = CHoCH", tone: "signal", anchor: "end" },
      { x: 72, y: 50, label: "Limit fills", tone: "gain", below: true, anchor: "middle" },
      { x: 40, y: 22, label: "Pullback low", tone: "muted", below: true },
    ],
  },

  checklist: [
    "The 15m trend is confirmed in my direction (higher low then a close above the swing high, or the mirror).",
    "It's between 09:30 and 11:00 New York time on a weekday, and I haven't traded today.",
    "A 1m candle CLOSED through a lower high (higher low) for the first time today.",
    "I found a fair value gap in that push and my limit is at its middle, stop beyond the middle candle, target 3R.",
    "Spread plus commission is a small part of my risk. If not, I skip it.",
    "I know this setup lost money in testing and I'm trading it on a demo or not at all.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "XAUUSDT", timeframe: "1m (15m trend)", trades: 37, winRatePct: 24.3, profitFactor: 0.22, returnPct: -2.9, maxDrawdownPct: 2.9 },
      { symbol: "ETHUSDT", timeframe: "1m (15m trend)", trades: 41, winRatePct: 24.4, profitFactor: 0.55, returnPct: -2.2, maxDrawdownPct: 2.7 },
      { symbol: "BTCUSDT", timeframe: "1m (15m trend)", trades: 23, winRatePct: 34.8, profitFactor: 0.57, returnPct: -1.1, maxDrawdownPct: 2.1 },
    ],
    verdict:
      "It lost money on all three markets. The returns look small only because these settings allow no leverage: a 1m stop of about 0.05–0.1% can't be sized up to 2% risk, so each trade risked well under 0.1%, while the 0.04% fee per side was bigger than the stop on many trades. A fill-accurate test with resting limit orders and FundingPips' real costs (2 years on ETH and BTC, 11 months on gold): gold 82 trades, 22% winners, profit factor 0.67, −25.5R; ETH 180 trades, 22%, 0.22, −273R; BTC 150 trades, 21%, 0.18, −278R. Before any costs it still lost about 0.1R a trade on every market. Costs then took about 0.2R a trade on gold and 1.4–1.7R on ETH and BTC, because the stops are tiny. Targets of 2R and 4R, a 08:30 start, wider 1m swings and closing by 16:00 New York all lost too. Putting the stop under the first candle of the gap (a wider stop) came closest: about break-even before costs, still a loss after them (profit factor 0.5–0.9). Don't trade it on FundingPips.",
  },
};
