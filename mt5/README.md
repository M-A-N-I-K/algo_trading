# MT5 indicators

One indicator for each of the Playbook's four active setups. Each one is a direct translation of the app's strategy code with the same defaults, so it marks the same trades the backtest measured:

| File | Playbook setup | Strategy code |
|---|---|---|
| `PB_MACD200EMA_SR.mq5` | NAS100 MACD + 200 EMA + S/R, 4h | `src/strategies/macd200EmaSrStrategy.ts` |
| `PB_SMC.mq5` | Gold Smart Money Concepts, 4h | `src/strategies/smartMoneyConceptsStrategy.ts` |
| `PB_SRSweepTrendline.mq5` | NAS100 S/R Sweep + Trend-Line Break, 1h | `src/strategies/srSweepTrendlineStrategy.ts` |
| `PB_LiquidityReversal.mq5` | EUR/USD Liquidity Reversal, 1h | `src/strategies/liquidityReversalStrategy.ts` |

The rules for each are written at the top of its file and in `../tradingview/README.md`.

## Install

1. In MT5: **File → Open Data Folder**, then open `MQL5/Indicators`.
2. Copy the four `.mq5` files there (a `Playbook` subfolder is fine).
3. Open **MetaEditor** (F4), open each file and press **Compile** (F7). Or right-click **Indicators** in the Navigator and choose **Refresh**.
4. Drag the indicator onto the chart: **NAS100** for MACD and S/R Sweep, **XAUUSD** for SMC, **EURUSD** for Liquidity Reversal. Any chart timeframe works. The indicators read H1 bars themselves, so H1 or H4 charts are the easiest to read.
5. Tick **Allow algo trading** only if you want it. These indicators never place trades.

All four compile with 0 errors and 0 warnings in MetaEditor (checked against the MT5 install on this Mac).

## What they draw

- Buy / sell arrow on the signal candle, with entry (dashed), stop (red) and target (green) lines and a text label. The backtest enters at the **open of the next candle**.
- The steps that lead to a signal: the 4h 200 EMA (MACD); sweeps, CHoCH lines and gap boxes (SMC); equal lows/highs, sweeps, shift lines and zones (Liquidity Reversal); swept levels, trend lines and the 200 EMA (S/R Sweep). These steps are drawn only for recent history, to keep the chart readable.
- A status line at the top left showing where each side is now and what to wait for next.

Everything uses closed candles only, so nothing repaints. The work is redone once per new H1 bar.

## The 4h candles

The app builds its 4h candles on the **UTC** clock (00:00, 04:00, 08:00 … UTC), not on the broker's server clock that MT5's own H4 chart uses. The two 4h indicators build the UTC candles from H1 bars. To do that they convert server time to UTC with:

- **Server UTC offset in winter** = 2
- **Server adds 1h for EU summer time** = true

That is FundingPips' server clock (UTC+2 in winter, UTC+3 from the last Sunday in March to the last Sunday in October), the same rule the app uses for MT5 reports. Change it only if your broker's clock is different. Setting **4h candle grid** to *Broker server clock* uses MT5's own H4 candles instead. The backtest was not run on those.

## Alerts

- **Pop-up alert** (on by default) when a new signal closes, with entry, stop and target.
- **Push notification** (off by default) sends the same message to the MT5 phone app. Set your MetaQuotes ID first under **Tools → Options → Notifications**.
- Optional step alerts: an S/R touch (MACD, off by default), a CHoCH that leaves a gap (SMC), a shift that opens a zone (Liquidity Reversal), a level swept and reclaimed (S/R Sweep).

Alerts fire only for candles that close after you load the indicator, never for history.

## Check it matches the backtest

These are the app's last signals on FundingPips' own MT5 bars, so the indicator should show the same candles and prices. Times are the **server** time of the candle's open, as MT5 shows them.

NAS100, MACD + 200 EMA + S/R, 4h (55 signals since 2020):

| Candle open (server) | Side | Entry | Stop | Target |
|---|---|---|---|---|
| 2025-11-10 02:00 | BUY | 25351.95 | 25110.65 | 25713.90 |
| 2026-01-02 10:00 | BUY | 25524.00 | 25327.01 | 25819.49 |
| 2026-02-12 14:00 | SELL | 24938.49 | 25370.55 | 24290.40 |
| 2026-02-26 18:00 | SELL | 25017.27 | 25139.97 | 24833.22 |
| 2026-04-07 07:00 | SELL | 24076.95 | 24321.90 | 23709.53 |
| 2026-05-20 15:00 | BUY | 29240.43 | 27525.74 | 31812.46 |
| 2026-08-21 11:00 | BUY | 29416.15 | 29311.41 | 29573.26 |
| 2026-10-29 14:00 | SELL | 29373.13 | 29845.24 | 28664.96 |

XAUUSD, SMC, 4h (112 signals since 2020):

| Candle open (server) | Side | Entry | Stop | Target |
|---|---|---|---|---|
| 2026-05-15 07:00 | BUY | 4570.87 | 4530.74 | 4718.80 |
| 2026-05-15 15:00 | BUY | 4539.63 | 4515.62 | 4718.80 |
| 2026-06-26 11:00 | SELL | 4045.88 | 4391.04 | 3010.39 |
| 2026-07-08 11:00 | BUY | 4061.97 | 3934.47 | 4444.48 |
| 2026-07-13 19:00 | BUY | 4002.08 | 3934.47 | 4204.92 |
| 2026-07-24 03:00 | BUY | 4029.29 | 3974.61 | 4193.32 |
| 2026-10-12 15:00 | BUY | 4165.12 | 4092.40 | 4383.28 |
| 2026-11-06 14:00 | BUY | 4054.56 | 3957.26 | 4346.46 |

NAS100, S/R Sweep + Trend-Line Break, 1h (129 signals since 2020; the backtest took 84, one trade at a time):

| Candle open (server) | Side | Entry | Stop | Target |
|---|---|---|---|---|
| 2026-07-15 17:00 | SELL | 29428.67 | 29874.69 | 28090.61 |
| 2026-07-29 16:00 | SELL | 27585.59 | 28041.99 | 26216.40 |
| 2026-08-31 02:00 | SELL | 29235.75 | 29763.97 | 27651.10 |
| 2026-09-01 10:00 | SELL | 29383.75 | 29525.47 | 28958.58 |
| 2026-09-01 11:00 | SELL | 29183.13 | 29511.74 | 28197.30 |
| 2026-09-16 21:00 | SELL | 28923.09 | 29246.31 | 27953.44 |
| 2026-09-17 15:00 | BUY | 29418.50 | 28740.36 | 31452.92 |
| 2026-10-12 16:00 | SELL | 30735.63 | 31070.38 | 29731.38 |

EURUSD, Liquidity Reversal, 1h (133 signals since 2020):

| Candle open (server) | Side | Entry | Stop | Target |
|---|---|---|---|---|
| 2026-07-22 16:00 | SELL | 1.14134 | 1.14294 | 1.13784 |
| 2026-08-13 19:00 | BUY | 1.15296 | 1.15109 | 1.15701 |
| 2026-09-15 09:00 | BUY | 1.15340 | 1.15224 | 1.15636 |
| 2026-09-28 02:00 | BUY | 1.13783 | 1.13583 | 1.14552 |
| 2026-09-30 19:00 | BUY | 1.13392 | 1.13105 | 1.14110 |
| 2026-10-20 17:00 | SELL | 1.12424 | 1.12708 | 1.11809 |
| 2026-10-26 13:00 | BUY | 1.11991 | 1.11837 | 1.12315 |
| 2026-11-05 09:00 | SELL | 1.12427 | 1.12746 | 1.11752 |

The indicator marks every signal. The backtest holds one trade at a time per setup, so a signal that comes while an earlier trade is still open was not counted there.

The indicators load 60,000 H1 bars by default (about 9 years). If your terminal holds less history, early signals will be missing and the first stops can differ slightly while the EMA and ATR warm up. Raise **Max bars in chart** under **Tools → Options → Charts** if needed.

## Live candle feed (PB_BarFeed)

`PB_BarFeed.mq5` is a **service**, not an indicator: it runs in the background
with no chart and feeds your broker's candles to the app's Signals and
Playbook scanners, so their entries and stops are in the prices you actually
trade (NDX100 CFD rather than the Nasdaq future Yahoo serves, XAUUSD rather
than Binance's gold token).

1. Copy `PB_BarFeed.mq5` into `MQL5/Services/` (File → Open Data Folder) and
   compile it, or use the `.ex5` already there.
2. Navigator → **Services** → right-click **PB_BarFeed** → **Add Service** →
   OK. It starts at once and restarts with the terminal.
3. The Experts tab shows `PB_BarFeed: 17 symbols × 2 timeframes …`. Symbols your
   broker doesn't offer are logged once and skipped.

Every 10 seconds it writes each symbol's **closed** M15 and H1 bars (about two
years) to `MQL5/Files/PlaybookFeed/<SYMBOL>_<TF>.csv`, in the Export Bars layout,
and touches `heartbeat.txt`. A file is rewritten only when a new bar closes,
through a temporary file, so the app never reads half of one. The app builds 4h
candles from H1 on the UTC grid, the same way the backtests did.

About once a minute it also writes `symbols.csv`: each symbol's lot size, tick
size and what a tick is worth per lot in your account currency (MT5 converts
pounds and yen at today's rate). The Playbook sizes the FTSE 100 from it, so
the app never guesses that contract.

Markets only the feed carries: **FTSE100, UKOIL, EURJPY, GBPAUD**. No free web
source has these CFDs, so the app scans them only while the service runs. The
FTSE 100 Smart Money Concepts 4h setup is in the Playbook on that basis: no
feed, no FTSE signals and no FTSE sizing. `PB_SMC.mq5` on an FTSE100 1h chart
marks the same trades.

If you added the service before version 1.10, remove it and add it again so it
picks up the new `.ex5`.

The app uses the feed while `heartbeat.txt` is under two minutes old and falls
back to Binance/Yahoo otherwise (starting those series again from scratch, never
mixing the two price sources). The Signals page says which markets came from
MT5. Set `MT5_FEED_DIR` if your terminal's data folder is elsewhere.

Limits: MT5 has to be running and the Mac awake. It only works while the app
runs on the same machine; a hosted app would need the terminal to push bars
over WebRequest instead.
