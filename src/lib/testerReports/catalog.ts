// The MT5 Strategy Tester reports behind the Tester reports page. Each one is
// a run of a Playbook EA (mt5/*_EA.mq5) on FundingPips' own tick history,
// imported from the tester's Excel export with
//   npx tsx src/backtest/importTesterReports.ts [folder]
// into src/data/tester-reports/<slug>.json.

export interface TesterReportInfo {
  slug: string;
  file: string; // the .xlsx the user saved from the tester
  setupId: string; // PlaybookSetup id (active or retired)
  title: string;
  market: string;
  timeframe: string;
  note?: string; // a caveat about this run
}

export const TESTER_REPORTS: TesterReportInfo[] = [
  { slug: "sr-sweep-nas100-1h", file: "SR_SWEEP_NDX100.xlsx", setupId: "sr-sweep-trendline:NAS100:1h", title: "S/R Sweep + Trend-Line Break", market: "NAS100", timeframe: "1h" },
  { slug: "macd-nas100-4h", file: "MACD200EMA_NDX100.xlsx", setupId: "macd-200ema-sr:NAS100:4h", title: "MACD + 200 EMA + S/R", market: "NAS100", timeframe: "4h" },
  { slug: "smc-ftse100-4h", file: "SMC_FTSE100.xlsx", setupId: "smc:FTSE100:4h", title: "Smart Money Concepts", market: "FTSE100", timeframe: "4h", note: "FundingPips' FTSE 100 history starts in July 2023, so this is 3.3 years, not 6.9." },
  { slug: "smc-xauusd-4h", file: "SMC_XAUUSD.xlsx", setupId: "smc:XAUUSDT:4h", title: "Smart Money Concepts", market: "XAUUSD", timeframe: "4h" },
  {
    slug: "sr-sweep-ethusd-4h",
    file: "SR_SWEEP_ETH.xlsx",
    setupId: "sr-sweep-trendline:ETHUSDT:4h",
    title: "S/R Sweep + Trend-Line Break",
    market: "ETHUSD",
    timeframe: "4h",
    note: "Run with a 3R target; the Playbook uses 1.5R, which made PF 2.83 in the app's backtest. Re-run with Target = 1.5 to test the real setting. History quality 90%.",
  },
  { slug: "liquidity-reversal-spx500-4h", file: "LIQUIDITY_REVERSAL_SPX500.xlsx", setupId: "liquidity-reversal:SPX500:4h", title: "Liquidity Reversal", market: "SPX500", timeframe: "4h" },
  { slug: "liquidity-reversal-gbpusd-1h", file: "LIQUIDITY_REVERSAL_GBPUSD.xlsx", setupId: "liquidity-reversal:GBPUSD:1h", title: "Liquidity Reversal", market: "GBPUSD", timeframe: "1h" },
  { slug: "liquidity-reversal-eurusd-1h", file: "LIQUIDITY_REVERSAL_EURUSD.xlsx", setupId: "liquidity-reversal:EURUSD:1h", title: "Liquidity Reversal", market: "EURUSD", timeframe: "1h" },
  {
    slug: "ny-inside-bar-nas100-15m",
    file: "NY INSIDE BAR.xlsx",
    setupId: "ny-inside-bar:NAS100:15m",
    title: "NY Inside Bar",
    market: "NAS100",
    timeframe: "15m",
    note: "Retired: this run is what exposed it. Kept as the example of a setup that looked good in the app (PF 1.31) and didn't hold up on real ticks.",
  },
];

export const testerReportBySlug = (slug: string) => TESTER_REPORTS.find((r) => r.slug === slug);
