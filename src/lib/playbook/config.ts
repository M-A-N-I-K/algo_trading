// The playbook: the only setups this account trades, and the rules around
// them. Every number here comes from a backtest, not from opinion:
//
// - Setups: the strategy/market pairs that held up over 2 years (Nov 2024 to
//   Nov 2026; gold 11 months, silver 10) at prop-firm costs (crypto 0.06%,
//   metals 0.02%, forex 0.01% per side), with at least 20 trades, profit
//   factor 1.3 or more and a profit in both halves. Picked from about 174
//   strategy/market/timeframe pairs, so expect live results to be worse.
// - Rules: replaying those trades as one $5,000 account, at 0.5% risk and at
//   most 4 trades open, the worst drawdown was 6% and no Monday start in 100
//   touched the 4% daily or 12% total loss limit, even counting every open
//   trade as stopped out. At 1% risk half the starts hit the daily limit.
// - Grades (src/lib/plan/weeklyPlan.ts): A-grade trades made profit factor
//   2.10 against 1.44 for B-grade; on currency pairs B-grade lost (0.72).

export interface PlaybookAccount {
  name: string;
  size: number; // starting balance, $
  maxLossPct: number; // static: equity may never touch size × (1 − this)
  dailyLossPct: number; // of the day's opening balance
  targetPct: number; // profit target of the current phase
  timeZone: string; // the firm's day boundary (00:00 platform time)
}

export const PLAYBOOK_ACCOUNT: PlaybookAccount = {
  name: "FundingPips 2-Step Flex",
  size: 5000,
  maxLossPct: 12,
  dailyLossPct: 4,
  targetPct: 10,
  // Platform time is UTC+2 in winter and UTC+3 in summer, the EU switch dates.
  timeZone: "Europe/Athens",
};

export const PLAYBOOK_RULES = {
  riskPctA: 0.5, // % of the starting balance on an A-grade trade
  riskPctB: 0.25, // half size on B-grade, or when there's no grade
  maxOpen: 4, // trades open at once
  dailyStopPct: 2, // own daily stop: half the firm's limit
  skipBOnForex: true, // B-grade currency trades lost money in the backtest
  riskTolerance: 1.05, // rounding to a lot size may add up to 5%
  chaseR: 0.25, // entering more than this many R from the signal is chasing
  rolloverMinutes: 30, // either side of 00:00 platform time, spreads widen
} as const;

export interface SetupBaseline {
  trades: number;
  winRatePct: number;
  avgR: number; // net of costs
  profitFactor: number; // on R
  perWeek: number;
  maxDrawdownR: number; // worst peak-to-trough, in R
  maxLossStreak: number;
  weeks: number; // how much history the numbers cover
}

export interface PlaybookSetup {
  id: string; // `${strategy}:${symbol}:${interval}`, as on the Signals page
  symbol: string; // data symbol in this app
  platformSymbol: string; // what the prop firm calls it
  strategy: string; // key in src/strategies/registry.ts
  strategyName: string;
  interval: string;
  baseline: SetupBaseline;
}

const setup = (symbol: string, platformSymbol: string, strategy: string, strategyName: string, interval: string, baseline: SetupBaseline): PlaybookSetup => ({
  id: `${strategy}:${symbol}:${interval}`,
  symbol,
  platformSymbol,
  strategy,
  strategyName,
  interval,
  baseline,
});

// Ordered by average R, best first: when two signals compete for the last
// slot at the same grade, take the one higher up.
export const PLAYBOOK_SETUPS: PlaybookSetup[] = [
  setup("ETHUSDT", "ETHUSD", "liquidity-sweep", "Liquidity Sweep", "1h", { trades: 26, winRatePct: 50, avgR: 1.26, profitFactor: 3.33, perWeek: 0.26, maxDrawdownR: 5.5, maxLossStreak: 5, weeks: 99 }),
  setup("ETHUSDT", "ETHUSD", "liquidity-reversal-mtf", "Liquidity Reversal MTF", "5m", { trades: 21, winRatePct: 52.4, avgR: 0.87, profitFactor: 2.68, perWeek: 0.22, maxDrawdownR: 3.3, maxLossStreak: 3, weeks: 93 }),
  setup("XAUUSDT", "XAUUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 23, winRatePct: 39.1, avgR: 0.78, profitFactor: 2.14, perWeek: 0.54, maxDrawdownR: 4.4, maxLossStreak: 4, weeks: 42 }),
  setup("BTCUSDT", "BTCUSD", "smc", "Smart Money Concepts", "4h", { trades: 29, winRatePct: 37.9, avgR: 0.75, profitFactor: 2.14, perWeek: 0.29, maxDrawdownR: 5.3, maxLossStreak: 5, weeks: 100 }),
  setup("USDJPY", "USDJPY", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 39, winRatePct: 43.6, avgR: 0.67, profitFactor: 2.07, perWeek: 0.39, maxDrawdownR: 6.6, maxLossStreak: 6, weeks: 101 }),
  setup("XAGUSDT", "XAGUSD", "smc", "Smart Money Concepts", "1h", { trades: 41, winRatePct: 36.6, avgR: 0.52, profitFactor: 1.78, perWeek: 1.0, maxDrawdownR: 5.2, maxLossStreak: 5, weeks: 41 }),
  setup("EURUSD", "EURUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 25, winRatePct: 40, avgR: 0.39, profitFactor: 1.58, perWeek: 0.24, maxDrawdownR: 8.1, maxLossStreak: 7, weeks: 103 }),
  setup("BTCUSDT", "BTCUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 45, winRatePct: 37.8, avgR: 0.29, profitFactor: 1.42, perWeek: 0.45, maxDrawdownR: 6.7, maxLossStreak: 6, weeks: 99 }),
  setup("BTCUSDT", "BTCUSD", "liquidity-reversal-mtf", "Liquidity Reversal MTF", "5m", { trades: 25, winRatePct: 40, avgR: 0.28, profitFactor: 1.41, perWeek: 0.26, maxDrawdownR: 3.5, maxLossStreak: 3, weeks: 98 }),
  setup("BTCUSDT", "BTCUSD", "session-london-bos", "Session London BOS", "1h", { trades: 84, winRatePct: 44, avgR: 0.27, profitFactor: 1.46, perWeek: 0.81, maxDrawdownR: 5.4, maxLossStreak: 5, weeks: 104 }),
  setup("GBPUSD", "GBPUSD", "smc", "Smart Money Concepts", "1h", { trades: 52, winRatePct: 30.8, avgR: 0.21, profitFactor: 1.29, perWeek: 0.54, maxDrawdownR: 7.4, maxLossStreak: 7, weeks: 97 }),
  setup("ETHUSDT", "ETHUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 46, winRatePct: 34.8, avgR: 0.17, profitFactor: 1.25, perWeek: 0.45, maxDrawdownR: 5.4, maxLossStreak: 5, weeks: 103 }),
  setup("XAUUSDT", "XAUUSD", "macd-200ema-sr", "MACD + 200 EMA + S/R", "1h", { trades: 28, winRatePct: 46.4, avgR: 0.12, profitFactor: 1.21, perWeek: 0.64, maxDrawdownR: 4.9, maxLossStreak: 3, weeks: 44 }),
];

export const PLAYBOOK_SETUP_IDS: ReadonlySet<string> = new Set(PLAYBOOK_SETUPS.map((s) => s.id));
export const setupById = (id: string) => PLAYBOOK_SETUPS.find((s) => s.id === id);

// Contract size of one lot on the platform, in units of the base asset.
// Standard MT5 specs; check your platform's symbol specification.
export function lotUnits(symbol: string): number {
  if (symbol.startsWith("XAU")) return 100; // ounces
  if (symbol.startsWith("XAG")) return 5000; // ounces
  if (symbol.startsWith("BTC") || symbol.startsWith("ETH")) return 1; // coins
  return 100_000; // currency pairs
}

// Mistakes a closed trade can be tagged with, so the scorecard can say which
// habit costs the most.
export const MISTAKES = [
  { id: "moved-stop", label: "Moved or removed the stop" },
  { id: "closed-early", label: "Closed before stop or target" },
  { id: "late-entry", label: "Entered late or chased" },
  { id: "oversized", label: "Risked more than the plan" },
  { id: "not-in-playbook", label: "Not a playbook signal" },
  { id: "revenge", label: "Revenge or boredom trade" },
  { id: "news", label: "Traded into news" },
] as const;

// Checks the trader ticks by hand: the app can't see these.
export const MANUAL_CHECKS = [
  { id: "news", label: "No high-impact news on this market in the next 30 minutes" },
  { id: "stop-placed", label: "Stop loss is placed on the platform, not just planned" },
  { id: "size-matches", label: "Position size on the platform matches the size here" },
  { id: "calm", label: "Taking it because it's a signal, not to win back a loss" },
] as const;
