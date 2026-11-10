import { StrategyGuide } from "./types";
import { BACKTEST_PERIOD, BACKTEST_SETTINGS, NAS100_60D } from "./shared";

// Matches src/strategies/topDownStrategy.ts with its defaults: weekly bias
// (last closed week green and closed above the prior week's high), daily
// structure (daily swings 2 days a side), 1h swings 3 bars a side, the 1h
// range at least 3 × the 1h ATR(14), discount = lower half, 5m swings 3 bars
// a side, stop = pullback low − 0.1 ATR but at least 0.5 ATR from entry,
// minRr 3 to the range high, half off there and half run to the nearest
// untaken weekly swing high within 26 weeks. Weeks start Monday 00:00 UTC.
export const topDownGuide: StrategyGuide = {
  key: "top-down",
  name: "Top-Down Day Trade (Weekly Bias + 1h Range + 5m Entry)",
  tagline: "Decide the direction at the weekend from the weekly and daily charts, then buy pullbacks inside today's 1h range when the 5m chart turns your way.",
  difficulty: "Intermediate",
  style: "Trend pullback, top-down from weekly to 5 minutes",
  timeframes: "Weekly and daily for the bias (weekend work), 1h for the range, 5m to enter (day-to-day work)",
  markets: "Liquid crypto and gold (tested on 12 markets: BTC, ETH, XAU, XAG, XRP, SOL, AVAX, DOGE, ADA, SUI, NEAR, AAVE, plus NAS100)",
  frequency: "Rare: about 6–10 trades a year per market, because most weeks don't give a strong enough weekly candle",
  holdTime: "Hours for the first half; days to weeks for the runner",
  direction: "Both, but only one per week: longs in a bullish week, shorts in a bearish one",

  summary: [
    "This is the top-down process from the video, turned into exact rules. At the weekend you look at two charts. The weekly chart tells you who is in control: a green week that closed above the previous week's high means buyers. The daily chart has to agree: its last break of structure must be upward. If both agree, you only look for longs all week. If either disagrees, you sit out.",
    "Each day you drop to the 1h chart and mark the daily trading range: the latest leg up, from its swing low to its high. You only buy in the lower half of that range (discount), and only once the 5m chart turns bullish: a 5m candle closing above the last 5m swing high of the pullback.",
    "The trade is split in two. Half comes off at the top of the 1h range. The other half stays open for the weekly target: the nearest weekly swing high above that price hasn't traded through yet. That's the video's “profit maximising” idea. In the backtest, the runner is where most of the money came from.",
  ],

  terms: [
    { term: "Top-down analysis", meaning: "Reading the charts from the slowest (weekly) to the fastest (5m). The slow charts pick the direction; the fast ones pick the moment." },
    { term: "Bias", meaning: "The one direction you're allowed to trade this week. Long, short or none." },
    { term: "Weekly bias", meaning: "Look at the last completed weekly candle (weeks start Monday 00:00 UTC, 05:30 IST). Bullish: it's green and CLOSED above the previous week's high. Bearish: it's red and CLOSED below the previous week's low. Anything else: no bias, no trades this week." },
    { term: "Swing high / swing low", meaning: "A candle whose high is higher (or low is lower) than the candles on each side: 2 a side on the daily chart, 3 a side on the 1h and 5m charts. You only know it's a swing once those later candles have closed." },
    { term: "Daily structure", meaning: "Up after a daily candle CLOSES above the most recent daily swing high. Down after one closes below the most recent daily swing low. It stays that way until the opposite happens." },
    { term: "Daily trading range", meaning: "On the 1h chart: from the most recent 1h swing low up to the highest high since then (the latest leg). It only counts if it's at least 3 × the 1h ATR tall." },
    { term: "Discount", meaning: "The lower half of the range, below its midpoint. Longs are only taken there." },
    { term: "Pullback low", meaning: "Once price is in the discount half, the lowest 5m low since it got there." },
    { term: "5m break (change of structure)", meaning: "A 5m candle CLOSING above the last 5m swing high that formed between the range high and the pullback low. It shows the 5m chart has turned back up." },
    { term: "Runner", meaning: "The half of the position you leave open after the first target, aiming for the weekly target." },
    { term: "Weekly target", meaning: "The nearest weekly swing high (higher than the weeks either side) from the last 26 weeks that is above the range high and that no later week has traded above." },
    { term: "ATR (Average True Range)", meaning: "How far price typically moves in one candle (14-candle average). Use the 1h ATR for the range size and the stop." },
    { term: "R", meaning: "Your risk on the trade. 3R means a profit three times what you'd lose at the stop." },
  ],

  chartSetup: [
    { title: "Weekend: open the weekly and daily charts", detail: "Set the chart's timezone to UTC (or remember weeks start Monday 05:30 IST) so the weekly candles match the rules." },
    { title: "Day-to-day: open a 1h and a 5m chart", detail: "Same market, side by side. Add ATR (length 14) to the 1h chart." },
    { title: "Draw the range on the 1h chart", detail: "Use TradingView's Fib retracement or a rectangle from the 1h swing low to the range high, with a line at the 50% midpoint. Drawings show on the 5m chart too." },
    { title: "Mark the weekly target", detail: "A horizontal line at the nearest untaken weekly swing high above the range. It's where the runner exits." },
    { title: "Set an alert at the midpoint", detail: "Nothing happens until price is in the discount half. A price alert at the midpoint tells you when to watch the 5m chart." },
  ],

  long: [
    { title: "Weekend: check the weekly candle", detail: "Last week closed green AND above the week before's high. If not, there are no longs this week." },
    { title: "Weekend: check daily structure", detail: "The most recent daily break was a CLOSE above a daily swing high, not a close below a daily swing low. If it was down, no longs." },
    { title: "Day: mark the 1h range", detail: "Find the most recent 1h swing low and the highest 1h high since. That's the range. If it's less than 3 × the 1h ATR tall, it's too small: wait for the next leg." },
    { title: "Day: wait for discount", detail: "A 5m candle's low has to reach the midpoint or lower, after the range high was made. If a new 1h high extends the range first, redraw it and keep waiting." },
    { title: "Track the pullback low", detail: "The lowest 5m low since price reached discount. If a 5m candle CLOSES below the range low (the 1h swing low), the range is dead: wait for a new swing low to form." },
    { title: "Mark the 5m swing high", detail: "The most recent 5m swing high that formed after the range high and before the pullback low. If price makes a lower pullback low, use the swing high before the new low." },
    { title: "Wait for the 5m break", detail: "A 5m candle CLOSES above that 5m swing high. That's the signal." },
    { title: "Check it pays 3R to the range high", detail: "Stop = pullback low − 0.1 × 1h ATR, but at least 0.5 × ATR below the signal close. Risk = signal close − stop. The range high must be at least 3 × risk above the close. If not, skip it. Either way, this range is used up." },
  ],

  short: [
    { title: "Weekend: bearish weekly and daily", detail: "Last week closed red AND below the week before's low, and the most recent daily break was a close below a daily swing low." },
    { title: "Day: mark the 1h range", detail: "From the most recent 1h swing high down to the lowest low since. At least 3 × ATR tall." },
    { title: "Wait for premium", detail: "A 5m high reaches the midpoint or higher. Track the highest 5m high since: the pullback high. A 5m close above the range high (the 1h swing high) kills it." },
    { title: "Wait for the 5m break", detail: "A 5m candle CLOSES below the last 5m swing low that formed after the range low and before the pullback high." },
    { title: "Check it pays 3R", detail: "Stop = pullback high + 0.1 × ATR (at least 0.5 × ATR above the close). The range low must be at least 3 × risk below. Half comes off there; the runner targets the nearest untaken weekly swing low." },
  ],

  entry: "Enter at the open of the 5m candle right after the signal candle closes, with a market order. Split the position into two equal halves, so you can set a different target on each.",
  stop: "Long: the pullback low minus 0.1 × the 1h ATR(14), but never closer than 0.5 × ATR below the signal close. A stop a few ticks away loses more to fees than to price. Short: the mirror. Place the same stop on both halves straight away.",
  target: "Half 1: the range high (long) or range low (short), at least 3R away. Half 2 (the runner): the nearest weekly swing high (long) or low (short) from the last 26 weeks that is beyond the range and hasn't been traded through. If there isn't one, close the whole position at the range high.",

  manage: [
    { title: "Two orders, two targets", detail: "Half 1 with the take-profit at the range high, half 2 with the take-profit at the weekly target. Both share the same stop. In the backtest the stop is never moved, even after half 1 is out." },
    { title: "One trade per range", detail: "After a signal on a range, taken or skipped, that range is done. Wait for a new 1h swing low and leg." },
    { title: "The bias lasts all week", detail: "Only check the weekly and daily again at the next weekend. The daily structure can flip mid-week; when it does, stop taking new trades in the old direction." },
    { title: "Size from the stop", detail: "Risk 1% of the account on the whole trade (0.5% per half). Quantity = risk ÷ (entry − stop). The Position size page does this for you." },
    { title: "The runner can take weeks", detail: "If you can't hold that long, the backtest doesn't cover your version. In testing, the runner made most of the profit (ETH: +17.4% with it, 0.0% without)." },
  ],

  skip: [
    "Last week wasn't a strong candle (green but closed below the previous week's high, or red but above its low). Most weeks are like this. Don't trade.",
    "The weekly and daily disagree.",
    "The signal is against the weekly bias, however good it looks on the 5m chart.",
    "The range is smaller than 3 × the 1h ATR.",
    "Price never reached discount (premium for shorts), or a 5m candle closed beyond the range low (high).",
    "The range high is less than 3R away from the signal close.",
    "You're on DOGE, ADA, AAVE or SUI: it lost heavily there in testing.",
  ],

  mistakes: [
    "Trading a weak week. A green week that didn't close above the previous high isn't a bias. The strategy only works because it sits out most weeks.",
    "Buying the first touch of discount. Wait for the 5m candle to CLOSE above the 5m swing high.",
    "Using a 5m swing high from before the range high. The break level must form during the pullback.",
    "Closing the runner early because the first target hit. In the backtest the runner made most of the money.",
    "Tightening the stop under a 1m or 5m wick to get a bigger R. The minimum stop of 0.5 × ATR is there because tiny stops were eaten by fees.",
    "Expecting a trade every day. This setup fired 6–22 times in 2 years per market.",
  ],

  example: {
    title: "A long (round numbers)",
    steps: [
      "Weekend: last week opened at 95 and closed at 108, above the previous week's high of 104. Green and above the high: bullish. On the daily chart the last break was a close at 107 above a daily swing high at 105: structure up. Longs only this week.",
      "Monday, 1h chart: the latest 1h swing low is 100 and price ran up to 120. 1h ATR is 2, so 3 × ATR = 6, and the range of 20 is big enough. Midpoint = 110: below it is discount. The nearest untaken weekly swing high above 120 is 131: that's the runner target.",
      "5m chart: price drifts down from 120. On the way it bounces and makes a 5m swing high at 108.0. Then it dips to 106.5: inside discount, and the pullback low.",
      "A 5m candle closes at 108.2, above 108.0. Signal.",
      "Stop: 106.5 − 0.1 × 2 = 106.3. The minimum distance is 108.2 − 0.5 × 2 = 107.2, and 106.3 is further, so keep 106.3. Risk = 108.2 − 106.3 = 1.9. The range high, 120, is 11.8 away = 6.2R: at least 3R, so take it.",
      "Risking $100: quantity = 100 ÷ 1.9 ≈ 52.6 units, split into two halves of 26.3. Half 1: take-profit 120. Half 2: take-profit 131. Both: stop 106.3.",
      "If both targets hit: about +$310 on half 1 and +$600 on half 2, about +9R before fees. If half 1 hits and price then falls back to the stop: +$310 − $50 = +$260.",
    ],
  },

  diagram: {
    caption: "A long in a bullish week. The 1h range is the latest leg up; buy the 5m break inside its lower half, take half at the range high and let half run to the weekly target. Shorts are the same picture upside down.",
    price: [[0, 40], [12, 24], [20, 52], [24, 46], [32, 76], [38, 60], [42, 64], [46, 52], [50, 36], [56, 70], [62, 76], [68, 70], [80, 84], [94, 93]],
    zones: [{ x1: 36, x2: 100, y1: 24, y2: 50, label: "Discount: lower half of the 1h range", tone: "signal", labelAt: "end" }],
    levels: [
      { y: 93, x1: 30, x2: 100, label: "Weekly target: runner exits", tone: "gain", labelAt: "start" },
      { y: 76, x1: 32, x2: 100, label: "Range high: take half", tone: "gain" },
      { y: 64, x1: 40, x2: 53, label: "5m swing high", tone: "muted", labelAt: "start" },
      { y: 24, x1: 0, x2: 34, label: "1h swing low", tone: "muted" },
      { y: 30, x1: 50, x2: 100, label: "Stop: pullback low − 0.1 ATR", tone: "loss" },
    ],
    marks: [
      { x: 50, y: 36, label: "Pullback low", tone: "muted", below: true, anchor: "end" },
      { x: 56, y: 70, label: "5m break = buy", tone: "gain", below: true, anchor: "start" },
    ],
  },

  checklist: [
    "Last week's candle was green and closed above the previous week's high (red and below its low for shorts).",
    "Daily structure agrees: the last daily break was in my direction.",
    "The 1h range (swing low to leg high) is at least 3 × the 1h ATR.",
    "Price reached the discount half after the range high was made, and no 5m candle closed below the range low.",
    "A 5m candle CLOSED above the last 5m swing high of the pullback, and this is the first signal on this range.",
    "The range high is at least 3R away, with my stop under the pullback low (at least 0.5 × ATR from entry).",
    "Half the position targets the range high, half the weekly target, and I've sized 1% total risk from the stop.",
  ],

  backtest: {
    period: BACKTEST_PERIOD,
    settings: BACKTEST_SETTINGS,
    rows: [
      { symbol: "BTCUSDT", timeframe: "5m (1h range, weekly/daily bias)", trades: 3, winRatePct: 66.7, profitFactor: 17.36, returnPct: 7.4, maxDrawdownPct: 3.2 },
      { symbol: "ETHUSDT", timeframe: "5m (1h range, weekly/daily bias)", trades: 6, winRatePct: 16.7, profitFactor: 1.21, returnPct: 0.8, maxDrawdownPct: 4.6 },
      { symbol: "XAUUSDT", timeframe: "5m (1h range, weekly/daily bias)", trades: 4, winRatePct: 50.0, profitFactor: 5.54, returnPct: 2.2, maxDrawdownPct: 1.0 },
      { symbol: "XAGUSDT", timeframe: "5m (1h range, weekly/daily bias)", trades: 4, winRatePct: 50.0, profitFactor: 2.88, returnPct: 1.4, maxDrawdownPct: 1.1 },
      { symbol: "XRPUSDT", timeframe: "5m (1h range, weekly/daily bias)", trades: 6, winRatePct: 50.0, profitFactor: 1.73, returnPct: 1.8, maxDrawdownPct: 5.3 },
      { symbol: "NAS100", timeframe: "5m (1h range, weekly/daily bias)", period: NAS100_60D, trades: 1, winRatePct: 0.0, profitFactor: 0, returnPct: -0.3, maxDrawdownPct: 0.5 },
    ],
    verdict:
      "All five markets made money in these 6 months, but with only 3–6 trades each, that proves nothing. Over 2 years at 0.059% per side (the fee CoinDCX actually charged on market orders), it made money on 6 of 12 markets: ETH 15 trades, profit factor 2.44, +17.4%; BTC 15 trades, 2.49, +8.4%; NEAR 10 trades, 1.96, +14.4%; AVAX 11 trades, 1.50, +7.0%; gold (11 months) 6 trades, 1.91, +1.3%; XRP 14 trades, 1.07, +0.5%. It lost money on the other six: DOGE −15.9% (profit factor 0.05), AAVE −15.9%, ADA −14.0%, SUI −8.4%, SOL −1.5%, silver −1.0%. It doesn't pass the Signals page's bar on any market. It never reaches 20 trades in 2 years, because most weeks give no bias. Even on BTC and ETH it lost money in the first year and made all of it in the second. The weekly and daily bias did help: without it, the same entries had a profit factor of 0.89 on BTC and 0.76 on ETH. So did the runner: on ETH, taking everything off at the range high made 0.0% instead of +17.4%. Treat it as an unproven idea. If you trade it, stick to BTC and ETH, size small, and don't trade it on DOGE, ADA, AAVE or SUI. NAS100 gave a single trade in 58 days, a loser (−0.3%).",
  },
};
