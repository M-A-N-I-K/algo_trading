// Indicators shipped in /tradingview (Pine v6) and /mt5 (MQL5). Each is a port
// of the strategy's code with the same defaults, so the chart marks the same
// trades the backtest measures. "playbook" indicators belong to an active
// Playbook setup; "retired" ones to setups that failed the MT5 re-test.

export interface IndicatorInfo {
  id: string;
  file?: string; // Pine indicator under /tradingview
  strategyFile?: string; // Pine strategy (Strategy Tester) under /tradingview
  strategySettings?: string; // what to change per market in the strategy's settings
  mt5File?: string; // MQL5 indicator under /mt5
  mt5EaFile?: string; // MQL5 Expert Advisor under /mt5, for MT5's Strategy Tester
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
    strategyFile: "macd-200ema-sr-strategy.pine",
    strategySettings: "NAS100 on a 1h chart: keep the defaults (target 2, commission 0.0031).",
    mt5File: "PB_MACD200EMA_SR.mq5",
    mt5EaFile: "PB_MACD200EMA_SR_EA.mq5",
    status: "playbook",
    title: "MACD + 200 EMA + S/R checkpoints",
    strategy: "macd-200ema-sr",
    guide: "/guides/macd-200ema-sr",
    bestOn: "NAS100 4h. Put it on a 1h chart: it builds the app's UTC 4h candles itself",
    backtest: "Playbook setup at a 2R target (the strategy's own is 1.5R). 38 trades on MT5 NAS100 since 2020, profit factor 1.98, +0.50R per trade; it held on MT5's own 4h candles and on 4h candles starting 1, 2 or 3 hours later.",
    steps: [
      { label: "1 Trend", text: "The 4h candle closes above the 200 EMA for longs, below it for shorts." },
      { label: "2 Level", text: "Support is a swing low lower than the 5 candles on each side, removed once a candle closes below it. Resistance is the mirror." },
      { label: "3 Touch", text: "A 4h candle closing above the EMA has its low at or below a live support (small dot)." },
      { label: "4 Buy", text: "Within 10 candles of the touch, MACD (12, 26, 9) crosses up with both lines below zero. Stop at the 200 EMA, target 2 × the risk (the Playbook's target; the strategy's own is 1.5). Sells are the mirror." },
    ],
  },
  {
    id: "smc",
    file: "smc-checkpoints.pine",
    strategyFile: "smc-strategy.pine",
    strategySettings: "1h chart. Gold: defaults (commission 0.0043). FTSE 100: set the commission to 0.0062 in Properties.",
    mt5File: "PB_SMC.mq5",
    mt5EaFile: "PB_SMC_EA.mq5",
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
    strategyFile: "sr-sweep-trendline-strategy.pine",
    strategySettings: "NAS100 on a 1h chart: defaults (target 3, commission 0.0031). ETH on a 4h chart: target 1.5, commission 0.0512.",
    mt5File: "PB_SRSweepTrendline.mq5",
    mt5EaFile: "PB_SRSweepTrendline_EA.mq5",
    status: "playbook",
    title: "S/R Sweep + Trend-Line Break checkpoints",
    strategy: "sr-sweep-trendline",
    guide: "/guides/sr-sweep-trendline",
    bestOn: "NAS100 1h (target 3R) and ETHUSD 4h (set the target to 1.5R)",
    backtest:
      "Playbook setups. 84 trades on MT5 NAS100 1h since 2020, profit factor 2.57, +71R; with the hourly candles shifted to start at :15, :30 or :45 it made 1.20–1.46, so expect nearer 1.3 live. ETH 4h at 1.5R: 30 trades since 2020, profit factor 2.83 (a small sample).",
    steps: [
      { label: "1 Level", text: "Two swing lows within 0.25 × ATR, at most 100 candles apart, nothing lower between them. Support is the lower one." },
      { label: "2 Sweep", text: "A low trades below the level, then a candle closes back above it within 3 candles." },
      { label: "3 Trend line", text: "Through the last two falling swing highs at or before the sweep candle, extended to the right." },
      { label: "4 Buy", text: "Within 48 candles, a green candle with a body of at least 1 ATR closes above the line and the 200 EMA. Stop 0.1 ATR under the lowest low since the sweep, target 3R (1.5R on ETH 4h). Sells are the mirror." },
    ],
  },
  {
    id: "liquidity-reversal",
    file: "liquidity-reversal-checkpoints.pine",
    strategyFile: "liquidity-reversal-strategy.pine",
    strategySettings: "S&P 500 on a 4h chart: fixed target 2 (commission 0.0037 is the default). GBP/USD 1h: fixed target 2, commission 0.0057. EUR/USD 1h: fixed target 0, commission 0.0031.",
    mt5File: "PB_LiquidityReversal.mq5",
    mt5EaFile: "PB_LiquidityReversal_EA.mq5",
    status: "playbook",
    title: "Liquidity Reversal checkpoints",
    strategy: "liquidity-reversal",
    guide: "/guides/liquidity-reversal",
    bestOn: "EURUSD 1h; GBPUSD 1h and SPX500 4h with the fixed target set to 2",
    backtest: "Playbook setups. 124 trades on MT5 EURUSD since 2020, profit factor 1.23. At a fixed 2R target: GBPUSD 1h 134 trades, profit factor 1.38; SPX500 4h 34 trades, profit factor 1.73.",
    steps: [
      { label: "1 Equal lows", text: "Two swing lows within 0.1 × ATR, at most 100 candles apart, nothing lower between them." },
      { label: "2 Sweep", text: "A wick trades below the level." },
      { label: "3 Shift", text: "A candle closes above the last swing high before the sweep low, within 48 candles." },
      { label: "4 Zone", text: "The last red candle at or before the sweep low, from its open down to the sweep low." },
      { label: "5 Buy", text: "Price wicks into the zone, then a candle closes back above it. Stop under the sweep low, target the nearest untouched swing high paying at least 2R. On GBPUSD and SPX500 the Playbook takes exactly 2R instead (only when such a swing exists)." },
    ],
  },
  {
    id: "ema833-zones",
    strategyFile: "ema833-zones-strategy.pine",
    strategySettings: "1h chart. Gold: defaults (commission 0.0043). NAS100: commission 0.0031. ETH: commission 0.0512.",
    mt5EaFile: "PB_EMA833Zones_EA.mq5",
    status: "playbook",
    title: "8/33 EMA + Swing Zones",
    strategy: "ema833-zones",
    guide: "/guides/ema833-zones",
    bestOn: "XAUUSD, NAS100 and ETHUSD 1h, London or New York hours. In the EA set Trail = true and Session = London or NY",
    backtest:
      "Playbook setups at a quarter of the usual risk. App backtest on MT5 1h bars since 2020: gold 135 trades, profit factor 1.51; NAS100 177, 1.23; ETH 165, 1.17. MT5 Strategy Tester: gold 1.33, NAS100 1.10. Found by testing many versions; the video's 5m version lost on every market.",
    steps: [
      { label: "1 Trend", text: "EMA 8 above EMA 33 and the candle closes above both." },
      { label: "2 Candle", text: "A green candle with a body of at least 0.6 of its range closes above the previous candle's high, and it (or the candle before) touched the 8 EMA." },
      { label: "3 Room", text: "No 100-candle high and no swing high or low (3 candles each side, last 200 candles) between entry and 3R + 0.25R." },
      { label: "4 Buy", text: "Only if the candle closes in London (08:00–16:30) or New York (08:00–17:00) hours. Stop at the lowest low of the last 5 candles. At 3R move the stop to 2R, at 4R to 3R, and so on. Sells are the mirror." },
    ],
  },
  {
    id: "ny-inside-bar",
    file: "ny-inside-bar-checkpoints.pine",
    strategyFile: "ny-inside-bar-strategy.pine",
    strategySettings: "15-minute chart. NAS100: defaults (commission 0.0031). S&P 500: set the commission to 0.0037 in Properties.",
    mt5File: "PB_NYInsideBar.mq5",
    mt5EaFile: "PB_NYInsideBar_EA.mq5",
    status: "retired",
    title: "NY Inside Bar",
    strategy: "ny-inside-bar",
    guide: "/guides/ny-inside-bar",
    bestOn: "NAS100 15m and SPX500 15m. Times are New York's, daylight saving included",
    backtest:
      "Retired: loses money. MT5's Strategy Tester placing its real orders on NDX100 since 2020 made 1,696 trades, profit factor 1.06 (the app had shown 1.31 by cancelling orders a real stop order fills). With that fixed: NAS100 0.90 over 1,877 trades, SPX500 0.78. Kept for study; the EA is here to reproduce the test.",
    steps: [
      { label: "1 Bias", text: "The 09:30 and 09:45 New York candles: the 09:45 close above the 09:30 open means buys only today, below means sells only." },
      { label: "2 Inside", text: "After 10:00, a candle whose body (open to close) sits inside the previous candle's body. Wicks don't count here; any colour." },
      { label: "3 Order", text: "Buy stop at the inside candle's high (sell stop at its low) for the next 3 candles. Cancel it if price reaches the other side first; a newer inside candle replaces it. A candle that reaches both fills." },
      { label: "4 Trade", text: "Stop beyond both candles' wicks, target 1:1. At most 2 trades a day, one at a time, no fills after 15:00, everything closed at 16:00 New York time." },
      { label: "Alerts", text: "The indicator alerts on each candle close: the day's side, the stop order to place (with stop, target and cancel level), the fill and the exit. In TradingView use one “Any alert() function call” alert on a 15m chart for all of them with prices." },
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
