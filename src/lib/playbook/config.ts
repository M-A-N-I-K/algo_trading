// The playbook: the only setups these accounts trade, and the rules around
// them. Every number here comes from a backtest, not from opinion:
//
// - Setups: the strategy/market pairs that held up over 2 years (Nov 2024 to
//   Nov 2026; gold 11 months, silver 10) at prop-firm costs (crypto 0.06%,
//   metals 0.02%, forex 0.01% per side), with at least 20 trades, profit
//   factor 1.3 or more and a profit in both halves. Picked from about 174
//   strategy/market/timeframe pairs, so expect live results to be worse.
//   The NAS100 and EUR/USD setups marked "MT5" passed the same test on the
//   platform's own bars (MT5 export, Jan 2025 – Nov 2026, 97 weeks) at its
//   measured costs: every scannable strategy/timeframe on both markets,
//   48 pairs, 3 new setups passed (EUR/USD Liquidity Reversal 1h passed too).
//   "MT5 6.5y" setups passed on 1h and 4h exports from May 2020 (340 weeks),
//   which also overrule the 22-month test: NAS100 SMC 1h (PF 1.10, first half
//   lost) and EUR/USD SMC 1h (PF 1.16, first half lost) were taken out again,
//   and NAS100 SMC 4h (PF 3.82 over 22 months) fell to 1.04 there.
// - Rules: replaying those trades as one $5,000 account, at 0.5% risk and at
//   most 4 trades open, the worst drawdown was 6% and no Monday start in 100
//   touched the 4% daily or 12% total loss limit, even counting every open
//   trade as stopped out. At 1% risk with 4 open, half the starts hit the
//   daily limit, so the accounts below that risk more cap open trades at 2
//   and require that closed losses plus open risk stay inside the own daily
//   stop.
// - Grades (src/lib/plan/weeklyPlan.ts): A-grade trades made profit factor
//   2.10 against 1.44 for B-grade; on currency pairs B-grade lost (0.72).

export interface PlaybookRules {
  riskPctA: number; // % of the starting balance on an A-grade trade
  riskPctB: number | null; // B-grade or ungraded trades; null = take A-grade only
  maxOpen: number; // trades open at once
  dailyStopPct: number; // own daily stop, % of the starting balance: half the firm's limit
  maxLossesPerDay: number; // stop for the day after this many losing trades
  skipBOnForex: boolean; // B-grade currency trades lost money in the backtest
  riskTolerance: number; // rounding to a lot size may add up to 5%
  chaseR: number; // entering more than this many R from the signal is chasing
  rolloverMinutes: number; // either side of 00:00 platform time, spreads widen
}

export interface PlaybookAccount {
  id: string; // stored on each PlaybookTrade
  name: string;
  size: number; // starting balance, $
  maxLossPct: number; // static: equity may never touch size × (1 − this)
  dailyLossPct: number; // of the day's opening balance
  targetPct: number; // profit target of the current phase
  timeZone: string; // the firm's day boundary (00:00 platform time)
  // P&L made on the platform before trades were logged here, so the balance
  // matches the platform's. Set per user from the page (User.playbookPriorPnls).
  priorPnl: number;
  rules: PlaybookRules;
}

const SHARED_RULES = {
  maxOpen: 2,
  maxLossesPerDay: 2,
  skipBOnForex: true,
  riskTolerance: 1.05,
  chaseR: 0.25,
  rolloverMinutes: 30,
};

// Platform time is UTC+2 in winter and UTC+3 in summer, the EU switch dates.
const FUNDINGPIPS_TZ = "Europe/Athens";

// Limits as the FundingPips dashboard shows them (10 Nov 2026). Risk sizes
// from a Monte Carlo of the setups' baselines: by 30 Nov, Flex at 1% passes
// about 46% of the time and Pro at 0.75% about 57%, each with a breach
// chance of 5% or less (half that pass rate if live trading earns half the
// backtest's edge). The Pro's static loss is only 8R, so it skips B-grade.
export const PLAYBOOK_ACCOUNTS: readonly PlaybookAccount[] = [
  {
    id: "flex-10k",
    name: "FundingPips $10k 2-Step Flex",
    size: 10_000,
    maxLossPct: 12,
    dailyLossPct: 4,
    targetPct: 10,
    timeZone: FUNDINGPIPS_TZ,
    priorPnl: 0,
    rules: { ...SHARED_RULES, riskPctA: 1, riskPctB: 0.5, dailyStopPct: 2 },
  },
  {
    id: "pro-5k",
    name: "FundingPips $5k 2-Step Pro",
    size: 5_000,
    maxLossPct: 6,
    dailyLossPct: 3,
    targetPct: 6,
    timeZone: FUNDINGPIPS_TZ,
    priorPnl: 0,
    rules: { ...SHARED_RULES, riskPctA: 0.75, riskPctB: null, dailyStopPct: 1.5 },
  },
];

export const PLAYBOOK_ACCOUNT = PLAYBOOK_ACCOUNTS[0];
export const accountById = (id: string | null | undefined) => PLAYBOOK_ACCOUNTS.find((a) => a.id === id);

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
  // MT5 6.5y. A 20% win rate that lives on big winners: the top 5 trades make
  // more than the total, losing runs of 10 are normal, and 2025 lost 11.1R.
  setup("NAS100", "NDX100", "perfect-entry", "Perfect Entry", "1h", { trades: 79, winRatePct: 20.3, avgR: 0.6, profitFactor: 1.74, perWeek: 0.23, maxDrawdownR: 13.6, maxLossStreak: 10, weeks: 340 }),
  // MT5: profit only +6.6R in the second half (+37.1R in the first), so watch it.
  setup("EURUSD", "EURUSD", "liquidity-sweep", "Liquidity Sweep", "15m", { trades: 79, winRatePct: 31.6, avgR: 0.55, profitFactor: 1.76, perWeek: 0.81, maxDrawdownR: 10.6, maxLossStreak: 10, weeks: 97 }),
  setup("XAGUSDT", "XAGUSD", "smc", "Smart Money Concepts", "1h", { trades: 41, winRatePct: 36.6, avgR: 0.52, profitFactor: 1.78, perWeek: 1.0, maxDrawdownR: 5.2, maxLossStreak: 5, weeks: 41 }),
  setup("BTCUSDT", "BTCUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 45, winRatePct: 37.8, avgR: 0.29, profitFactor: 1.42, perWeek: 0.45, maxDrawdownR: 6.7, maxLossStreak: 6, weeks: 99 }),
  setup("BTCUSDT", "BTCUSD", "liquidity-reversal-mtf", "Liquidity Reversal MTF", "5m", { trades: 25, winRatePct: 40, avgR: 0.28, profitFactor: 1.41, perWeek: 0.26, maxDrawdownR: 3.5, maxLossStreak: 3, weeks: 98 }),
  setup("BTCUSDT", "BTCUSD", "session-london-bos", "Session London BOS", "1h", { trades: 84, winRatePct: 44, avgR: 0.27, profitFactor: 1.46, perWeek: 0.81, maxDrawdownR: 5.4, maxLossStreak: 5, weeks: 104 }),
  // MT5 6.5y, 4h. Rare (one signal every 2 months) and nearly flat in the first half
  // (+0.3R, then +10.0R), so judge it on the scorecard before sizing up.
  setup("NAS100", "NDX100", "macd-200ema-sr", "MACD + 200 EMA + S/R", "4h", { trades: 40, winRatePct: 50, avgR: 0.26, profitFactor: 1.51, perWeek: 0.12, maxDrawdownR: 6.1, maxLossStreak: 6, weeks: 340 }),
  setup("GBPUSD", "GBPUSD", "smc", "Smart Money Concepts", "1h", { trades: 52, winRatePct: 30.8, avgR: 0.21, profitFactor: 1.29, perWeek: 0.54, maxDrawdownR: 7.4, maxLossStreak: 7, weeks: 97 }),
  // MT5 6.5y baseline: an original setup whose profit factor fell from 1.58
  // (2 years of Yahoo data) to 1.23 on the platform's bars since 2020. Still
  // profitable in both halves and 6 of 7 years, so it stays, ranked lower.
  setup("EURUSD", "EURUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 124, winRatePct: 30.6, avgR: 0.17, profitFactor: 1.23, perWeek: 0.36, maxDrawdownR: 14.6, maxLossStreak: 10, weeks: 341 }),
  setup("ETHUSDT", "ETHUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 46, winRatePct: 34.8, avgR: 0.17, profitFactor: 1.25, perWeek: 0.45, maxDrawdownR: 5.4, maxLossStreak: 5, weeks: 103 }),
  setup("XAUUSDT", "XAUUSD", "macd-200ema-sr", "MACD + 200 EMA + S/R", "1h", { trades: 28, winRatePct: 46.4, avgR: 0.12, profitFactor: 1.21, perWeek: 0.64, maxDrawdownR: 4.9, maxLossStreak: 3, weeks: 44 }),
];

/** Signals a week across every setup, from the baselines. */
export const PLAYBOOK_SIGNALS_PER_WEEK = PLAYBOOK_SETUPS.reduce((a, s) => a + s.baseline.perWeek, 0);

export const PLAYBOOK_SETUP_IDS: ReadonlySet<string> = new Set(PLAYBOOK_SETUPS.map((s) => s.id));
export const setupById = (id: string) => PLAYBOOK_SETUPS.find((s) => s.id === id);

// Contract size of one lot on the platform, in units of the base asset.
// Standard MT5 specs; check your platform's symbol specification.
export function lotUnits(symbol: string): number {
  const s = symbol.toUpperCase();
  // Index CFDs, measured from the MT5 report's P&L: 0.01 lot of NDX100 lost
  // $14.59 on a 72.93-point move, 0.01 of SPX500 $4.52 on 9.03 points.
  if (s === "NAS100" || s === "NDX100" || s === "US100" || s === "USTEC") return 20;
  if (s === "SPX500" || s === "US500") return 50;
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
