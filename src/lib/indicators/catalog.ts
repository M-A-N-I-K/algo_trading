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
  steps: { label: string; text: string }[];
}

export const INDICATORS: IndicatorInfo[] = [
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
    ],
  },
];
