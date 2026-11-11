import { StrategyGuide } from "./types";
import { BACKTEST_SETTINGS } from "./shared";

// Matches src/strategies/nyInsideBarStrategy.ts with its defaults
// (NY_INSIDE_BAR_DEFAULTS): 15m candles, opening range 09:30–10:00 New York
// time, its colour sets the side, an inside candle is one whose body sits
// inside the previous candle's body, stop order at the inside candle's high
// (low) live for 3 candles, cancelled by a break of the other side or a newer
// inside candle, stop beyond both candles, target 1R from the trigger, at most
// 2 trades a day, no fill on a candle starting 15:00 or later, flat at 16:00.
export const nyInsideBarGuide: StrategyGuide = {
  key: "ny-inside-bar",
  name: "NY Inside Bar (Opening-Range Bias, 1:1)",
  tagline: "Let the first 30 minutes of New York pick the side, then buy the break of each small pause candle, 1:1.",
  difficulty: "Beginner",
  style: "Intraday breakout with the opening range, pending stop orders",
  timeframes: "One chart: 15m",
  markets: "Stock indices: NAS100 and SPX500. It lost on gold after costs",
  frequency: "About 4 trades a week per market (up to 2 a day)",
  holdTime: "Minutes to a few hours; always closed by 16:00 New York time",
  direction: "Both: longs only on days the opening range is green, shorts only when it's red",

  summary: [
    "The New York stock market opens at 09:30 New York time. The first 30 minutes (two 15-minute candles) show which way the big money is leaning that day. If those two candles together closed higher than they opened, you only buy all day; if lower, you only sell.",
    "After that, you wait for a small pause: a candle whose body fits inside the body of the candle before it (an inside candle). You place a pending buy stop order at the high of that pause candle. If price breaks out, the order fills; if it doesn't within 3 candles, you cancel it. The stop goes below both candles and the target is the same distance above: 1:1.",
    "It comes from a Hindi YouTube video aimed at prop-firm traders (NASDAQ and gold, 1:1). The video's own version only just broke even after costs. Adding the opening-range colour rule is what made it work in the backtest: on NAS100 from 2020 to Nov 2026 it made a profit factor of 1.31 over 1,512 trades. Each trade earns little (0.13R on average), so it only works because of how many there are, and only while your costs are small.",
  ],

  terms: [
    { term: "New York time (ET)", meaning: "US Eastern time. 09:30 ET is 14:30 UTC in winter and 13:30 UTC in summer (20:00 / 19:00 in India). The app converts for you, including the daylight-saving switches." },
    { term: "Candle body", meaning: "The part between the open and the close, ignoring the wicks." },
    { term: "Opening range", meaning: "The two 15-minute candles that start at 09:30 and 09:45 ET. Green range: the 09:45 candle closed above the 09:30 candle's open. Red range: below it. Exactly equal: no trades that day." },
    { term: "Inside candle", meaning: "A candle whose body sits within the previous candle's body: its higher of open/close is no higher, and its lower of open/close is no lower. Wicks don't count. The first one can be the 10:00 candle (inside the 09:45 candle)." },
    { term: "Outer candle", meaning: "The candle just before the inside candle." },
    { term: "Buy stop / sell stop", meaning: "A pending order that only becomes a trade if price reaches it: a buy stop sits above the price and buys when price rises to it; a sell stop sits below and sells when price falls to it." },
    { term: "R", meaning: "Your risk on the trade: entry minus stop. A 1R target is the same distance above the entry as the stop is below it." },
  ],

  chartSetup: [
    { title: "Open a 15-minute chart", detail: "NAS100 (NDX100 on FundingPips) or SPX500. Candles must start on the quarter hour (:00, :15, :30, :45), which is the default." },
    { title: "Mark 09:30 ET", detail: "Add a vertical line or a session marker at the New York open: 09:30 ET (19:00 or 20:00 India time, depending on US daylight saving). The Playbook page does this timing for you and shows each order." },
    { title: "Have the order tools ready", detail: "You'll place pending buy stop / sell stop orders with a stop loss and take profit attached, and cancel them often. Know where that is on your platform before 09:30." },
  ],

  long: [
    { title: "Read the opening range", detail: "At 10:00 ET, compare the 09:45 candle's close with the 09:30 candle's open. Higher: today is a buy day. Lower: go to the short steps. Equal: no trades today." },
    { title: "Wait for an inside candle", detail: "From the 10:00 candle on, after each candle closes, check: is its body inside the previous candle's body? If not, keep waiting." },
    { title: "Place the buy stop", detail: "Buy stop at the inside candle's high. Stop loss at the lower of the two candles' lows (inside and outer). Take profit = buy stop + (buy stop − stop loss)." },
    { title: "Give it 3 candles", detail: "The order stays for the next 3 candles. Cancel it if: 3 candles close without a fill; price trades down to the inside candle's low first (or reaches both sides in one candle); or a newer inside candle forms, in which case move the order to that one." },
    { title: "Mind the clock", detail: "No order may still be live on a candle starting at 15:00 ET or later. Whatever is open at 16:00 ET, close it." },
    { title: "Up to 2 trades a day, one at a time", detail: "After a trade closes, look for a new inside candle that forms after it. Stop after the second trade of the day, win or lose." },
  ],

  short: [
    { title: "Red opening range", detail: "The 09:45 candle closed below the 09:30 candle's open: today is a sell day." },
    { title: "Inside candle, then a sell stop", detail: "Sell stop at the inside candle's low. Stop loss at the higher of the two candles' highs. Take profit = sell stop − (stop loss − sell stop)." },
    { title: "Same cancels and clock", detail: "Cancel after 3 candles, if price reaches the inside candle's high first, or when a newer inside candle forms. Nothing live from 15:00 ET; all closed at 16:00 ET. At most 2 trades a day." },
  ],

  entry: "A pending stop order at the inside candle's high (buy) or low (sell), placed when the inside candle closes. It fills at that price, or at the open if the next candle gaps past it. Never buy at market because a breakout already happened: the backtest only took the stop-order fill.",
  stop: "Beyond both candles: below the lower of the inside and outer candles' lows for a buy, above the higher of their highs for a sell. Attach it to the pending order so it's live the moment the order fills.",
  target: "1R: the same distance from the entry as the stop. Fixed. Testing 1.5R made no more money and 1:1 keeps the win rate near 58%, which is easier to sit through.",

  manage: [
    { title: "Set and forget", detail: "Stop and target go on with the order. The tested version never moves them: no breakeven, no trailing." },
    { title: "Close at 16:00 ET", detail: "Any trade still open at the New York close is closed at market. This happened on about 1 trade in 12." },
    { title: "Expect many small trades", detail: "About 4 a week per market. The edge is thin per trade (0.13R on NAS100 after costs), so skipping the boring ones or doubling up after a loss changes the result. Take every valid one at the same risk." },
    { title: "Size from the stop", detail: "Risk a fixed amount (the Playbook sets it per account), then size = risk ÷ (entry − stop). The Position size page does this." },
  ],

  skip: [
    "The opening range closed exactly where it opened: no side, no trades.",
    "The setup is against the opening-range colour (a sell setup on a green day).",
    "The candle's wicks are inside but the body isn't: it's not an inside candle.",
    "It's 15:00 ET or later: no new orders.",
    "You already took 2 trades today.",
    "Gold, silver, crypto or currency pairs: the same rules lost after costs there.",
    "Your costs are high. At a 0.04% fee per side (the guides' standard setting below) it loses even on NAS100. It needs index-CFD spreads like FundingPips' (about 1 point on NAS100).",
  ],

  mistakes: [
    "Trading both directions. Without the opening-range colour rule the strategy was close to break-even after costs.",
    "Entering at market after the breakout candle closes. The video does this (with a wick rule); it did far worse than the stop order (profit factor 0.76–0.80).",
    "Leaving an old order live when a newer inside candle forms. Move it.",
    "Forgetting to cancel after 3 candles, and getting filled on a stale level later.",
    "Moving the stop to breakeven. Not tested here; the PDF strategies that did it lost.",
    "Taking a third trade to win back the day.",
  ],

  example: {
    title: "A long on NAS100 15m (round numbers)",
    steps: [
      "09:30 ET candle opens at 25,000. The 09:45 candle closes at 25,040: the range is green, so buy only today.",
      "10:00 candle: opens 25,040, high 25,095, low 25,020, closes 25,090 (body 25,040–25,090).",
      "10:15 candle: opens 25,085, high 25,100, low 25,060, closes 25,070. Its body (25,070–25,085) is inside 25,040–25,090: an inside candle.",
      "Place a buy stop at 25,100 (its high). Stop loss = lower of the two lows = 25,020. Risk = 80 points. Take profit = 25,100 + 80 = 25,180.",
      "Risking $75 on 0.01-lot steps where 0.01 lot of NDX100 is worth $0.20 a point: 0.01 lot loses $16 over 80 points, so about 0.04–0.05 lot.",
      "The 10:30 candle rises to 25,120 without touching 25,060 first: filled at 25,100. At 11:15 price reaches 25,180: +1R, +$75 less costs. One more trade is allowed today.",
    ],
  },

  diagram: {
    caption: "A long day. Short days are the same picture upside down: a red opening range, a sell stop under the inside candle's low.",
    price: [[0, 22], [8, 30], [14, 26], [22, 38], [32, 58], [40, 54], [46, 56], [52, 53], [60, 63], [70, 72], [80, 80], [88, 76], [100, 77]],
    zones: [{ x1: 0, x2: 22, y1: 18, y2: 62, label: "Opening range", tone: "signal" }],
    levels: [
      { y: 80, x1: 60, x2: 100, label: "Target: 1R", tone: "gain" },
      { y: 60, x1: 52, x2: 100, label: "Buy stop: inside high", tone: "signal" },
      { y: 40, x1: 30, x2: 100, label: "Stop: below both candles", tone: "loss" },
    ],
    verticals: [{ x: 22, label: "10:00 ET" }],
    marks: [
      { x: 46, y: 56, label: "Inside candle", tone: "muted", anchor: "end" },
      { x: 60, y: 63, label: "Filled", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "The opening range (09:30–10:00 ET) is green for a buy, red for a sell.",
    "The candle's body is inside the previous candle's body.",
    "My order is a stop order at the inside candle's high (low), not a market order.",
    "Stop beyond both candles, target exactly 1R, size from the stop.",
    "It's before 15:00 ET, and this is at most my second trade today.",
    "I'll cancel it after 3 candles, if the other side breaks first, or when a newer inside candle forms.",
  ],

  backtest: {
    period: "5 May – 3 Nov 2026 (6 months), FundingPips MT5 15m bars",
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "NAS100", timeframe: "15m", trades: 115, winRatePct: 57.4, profitFactor: 0.97, returnPct: -0.4, maxDrawdownPct: 3.1 },
      { symbol: "SPX500", timeframe: "15m", trades: 112, winRatePct: 44.6, profitFactor: 0.42, returnPct: -5.9, maxDrawdownPct: 6.2 },
      { symbol: "XAUUSD", timeframe: "15m", trades: 121, winRatePct: 56.2, profitFactor: 0.59, returnPct: -5.7, maxDrawdownPct: 6.8 },
    ],
    verdict:
      "At the guides' 0.04% fee per side, all three lost over these 6 months: that fee is about 10 NAS100 points each way, a big share of a typical 15-minute stop. FundingPips' real cost on NAS100 is far smaller, and at the platform's measured costs the same 6 months made +28R on NAS100 (115 trades, profit factor 1.71), +11R on SPX500 (PF 1.23) and +17R on gold (PF 1.35). The long test is what put it in the Playbook: on MT5 bars from Jan 2020 to Nov 2026 at measured costs, NAS100 made 1,512 trades, won 58%, profit factor 1.31, +190R, with every year profitable; it held at 1.5× and 2× costs (PF 1.24, 1.18) and with candles shifted 5 and 10 minutes (PF 1.23, 1.26). SPX500 made PF 1.21 over 1,615 trades (2021 lost 4.9R). Gold made only PF 1.03 over the long test and lost at 1.5× costs, so the good 6 months there was luck. The video's original rules (both directions) made PF 1.11 on NAS100, and the opening-range filter was chosen after seeing results, so expect live trading to come in below the backtest.",
  },
};
