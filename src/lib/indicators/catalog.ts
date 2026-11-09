// TradingView indicators shipped in /tradingview, one per liquidity strategy.
// Each is a Pine v6 port of the strategy's code with the same defaults, so the
// chart marks the same trades the backtest measures.

export interface IndicatorInfo {
  id: string;
  file: string; // under /tradingview
  title: string;
  strategy: string; // registry key
  guide: string; // /guides/<slug>
  bestOn: string;
  backtest?: string; // plain-English result, same settings as the research runs
  steps: { label: string; text: string }[];
}

export const INDICATORS: IndicatorInfo[] = [
  {
    id: "liquidity-reversal-mtf",
    file: "liquidity-reversal-mtf-checkpoints.pine",
    title: "Liquidity Reversal MTF checkpoints (1h setup, 5m entry)",
    strategy: "liquidity-reversal-mtf",
    guide: "/guides/liquidity-reversal-mtf",
    bestOn: "ETHUSD on a 5m chart (it builds the 1h setup itself)",
    backtest:
      "The only lower-timeframe strategy that made money on ETH: 21 trades in 2 years (about one every 5 weeks), 52% won, +0.87R per trade, profit factor 2.68. Closing every trade by 21:00 UTC, as the funded account forces, it still made profit factor 3.08 on 17 trades. Trades last about a day, because the target is a 1h swing.",
    steps: [
      { label: "1–4 on 1h", text: "The Liquidity Reversal setup on 1h candles: equal lows, sweep, a 1h close above the last swing high, then the 1h demand zone." },
      { label: "5 Pullback", text: "A 5m candle dips into the 1h zone. The indicator tracks the lowest 5m low of that dip." },
      { label: "6 Buy", text: "A 5m candle closes above the last 5m swing high formed between the 1h shift and that low. Stop under the 1h sweep low (not the 5m low), target the nearest untouched 1h swing high paying at least 2R. One trade per zone; the zone dies after 24 hours or on a close below the sweep low." },
    ],
  },
  {
    id: "liquidity-reversal",
    file: "liquidity-reversal-checkpoints.pine",
    title: "Liquidity Reversal checkpoints",
    strategy: "liquidity-reversal",
    guide: "/guides/liquidity-reversal",
    bestOn: "XAUUSD 1h (also BTC, ETH, EURUSD, USDJPY in the Playbook)",
    steps: [
      { label: "1 Equal lows", text: "Two swing lows within 0.1 × ATR, at most 100 candles apart, nothing lower between them." },
      { label: "2 Sweep", text: "A wick trades below the level." },
      { label: "3 Shift", text: "A candle closes above the last swing high before the sweep low, within 48 candles." },
      { label: "4 Zone", text: "The last red candle at or before the sweep low, from its open down to the sweep low." },
      { label: "5 Buy", text: "Price wicks into the zone, then a candle closes back above it. Stop under the sweep low, target the nearest untouched swing high paying at least 2R." },
    ],
  },
  {
    id: "liquidity-sweep",
    file: "liquidity-sweep-checkpoints.pine",
    title: "Liquidity Sweep checkpoints",
    strategy: "liquidity-sweep",
    guide: "/guides/liquidity-sweep",
    bestOn: "ETHUSD 1h (the Playbook's top setup)",
    steps: [
      { label: "1 Trend leg", text: "A close beyond the latest swing starts a leg. The most adverse candle since that swing is the protected level and the zone." },
      { label: "2 Equal lows", text: "Two swing lows inside the leg within 0.1 × ATR." },
      { label: "3 Sweep", text: "A wick trades below them." },
      { label: "4 Buy", text: "Price reaches the zone, then a candle closes back above it. Stop under the protected low, target the leg's high, only if it pays at least 2R. One trade per leg." },
      { label: "Alerts", text: "Every stage alerts on its candle close: leg started, equal lows formed, sweep, price in the zone, entry (or skipped under 2R). Use one “Any alert() function call” alert for all of them with prices." },
    ],
  },
];
