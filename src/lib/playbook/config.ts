import { specFor } from "@/lib/mt5/specs";

// The playbook: the only setups these accounts trade, and the rules around
// them. Every number here comes from a backtest, not from opinion:
//
// - Setups: the strategy/market pairs that held up over 2 years (Nov 2024 to
//   Nov 2026; gold 11 months, silver 10) at prop-firm costs (crypto 0.06%,
//   metals 0.02%, forex 0.01% per side), with at least 20 trades, profit
//   factor 1.3 or more and a profit in both halves. Picked from about 174
//   strategy/market/timeframe pairs, so expect live results to be worse.
// - Re-test (Nov 2026): every setup was run again on the platform's own MT5
//   1h and 4h bars from May 2020 (gold from 2020 too, about 340 weeks) at its
//   measured costs. A setup stays only if it passes the rule above on the 4h
//   grid the scanner uses (UTC) and still makes PF 1.2 with both halves up on
//   MT5's server-time grid. 13 of the original setups failed and are retired
//   below; Gold SMC 4h passed and was added. EUR/USD Liquidity Sweep 15m was
//   dropped on 4 years of 15m bars (PF 1.17, first half lost 22R). On BTC and
//   ETH 5m and 15m bars since 2020 both 5m setups lost and no 15m strategy
//   passed. Silver SMC 1h lost too (PF 0.94), and no silver strategy passed
//   on 5m, 15m, 1h or 4h.
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
  retired?: string; // why it no longer trades
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
  // MT5 6.5y, 4h candles on the UTC grid the scanner uses. On MT5's own
  // server-time 4h grid it made PF 1.51 (+0.3R, then +10.1R), so the edge is
  // real but grid-sensitive. Rare: one signal every 2 months.
  setup("NAS100", "NDX100", "macd-200ema-sr", "MACD + 200 EMA + S/R", "4h", { trades: 44, winRatePct: 59.1, avgR: 0.47, profitFactor: 2.14, perWeek: 0.13, maxDrawdownR: 3.6, maxLossStreak: 3, weeks: 340 }),
  // MT5 6.5y (gold since 2020), UTC 4h grid. Most of the profit came in the
  // first half (+19.5R, then +1.2R) and 2026 so far lost 7.3R; on the MT5
  // server-time grid it made PF 1.44 with both halves up (+11.4R, +7.1R).
  setup("XAUUSDT", "XAUUSD", "smc", "Smart Money Concepts", "4h", { trades: 56, winRatePct: 33.9, avgR: 0.37, profitFactor: 1.56, perWeek: 0.16, maxDrawdownR: 7.3, maxLossStreak: 8, weeks: 358 }),
  // MT5 6.5y, NAS100 1h (Nov 2026, from a YouTube gold method that failed on
  // gold). Picked from 216 rule variants, so it was checked out of sample:
  // the best rules on 2020-23 alone still made +42R from 2023 on. Hourly
  // candles rebuilt to start at :15, :30 and :45 gave PF 1.35, 1.46 and 1.20
  // with both halves up, so the real edge is nearer PF 1.3 than 2.6; ranked
  // below the two 4h setups for that reason.
  setup("NAS100", "NDX100", "sr-sweep-trendline", "S/R Sweep + Trend-Line Break", "1h", { trades: 84, winRatePct: 46.4, avgR: 0.85, profitFactor: 2.57, perWeek: 0.23, maxDrawdownR: 7.1, maxLossStreak: 7, weeks: 358 }),
  // MT5 only: FTSE 100 CFD bars from Jul 2023 (3.3 years), 4h on the UTC grid,
  // at the measured 1.2-point round trip. PF 3.03 with both halves up
  // (+18.5R, +8.4R); on MT5's server-time 4h grid PF 2.20, and all 9
  // neighbouring rule settings made money on both grids. But only 27 trades,
  // short of the 30-plus the other setups have, so the true edge is far less
  // certain than the numbers say: ranked below the longer-tested setups.
  // Scanned only while the MT5 PB_BarFeed service runs (no web source has
  // this CFD); sized from the terminal's own contract spec.
  setup("FTSE100", "FTSE100", "smc", "Smart Money Concepts", "4h", { trades: 27, winRatePct: 51.9, avgR: 1.0, profitFactor: 3.03, perWeek: 0.16, maxDrawdownR: 4.1, maxLossStreak: 4, weeks: 174 }),
  // MT5 6.5y: profit factor fell from 1.58 (2 years of Yahoo data) to 1.24 on
  // the platform's bars since 2020. Profitable in both halves and 6 of 7
  // years, so it stays, ranked lowest.
  setup("EURUSD", "EURUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 124, winRatePct: 30.6, avgR: 0.17, profitFactor: 1.23, perWeek: 0.36, maxDrawdownR: 14.6, maxLossStreak: 10, weeks: 341 }),
];

const retire = (s: PlaybookSetup, retired: string): PlaybookSetup => ({ ...s, retired });

// Setups that failed the re-test on the platform's MT5 bars since 2020. No
// signals, no new trades; kept so trades already logged on them still show
// their setup and scorecard history. Baselines are the original ones.
export const RETIRED_SETUPS: PlaybookSetup[] = [
  retire(setup("ETHUSDT", "ETHUSD", "liquidity-sweep", "Liquidity Sweep", "1h", { trades: 26, winRatePct: 50, avgR: 1.26, profitFactor: 3.33, perWeek: 0.26, maxDrawdownR: 5.5, maxLossStreak: 5, weeks: 99 }), "PF 0.90 on MT5 bars since 2020"),
  retire(setup("XAUUSDT", "XAUUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 23, winRatePct: 39.1, avgR: 0.78, profitFactor: 2.14, perWeek: 0.54, maxDrawdownR: 4.4, maxLossStreak: 4, weeks: 42 }), "PF 0.64, lost 30.7R on MT5 bars since 2020"),
  retire(setup("BTCUSDT", "BTCUSD", "smc", "Smart Money Concepts", "4h", { trades: 29, winRatePct: 37.9, avgR: 0.75, profitFactor: 2.14, perWeek: 0.29, maxDrawdownR: 5.3, maxLossStreak: 5, weeks: 100 }), "PF 0.76 on MT5 bars since 2020"),
  retire(setup("USDJPY", "USDJPY", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 39, winRatePct: 43.6, avgR: 0.67, profitFactor: 2.07, perWeek: 0.39, maxDrawdownR: 6.6, maxLossStreak: 6, weeks: 101 }), "PF 0.82 on MT5 bars since 2020"),
  retire(setup("NAS100", "NDX100", "perfect-entry", "Perfect Entry", "1h", { trades: 79, winRatePct: 20.3, avgR: 0.6, profitFactor: 1.74, perWeek: 0.23, maxDrawdownR: 13.6, maxLossStreak: 10, weeks: 340 }), "PF 1.74 on UTC hours but 0.98 on MT5 server hours: too fragile"),
  retire(setup("BTCUSDT", "BTCUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 45, winRatePct: 37.8, avgR: 0.29, profitFactor: 1.42, perWeek: 0.45, maxDrawdownR: 6.7, maxLossStreak: 6, weeks: 99 }), "PF 1.01 on MT5 bars since 2020"),
  retire(setup("BTCUSDT", "BTCUSD", "session-london-bos", "Session London BOS", "1h", { trades: 84, winRatePct: 44, avgR: 0.27, profitFactor: 1.46, perWeek: 0.81, maxDrawdownR: 5.4, maxLossStreak: 5, weeks: 104 }), "PF 1.08 on MT5 bars since 2020, first half lost"),
  retire(setup("GBPUSD", "GBPUSD", "smc", "Smart Money Concepts", "1h", { trades: 52, winRatePct: 30.8, avgR: 0.21, profitFactor: 1.29, perWeek: 0.54, maxDrawdownR: 7.4, maxLossStreak: 7, weeks: 97 }), "PF 1.01 on MT5 bars since 2020, second half lost"),
  retire(setup("ETHUSDT", "ETHUSD", "liquidity-reversal", "Liquidity Reversal", "1h", { trades: 46, winRatePct: 34.8, avgR: 0.17, profitFactor: 1.25, perWeek: 0.45, maxDrawdownR: 5.4, maxLossStreak: 5, weeks: 103 }), "PF 0.88 on MT5 bars since 2020"),
  retire(setup("XAGUSDT", "XAGUSD", "smc", "Smart Money Concepts", "1h", { trades: 41, winRatePct: 36.6, avgR: 0.52, profitFactor: 1.78, perWeek: 1.0, maxDrawdownR: 5.2, maxLossStreak: 5, weeks: 41 }), "PF 0.94 over 223 trades on MT5 bars since 2020"),
  retire(setup("ETHUSDT", "ETHUSD", "liquidity-reversal-mtf", "Liquidity Reversal MTF", "5m", { trades: 21, winRatePct: 52.4, avgR: 0.87, profitFactor: 2.68, perWeek: 0.22, maxDrawdownR: 3.3, maxLossStreak: 3, weeks: 93 }), "PF 0.88 on MT5 5m bars since 2020"),
  retire(setup("BTCUSDT", "BTCUSD", "liquidity-reversal-mtf", "Liquidity Reversal MTF", "5m", { trades: 25, winRatePct: 40, avgR: 0.28, profitFactor: 1.41, perWeek: 0.26, maxDrawdownR: 3.5, maxLossStreak: 3, weeks: 98 }), "PF 0.81 on MT5 5m bars since 2020"),
  retire(setup("XAUUSDT", "XAUUSD", "macd-200ema-sr", "MACD + 200 EMA + S/R", "1h", { trades: 28, winRatePct: 46.4, avgR: 0.12, profitFactor: 1.21, perWeek: 0.64, maxDrawdownR: 4.9, maxLossStreak: 3, weeks: 44 }), "PF 1.18 on MT5 bars since 2020, first half lost"),
];

/** Signals a week across every setup, from the baselines. */
export const PLAYBOOK_SIGNALS_PER_WEEK = PLAYBOOK_SETUPS.reduce((a, s) => a + s.baseline.perWeek, 0);

export const PLAYBOOK_SETUP_IDS: ReadonlySet<string> = new Set(PLAYBOOK_SETUPS.map((s) => s.id));
/** Any setup, retired ones included: for showing logged trades. */
export const setupById = (id: string) => PLAYBOOK_SETUPS.find((s) => s.id === id) ?? RETIRED_SETUPS.find((s) => s.id === id);
/** Only setups that still trade: for signals and new trades. */
export const activeSetupById = (id: string) => PLAYBOOK_SETUPS.find((s) => s.id === id);

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
  // FTSE 100 and Brent: no measured size, so from the MT5 terminal's own
  // symbol spec (PB_BarFeed sends it). Unknown until it has.
  if (s === "FTSE100" || s === "UKOIL") return specFor(s)?.contract ?? NaN;
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
