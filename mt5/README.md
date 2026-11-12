# MT5 indicators

One indicator for each of the Playbook's five active setups. Each one is a direct translation of the app's strategy code with the same defaults, so it marks the same trades the backtest measured:

| File | Playbook setup | Strategy code |
|---|---|---|
| `PB_NYInsideBar.mq5` | NAS100 and S&P 500 NY Inside Bar, 15m | `src/strategies/nyInsideBarStrategy.ts` |
| `PB_MACD200EMA_SR.mq5` | NAS100 MACD + 200 EMA + S/R, 4h | `src/strategies/macd200EmaSrStrategy.ts` |
| `PB_SMC.mq5` | Gold Smart Money Concepts, 4h | `src/strategies/smartMoneyConceptsStrategy.ts` |
| `PB_SRSweepTrendline.mq5` | NAS100 S/R Sweep + Trend-Line Break, 1h | `src/strategies/srSweepTrendlineStrategy.ts` |
| `PB_LiquidityReversal.mq5` | EUR/USD Liquidity Reversal, 1h | `src/strategies/liquidityReversalStrategy.ts` |

The rules for each are written at the top of its file and in `../tradingview/README.md`.

## Install

1. In MT5: **File → Open Data Folder**, then open `MQL5/Indicators`.
2. Copy the `.mq5` files there (a `Playbook` subfolder is fine).
3. Open **MetaEditor** (F4), open each file and press **Compile** (F7). Or right-click **Indicators** in the Navigator and choose **Refresh**.
4. Drag the indicator onto the chart: **NAS100** (or **SPX500**) for NY Inside Bar, **NAS100** for MACD and S/R Sweep, **XAUUSD** for SMC, **EURUSD** for Liquidity Reversal. Any chart timeframe works. The indicators read H1 bars themselves (NY Inside Bar reads M15 bars), so H1 or H4 charts are the easiest to read (M15 for NY Inside Bar).
5. Tick **Allow algo trading** only if you want it. These indicators never place trades.

All five compile with 0 errors and 0 warnings in MetaEditor (checked against the MT5 install on this Mac).

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

## NY Inside Bar (PB_NYInsideBar)

Put it on an **NAS100** or **SPX500** M15 chart. It reads closed M15 bars and turns the server clock into New York time (server to UTC with the two settings above, then UTC to New York with the US daylight-saving rule: second Sunday in March to first Sunday in November). The rules, marks and alerts are the same as `../tradingview/ny-inside-bar-checkpoints.pine`:

- **1 Opening range UP / DOWN / flat** on the 09:45 New York candle: buys only, sells only, or no trade today.
- **2 Inside** with dashed (trigger), red (stop) and green (target) lines while the stop order is live; **x** with the reason when it's cancelled.
- A buy / sell arrow and price on the fill, then **TP / SL / 16:00** with the result in R on the exit candle.
- The status line: today's side, the order to place or what to wait for, and the results in R on the loaded history. Set **Cost per side** to 0.0037 on SPX500.

Alerts (pop-up on by default, push optional) fire on each M15 close after you load it: the day's side, the stop order to place with its stop, target and cancel level, the fill and the exit. Marks are drawn for the last 30 New York days (**Draw marks for the last N days**); the results use all loaded bars.

The app's last NAS100 trades (fill candle in **server** time, as MT5 shows it):

| Fill candle (server) | Side | Entry | Stop | Target |
|---|---|---|---|---|
| 2026-10-22 18:45 | BUY | 29132.34 | 29057.71 | 29206.97 |
| 2026-10-23 18:45 | BUY | 29129.92 | 29054.15 | 29205.69 |
| 2026-10-26 20:30 | SELL | 29336.29 | 29391.40 | 29281.18 |
| 2026-10-27 17:00 | SELL | 29362.75 | 29525.63 | 29199.87 |
| 2026-10-27 19:30 | SELL | 29664.88 | 29713.50 | 29616.26 |
| 2026-10-30 16:15 | BUY | 28669.70 | 28607.95 | 28731.45 |
| 2026-11-02 18:45 | SELL | 28506.36 | 28567.81 | 28444.91 |
| 2026-11-03 20:00 | BUY | 28257.19 | 28198.90 | 28315.48 |

## Backtest in MT5's Strategy Tester (PB_NYInsideBar_EA)

The indicators only draw, so the Strategy Tester can't run them. `PB_NYInsideBar_EA.mq5` is an Expert Advisor that places the NY Inside Bar orders itself: the stop order after each inside candle with its stop and target, deleted when price reaches the other side first, after 3 candles, when a newer inside candle replaces it or at 15:00 New York, and anything open closed at 16:00. Max 2 trades a day, one at a time.

1. Save it in **File → Open Data Folder → MQL5/Experts** and compile it (F7).
2. Open the tester: **View → Strategy Tester** (Ctrl+R). Choose **Expert: PB_NYInsideBar_EA**, **Symbol: NDX100** (or SPX500), **Timeframe: M15**, **Modelling: Every tick based on real ticks**, **Date: 2020.01.01** to today, **Deposit: 10000 USD**, leverage your account's.
3. Inputs: **Risk per trade** 1% matches the app's R numbers ($100 on $10,000). Keep the rules at their defaults. The clock settings are FundingPips' server (UTC+2, +1 in EU summer).
4. Click **Start**. The first run downloads FundingPips' tick history, which takes a while. The **Journal** tab logs every step (bias, order placed, deleted and why, filled, closed).

Compare with the app's backtest on the same data: NDX100 1,512 trades since 2020, 58.3% won, profit factor 1.31; SPX500 1,615 trades, profit factor 1.21. Expect small differences, because real orders behave slightly differently from the app's candle rules:

- a buy stop triggers on the **ask**, while the chart and the app use bids, so buys fill a spread earlier (and sell stops lose a spread on the way out);
- the real tick order decides a candle that reaches both stop and target (the app always counts the stop), and a candle that reaches both the trigger and the cancel level (the app always cancels);
- the tester charges your account's actual spread and commission.

It can trade a live or demo account too, if your prop firm allows Expert Advisors. It's built for testing; watch it on a demo before trusting it with a challenge.

## Live candle feed (PB_BarFeed)

`PB_BarFeed.mq5` is an **Expert Advisor** that places no trades: it feeds your
broker's candles to the app's Signals and Playbook scanners, so their entries
and stops are in the prices you actually trade (NDX100 CFD rather than the
Nasdaq future Yahoo serves, XAUUSD rather than Binance's gold token). (It began
as a service, but MT5 for Mac didn't offer Add Service for it.)

1. Copy `PB_BarFeed.mq5` into `MQL5/Experts/` (File → Open Data Folder) and
   compile it, or use the `.ex5` already there.
2. Open any one chart (EURUSD H1 is fine) and drag **PB_BarFeed** from
   Navigator → Expert Advisors onto it → OK. Leave that chart open; it doesn't
   matter which symbol it shows. Algo Trading can stay off: it only writes files.
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

The app uses the feed while `heartbeat.txt` is under two minutes old and falls
back to Binance/Yahoo otherwise (starting those series again from scratch, never
mixing the two price sources). The Signals page says which markets came from
MT5. Set `MT5_FEED_DIR` if your terminal's data folder is elsewhere.

Limits: MT5 has to be running and the Mac awake. It only works while the app
runs on the same machine; a hosted app would need the terminal to push bars
over WebRequest instead.
