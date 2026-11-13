import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/ema833ZonesStrategy.ts with its defaults
// (EMA833_ZONES_DEFAULTS): EMA 8 and 33 seeded on the first close, dominance
// body >= 0.6 of the range, close above the previous high, the candle or the
// one before touched the 8 EMA, stop = lowest low of the last 5 candles, room
// filter (100-candle high not between entry and 3R), swing-zone filter (3
// candles each side, last 200 candles, entry to 3R + 0.25R), London 08:00–16:30
// or New York 08:00–17:00 at the candle's close, stepped trail from 3R with a
// 10R take-profit cap. Same rules as mt5/PB_EMA833Zones_EA.mq5.
export const ema833ZonesGuide: StrategyGuide = {
  key: "ema833-zones",
  name: "8/33 EMA + Swing Zones",
  tagline: "Buy the strong candle that bounces off the 8 EMA in an uptrend, only when nothing is in the way of 3R, then let winners run.",
  difficulty: "Beginner",
  style: "Trend pullback with a trailing stop",
  timeframes: "One chart: 1h for gold and ETH, 5m for NAS100",
  markets: "Gold and ETH on 1h, NAS100 on 5m. It lost or broke even on silver, SPX500, GBP/USD, EUR/JPY and BTC, and at 5m and 15m on every market except NAS100",
  frequency: "About one trade every two to three weeks each on gold and ETH (1h), about 4 a week on NAS100 (5m)",
  holdTime: "Hours to several days (the winners are the long ones)",
  direction: "Both: buys when the 8 EMA is above the 33, sells when it's below",

  summary: [
    "Two moving averages show the trend: when the fast one (8) is above the slow one (33), price is rising. In a rising market price keeps dipping back to the 8 EMA and bouncing. This strategy waits for one of those dips, then buys the strong green candle that bounces off it and closes above the previous candle's high.",
    "Two filters keep you out of trades that have no room. If a recent high or a swing point sits between your entry and three times your risk, price is likely to stall there, so you skip it. You also only trade when London or New York is open.",
    "Most trades lose (about 70%). The money comes from the few that run: at 3R the stop moves up to lock in 2R, at 4R to 3R, and so on, so a big trend can pay 6R, 8R or more. Expect long losing runs: 9 in a row on gold, 16 on NAS100 5m and 16 on ETH in the test.",
    "It comes from a Hindi YouTube video that traded it on 5-minute charts. The bare video version lost money on every market tested. With the two filters, the session rule and the trailing stop it survived on 1h for gold and ETH, and on 5m only for NAS100 (5m and 15m lost on the other seven markets), after trying about 15 versions. That much trying flatters the results, so the Playbook trades it at a quarter of normal risk.",
  ],

  terms: [
    { term: "EMA (exponential moving average)", meaning: "The average closing price over a number of candles, weighted toward the latest ones. The 8 EMA follows price closely; the 33 EMA is slower." },
    { term: "Uptrend / downtrend", meaning: "Uptrend: the 8 EMA is above the 33 EMA. Downtrend: the 8 EMA is below the 33." },
    { term: "Dominance candle", meaning: "A candle whose body (open to close) is at least 60% of its whole range (high to low), in the trend's direction: green in an uptrend, red in a downtrend." },
    { term: "Retest", meaning: "The low of the signal candle, or of the candle before it, reaches the 8 EMA: price came back to the average before bouncing." },
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the 3 candles on each side. Price often stalls at these. The strategy calls them zones." },
    { term: "R", meaning: "Your risk on the trade: entry minus stop. 3R is a move three times that size." },
    { term: "Stepped trailing stop", meaning: "Once price reaches 3R, the stop moves to 2R; at 4R it moves to 3R; at 5R to 4R, and so on. It only moves in whole steps and never back." },
  ],

  chartSetup: [
    { title: "Open the right chart", detail: "XAUUSD (gold) or ETHUSD on a 1-hour chart; NAS100 (US Tech 100) on a 5-minute chart. Every rule below counts candles on that chart." },
    { title: "Add two EMAs", detail: "Indicators → Moving Average Exponential twice: length 8 and length 33, source close." },
    { title: "Know your session times", detail: "London 08:00–16:30 London time, New York 08:00–17:00 New York time. Together that's about 07:00–21:00 UTC in winter. The candle must close inside one of them." },
    { title: "MT5 or TradingView", detail: "The PB_EMA833Zones_EA (MT5) and ema833-zones-strategy.pine (TradingView) on the Indicators page mark the same trades. In the EA set Trail = true and Session = London or NY." },
  ],

  long: [
    { title: "Check the trend", detail: "The 8 EMA is above the 33 EMA." },
    { title: "Wait for a dip to the 8 EMA", detail: "A candle's low reaches the 8 EMA (or goes below it)." },
    { title: "Wait for the dominance candle", detail: "On that candle or the next one: a green candle with a body of at least 60% of its range, closing above both EMAs and above the previous candle's high. If the retest was two candles back, it doesn't count." },
    { title: "Check the time", detail: "The candle closed between 08:00 and 16:30 London time, or between 08:00 and 17:00 New York time. Otherwise skip it." },
    { title: "Set the stop", detail: "Stop = the lowest low of the last 5 candles, the signal candle included. Risk = signal close − stop. 3R = signal close + 3 × risk." },
    { title: "Check for room", detail: "Skip it if the highest high of the last 100 candles is between your entry and 3R. Also skip it if any swing high or swing low (3 candles each side) from the last 200 candles sits between your entry and 3R + a quarter of the risk." },
    { title: "Enter", detail: "Buy at the open of the next candle, stop where you set it." },
  ],

  short: [
    { title: "Check the trend", detail: "The 8 EMA is below the 33 EMA." },
    { title: "Wait for a rally to the 8 EMA", detail: "A candle's high reaches the 8 EMA." },
    { title: "Wait for the dominance candle", detail: "On that candle or the next: a red candle with a body of at least 60% of its range, closing below both EMAs and below the previous candle's low, inside London or New York hours." },
    { title: "Set the stop and check for room", detail: "Stop = the highest high of the last 5 candles. Skip it if the lowest low of the last 100 candles, or any swing point of the last 200, sits between entry and 3R (+ a quarter R for swing points)." },
    { title: "Enter", detail: "Sell at the next candle's open." },
  ],

  entry: "A market order at the open of the candle after the signal candle. Only one trade per market at a time: ignore new signals while one is open.",
  stop: "Long: the lowest low of the last 5 candles, the signal candle included. Short: the highest high of the last 5. Place it as a real stop order straight away.",
  target: "No fixed target. Leave a take-profit far away (10 × the risk) as a safety net, and trail the stop: when price reaches 3R move the stop to 2R, at 4R move it to 3R, and so on. With the trail off the strategy takes a fixed 3R, which made less in the test.",

  manage: [
    { title: "Don't touch it before 3R", detail: "No breakeven move, no early exit. Moving the stop to breakeven at 1R made every timeframe worse in the test." },
    { title: "Step the stop at each whole R", detail: "Check at each candle close: if price has reached 3R since entry, stop to 2R; 4R → 3R; 5R → 4R. Count R from your fill price." },
    { title: "Size small", detail: "The Playbook trades it at a quarter of the account's normal risk (0.25% on the $10k Flex). The three markets together (gold and ETH on 1h, NAS100 on 5m) fell 38.3R from peak to trough in MT5's Strategy Tester (about 9.6% of the account at 0.25%), and 2023 lost 15R." },
    { title: "Expect long losing runs", detail: "Only about 3 trades in 10 win. 9 to 16 losses in a row happened in the test. That's normal for this strategy, not a sign it's broken." },
  ],

  skip: [
    "The 8 EMA and 33 EMA are on the wrong side of each other for the trade.",
    "The candle is small-bodied, the wrong colour, or doesn't close beyond the previous candle's high (low).",
    "Neither the candle nor the one before it reached the 8 EMA.",
    "A recent high (low) or swing point is between entry and 3R: there's no room.",
    "The candle closed outside London and New York hours (late evening, night and the Asian session).",
    "You're already in a trade on that market.",
    "It's gold or ETH on a 5-minute or 15-minute chart, or NAS100 on 15 minutes or 1 hour. Those lost or barely made money in the test.",
  ],

  mistakes: [
    "Trading gold or ETH on 5 minutes like the video. 1,330 gold trades on 5m since 2020, with every filter, made a profit factor of 0.96 (ETH: 0.73): a steady loss. Only NAS100 held up on 5m.",
    "Taking the trade when a swing high sits just above. That filter is what turned it from losing to winning on 1h.",
    "Closing at 3R. The profit comes from the few trades that run to 5R–10R.",
    "Moving the stop to breakeven early. Price often dips back before running, and you get stopped for nothing.",
    "Risking full size because a signal 'looks perfect'. Losing runs of 10+ are normal here.",
    "Adding more markets to get more trades. Silver, SPX500, GBP/USD, EUR/JPY and BTC added about as much loss as profit.",
  ],

  example: {
    title: "A long on gold 1h (round numbers)",
    steps: [
      "At 14:00 London time the 8 EMA is at 3,300 and the 33 EMA at 3,285: uptrend.",
      "The 14:00 candle dips to 3,298, touching the 8 EMA. The 15:00 candle opens at 3,301, makes a high of 3,313 and a low of 3,300, and closes at 3,312. Its body is 11 of a 13 range (85%), it closes above the previous high (3,305) and above both EMAs, at 16:00 London time. Signal.",
      "The lowest low of the last 5 candles is 3,296. Risk = 3,312 − 3,296 = 16. 3R = 3,312 + 48 = 3,360.",
      "The highest high of the last 100 candles is 3,380, above 3,360, and no swing point sits between 3,312 and 3,364 (3R + 4). Room is fine.",
      "Risking $25 (0.25% of $10,000): 25 ÷ 16 = 1.56 ounces, about 0.02 lots. Buy at the next open, stop 3,296, take-profit cap at 3,312 + 160 = 3,472.",
      "Two days later price reaches 3,362 (3R+): move the stop to 3,344 (2R). It goes on to 3,380 (4.25R): stop to 3,360 (3R). Price falls back and stops you at 3,360: +3R, $75.",
    ],
  },

  diagram: {
    caption: "A long setup. Shorts are the same picture upside down: a downtrend, a rally to the 8 EMA, a big red candle, and the stop stepped down.",
    price: [[0, 24], [8, 30], [16, 36], [24, 44], [30, 49], [36, 41], [40, 43], [44, 50], [50, 60], [55, 56], [62, 82], [66, 92], [70, 86], [74, 80]],
    lines: [
      { points: [[0, 16], [16, 28], [30, 38], [40, 42], [50, 52], [62, 66], [74, 78]], label: "8 EMA", tone: "signal" },
      { points: [[0, 2], [30, 22], [44, 30], [74, 46]], label: "33 EMA", tone: "muted" },
    ],
    levels: [
      { y: 90, x1: 60, x2: 100, label: "4R: stop to 3R", tone: "gain" },
      { y: 80, x1: 52, x2: 100, label: "3R: stop to 2R, exit here", tone: "gain" },
      { y: 50, x1: 44, x2: 100, label: "Entry", tone: "signal" },
      { y: 40, x1: 30, x2: 100, label: "Stop: lowest low of 5", tone: "loss" },
    ],
    marks: [
      { x: 36, y: 41, label: "Dip to 8 EMA", tone: "muted", below: true, anchor: "start" },
      { x: 44, y: 50, label: "Strong green candle", tone: "gain", anchor: "end" },
    ],
  },

  checklist: [
    "The 8 EMA is above (below) the 33 EMA and the candle closed above (below) both.",
    "The candle's body is at least 60% of its range and it closed beyond the previous candle's high (low).",
    "This candle or the one before touched the 8 EMA.",
    "It closed in London (08:00–16:30) or New York (08:00–17:00) hours.",
    "No 100-candle high (low) and no swing point is between my entry and 3R.",
    "My stop is at the 5-candle extreme, my size is a quarter of my normal risk, and I'll step the stop at 3R, 4R, 5R.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "1h", trades: 13, winRatePct: 30.8, profitFactor: 0.57, returnPct: -7.1, maxDrawdownPct: 10.1 },
      { symbol: "ETHUSDT", timeframe: "1h", trades: 10, winRatePct: 40.0, profitFactor: 2.62, returnPct: 20.0, maxDrawdownPct: 6.6 },
      { symbol: "XAUUSDT", timeframe: "1h", trades: 11, winRatePct: 27.3, profitFactor: 1.23, returnPct: 2.0, maxDrawdownPct: 6.4 },
      { symbol: "NAS100", timeframe: "1h", trades: 15, winRatePct: 13.3, profitFactor: 0.18, returnPct: -12.4, maxDrawdownPct: 14.4 },
      // From FundingPips' MT5 bars: Yahoo keeps only 60 days of 5m candles.
      { symbol: "NAS100", timeframe: "5m", trades: 106, winRatePct: 24.5, profitFactor: 0.8, returnPct: -7.0, maxDrawdownPct: 15.4 },
      { symbol: "XAUUSDT", timeframe: "15m", trades: 33, winRatePct: 18.2, profitFactor: 0.75, returnPct: -5.1, maxDrawdownPct: 10.1 },
      { symbol: "ETHUSDT", timeframe: "15m", trades: 35, winRatePct: 22.9, profitFactor: 0.76, returnPct: -9.7, maxDrawdownPct: 17.0 },
    ],
    verdict:
      "Over these six months it lost money on NAS100 1h (−12.4%, 2 wins in 15) and BTC, made a little on gold and did well on ETH. The 15m versions lost. NAS100 5m (the live signal, from MT5 bars since Yahoo keeps only 60 days of 5m) lost 7% here, but most of that is the 0.04% fee these rows charge: on 5m stops that is about a quarter of R per trade, ten times FundingPips' real NAS100 cost. At the real cost the same 106 trades broke even (−0.2R). Six months is only 10 to 15 trades a market, too few to judge a strategy that wins 3 times in 10. The long test, on FundingPips' MT5 1h bars from 2020 to Nov 2026 at the platform's costs: gold 135 trades, profit factor 1.51, +49R; NAS100 177 trades, 1.23, +28.5R (on 5m: 1,539 trades, about 4 a week, 1.18, +212R, every year from 2020 up, worst drawdown 28.7R, still 1.13 at double costs); ETH 165 trades, 1.17, +21.6R. MT5's own Strategy Tester on real ticks made 1.33 on gold and 1.10 on NAS100. As one basket in the tester (gold and ETH on 1h, NAS100 on 5m) the three made 1,890 trades (5.3 a week), profit factor 1.20, +274R, with a worst drawdown of 38.3R and a losing 2023 (−15R). NAS100 5m alone in the tester: 1,573 trades, 1.17, +197R, worst drawdown 32.3R, close to the app's 1.18; the tester's NAS100 1h run made only 1.10. The video's bare 5m version lost on every market (gold 0.74 over 7,921 trades). With every filter, 5m and 15m still lost on gold, ETH, BTC, silver, SPX500, GBP/USD and EUR/JPY; NAS100 5m was the one exception, and one good result out of 16 can be luck. On 1h silver, SPX500, GBP/USD, EUR/JPY and BTC broke even or lost. These rules were picked from about 15 versions on eight markets, so expect live results below these numbers. Trade it small: gold and ETH on 1h, NAS100 on 5m.",
  },
};
