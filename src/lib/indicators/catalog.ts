// Indicators shipped in /tradingview (Pine v6) and /mt5 (MQL5). Each is a port
// of the strategy's code with the same defaults, so the chart marks the same
// trades the backtest measures. "playbook" indicators belong to an active
// Playbook setup; "retired" ones to setups that failed the MT5 re-test.

export interface IndicatorInfo {
  id: string;
  file: string; // Pine script under /tradingview
  mt5File?: string; // MQL5 indicator under /mt5
  status: "playbook" | "retired";
  title: string;
  strategy: string; // registry key
  guide: string; // /guides/<key>
  bestOn: string;
  backtest?: string; // plain-English result, same settings as the research runs
  steps: { label: string; text: string }[];
}

export const INDICATORS: IndicatorInfo[] = [
  {
    id: "macd-200ema-sr",
    file: "macd-200ema-sr-checkpoints.pine",
    mt5File: "PB_MACD200EMA_SR.mq5",
    status: "playbook",
    title: "MACD + 200 EMA + S/R checkpoints",
    strategy: "macd-200ema-sr",
    guide: "/guides/macd-200ema-sr",
    bestOn: "NAS100 4h. Put it on a 1h chart: it builds the app's UTC 4h candles itself",
    backtest: "Playbook setup. 44 trades on MT5 NAS100 since 2020, profit factor 2.14, +0.47R per trade.",
    steps: [
      { label: "1 Trend", text: "The 4h candle closes above the 200 EMA for longs, below it for shorts." },
      { label: "2 Level", text: "Support is a swing low lower than the 5 candles on each side, removed once a candle closes below it. Resistance is the mirror." },
      { label: "3 Touch", text: "A 4h candle closing above the EMA has its low at or below a live support (small dot)." },
      { label: "4 Buy", text: "Within 10 candles of the touch, MACD (12, 26, 9) crosses up with both lines below zero. Stop at the 200 EMA, target 1.5 × the risk. Sells are the mirror." },
    ],
  },
  {
    id: "smc",
    file: "smc-checkpoints.pine",
    mt5File: "PB_SMC.mq5",
    status: "playbook",
    title: "Smart Money Concepts checkpoints",
    strategy: "smc",
    guide: "/guides/smc",
    bestOn: "XAUUSD 4h and FTSE100 4h. Put it on a 1h chart: it builds the app's UTC 4h candles itself",
    backtest: "Playbook setups. 56 trades on MT5 gold since 2020, profit factor 1.56; 27 trades on MT5 FTSE 100 since July 2023, profit factor 3.03 (a small sample).",
    steps: [
      { label: "1 Sweep", text: "A 4h low dips below the latest swing low and closes no more than 0.2% below it." },
      { label: "2 CHoCH", text: "Within 40 candles, a close above the swing high that was latest at the sweep." },
      { label: "3 FVG", text: "Every bullish fair value gap in the last 7 candles is boxed. A gap lives 60 candles, or until a close below its bottom." },
      { label: "4 Buy", text: "A later candle's low reaches the gap's middle and it closes at or above the gap's bottom. Stop under the lower of the gap and the sweep low (−0.2%), target the latest swing high or 3R, whichever is further. Sells are the mirror." },
    ],
  },
  {
    id: "sr-sweep-trendline",
    file: "sr-sweep-trendline-checkpoints.pine",
    mt5File: "PB_SRSweepTrendline.mq5",
    status: "playbook",
    title: "S/R Sweep + Trend-Line Break checkpoints",
    strategy: "sr-sweep-trendline",
    guide: "/guides/sr-sweep-trendline",
    bestOn: "NAS100 1h",
    backtest:
      "Playbook setup. 84 trades on MT5 NAS100 1h since 2020, profit factor 2.57, +71R. With the hourly candles shifted to start at :15, :30 or :45 it made 1.20–1.46, so expect nearer 1.3 live.",
    steps: [
      { label: "1 Level", text: "Two swing lows within 0.25 × ATR, at most 100 candles apart, nothing lower between them. Support is the lower one." },
      { label: "2 Sweep", text: "A low trades below the level, then a candle closes back above it within 3 candles." },
      { label: "3 Trend line", text: "Through the last two falling swing highs at or before the sweep candle, extended to the right." },
      { label: "4 Buy", text: "Within 48 candles, a green candle with a body of at least 1 ATR closes above the line and the 200 EMA. Stop 0.1 ATR under the lowest low since the sweep, target 3R. Sells are the mirror." },
    ],
  },
  {
    id: "liquidity-reversal",
    file: "liquidity-reversal-checkpoints.pine",
    mt5File: "PB_LiquidityReversal.mq5",
    status: "playbook",
    title: "Liquidity Reversal checkpoints",
    strategy: "liquidity-reversal",
    guide: "/guides/liquidity-reversal",
    bestOn: "EURUSD 1h",
    backtest: "Playbook setup. 124 trades on MT5 EURUSD since 2020, profit factor 1.23.",
    steps: [
      { label: "1 Equal lows", text: "Two swing lows within 0.1 × ATR, at most 100 candles apart, nothing lower between them." },
      { label: "2 Sweep", text: "A wick trades below the level." },
      { label: "3 Shift", text: "A candle closes above the last swing high before the sweep low, within 48 candles." },
      { label: "4 Zone", text: "The last red candle at or before the sweep low, from its open down to the sweep low." },
      { label: "5 Buy", text: "Price wicks into the zone, then a candle closes back above it. Stop under the sweep low, target the nearest untouched swing high paying at least 2R." },
    ],
  },
  {
    id: "liquidity-reversal-mtf",
    file: "liquidity-reversal-mtf-checkpoints.pine",
    status: "retired",
    title: "Liquidity Reversal MTF checkpoints (1h setup, 5m entry)",
    strategy: "liquidity-reversal-mtf",
    guide: "/guides/liquidity-reversal-mtf",
    bestOn: "ETHUSD on a 5m chart (it builds the 1h setup itself)",
    backtest:
      "Retired: lost money on 6.5 years of MT5 5m data (BTC profit factor 0.81 over 77 trades, ETH 0.88 over 70). Kept for reference only.",
    steps: [
      { label: "1–4 on 1h", text: "The Liquidity Reversal setup on 1h candles: equal lows, sweep, a 1h close above the last swing high, then the 1h demand zone." },
      { label: "5 Pullback", text: "A 5m candle dips into the 1h zone. The indicator tracks the lowest 5m low of that dip." },
      { label: "6 Buy", text: "A 5m candle closes above the last 5m swing high formed between the 1h shift and that low. Stop under the 1h sweep low (not the 5m low), target the nearest untouched 1h swing high paying at least 2R. One trade per zone; the zone dies after 24 hours or on a close below the sweep low." },
    ],
  },
  {
    id: "liquidity-sweep",
    file: "liquidity-sweep-checkpoints.pine",
    status: "retired",
    title: "Liquidity Sweep checkpoints",
    strategy: "liquidity-sweep",
    guide: "/guides/liquidity-sweep",
    bestOn: "ETHUSD 1h",
    backtest: "Retired: profit factor 0.90 on ETH MT5 1h bars since 2020 (it lost money). Kept for reference only.",
    steps: [
      { label: "1 Trend leg", text: "A close beyond the latest swing starts a leg. The most adverse candle since that swing is the protected level and the zone." },
      { label: "2 Equal lows", text: "Two swing lows inside the leg within 0.1 × ATR." },
      { label: "3 Sweep", text: "A wick trades below them." },
      { label: "4 Buy", text: "Price reaches the zone, then a candle closes back above it. Stop under the protected low, target the leg's high, only if it pays at least 2R. One trade per leg." },
      { label: "Alerts", text: "Every stage alerts on its candle close: leg started, equal lows formed, sweep, price in the zone, entry (or skipped under 2R). Use one “Any alert() function call” alert for all of them with prices." },
    ],
  },
];
