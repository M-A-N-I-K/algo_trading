// Shared wording for the guides' backtest sections: every guide quotes the
// same 6-month run so the strategies can be compared like for like.
export const BACKTEST_PERIOD = "5 May – 3 Nov 2026 (6 months), Binance candles";
// NAS100 rows: the Nasdaq 100 futures (NQ=F) from Yahoo Finance, which keeps
// 2 years of 1h candles but only 60 days of 5m/15m and 30 days of 1m. So
// 1h rows cover BACKTEST_PERIOD and the faster ones these shorter windows.
export const NAS100_SOURCE =
  "NAS100 is the Nasdaq 100 futures (NQ=F) from Yahoo Finance, same settings. Yahoo keeps only 60 days of 5m and 15m candles and 30 days of 1m, so those NAS100 rows cover the dates shown under the chart.";
export const NAS100_60D = "13 Sep – 9 Nov 2026 (58 days)";
export const NAS100_30D = "12 Oct – 9 Nov 2026 (29 days)";

export const BACKTEST_SETTINGS =
  "$10,000 start, whole balance per trade but never more than 2% of it at risk, 0.04% fee per side, no leverage, no slippage.";
