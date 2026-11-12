# TradingView indicators and strategies

## Strategy Tester scripts (the 8 Playbook setups, plus retired NY Inside Bar)

The `*-strategy.pine` files are **strategies**, so they run in TradingView's **Strategy Tester** (the tab under the chart) with a trade list and an equity curve. They use the same rules and defaults as the app, and each one draws a results panel (bottom right) in **R**, the measure the app and the guides use: trades, win rate, profit factor, average R, net R, worst drawdown and longest losing run.

Four scripts cover the 8 setups; `ny-inside-bar-strategy.pine` is kept for the retired NY Inside Bar. Pick the market's settings from this table in the script's **Settings → Inputs** and **Settings → Properties**:

| Playbook setup | Script | Chart | Inputs | Commission (Properties, % per side) | App backtest (MT5, 2020 to Nov 2026) |
|---|---|---|---|---|---|
| NAS100 MACD + 200 EMA + S/R, 4h | `macd-200ema-sr-strategy.pine` | 1h (builds UTC 4h candles) | defaults (target 2) | 0.0031 (default) | 38 trades, 50% won, PF 1.98 |
| Gold Smart Money Concepts, 4h | `smc-strategy.pine` | 1h (builds UTC 4h candles) | defaults | 0.0043 (default) | 56 trades, 33.9% won, PF 1.56 |
| FTSE 100 Smart Money Concepts, 4h | `smc-strategy.pine` | 1h (builds UTC 4h candles) | defaults | 0.0062 | 27 trades, 51.9% won, PF 3.03 (since 2023) |
| NAS100 S/R Sweep + Trend-Line, 1h | `sr-sweep-trendline-strategy.pine` | 1h | defaults (target 3) | 0.0031 (default) | 84 trades, 46.4% won, PF 2.57 |
| ETH S/R Sweep + Trend-Line, 4h | `sr-sweep-trendline-strategy.pine` | 4h | Target 1.5 | 0.0512 | 30 trades, 66.7% won, PF 2.83 |
| S&P 500 Liquidity Reversal, 4h | `liquidity-reversal-strategy.pine` | 4h | Fixed target 2 | 0.0037 (default) | 34 trades, 47.1% won, PF 1.73 |
| GBP/USD Liquidity Reversal, 1h | `liquidity-reversal-strategy.pine` | 1h | Fixed target 2 | 0.0057 | 134 trades, 42.5% won, PF 1.38 |
| EUR/USD Liquidity Reversal, 1h | `liquidity-reversal-strategy.pine` | 1h | Fixed target 0 (swing target) | 0.0031 | 124 trades, 30.6% won, PF 1.23 (since 2020-05) |
| *Retired:* NAS100 / S&P 500 NY Inside Bar, 15m | `ny-inside-bar-strategy.pine` | 15m | defaults | 0.0031 / 0.0037 | NAS100 1,877 trades, 49.4% won, PF 0.90; S&P 500 PF 0.78 (it loses) |

The commission is FundingPips' spread plus commission as a percent of price, charged on entry and on exit, so the results are after costs like the app's.

### Install

1. Open the **Pine Editor**, paste the whole file, **Save**, then **Add to chart**.
2. Switch the chart to the timeframe in the table and open the **Strategy Tester** tab.
3. Set the inputs and commission for the market, as in the table.

### Orders and sizing

- **Entries.** The four bar-close setups send a market order that fills at the next candle's open, as the app's backtest does. NY Inside Bar places a buy-stop or sell-stop order at the inside candle's high or low. That order lives for 3 candles and is cancelled or replaced by the same rules as the app.
- **Positions.** One trade at a time, with the stop and target attached.
- **Size.** Each trade risks **Risk per trade** (default 1%) of the initial capital ($100,000). Every full stop-out is about −1R, and the Tester's dollar figures read as R × $1,000. TradingView rounds sizes to whole contracts on some symbols, so a trade's dollar risk can be a little off. The panel's R figures use each trade's actual size, so they aren't affected.
- **Start date.** **Trade from** (default 1 Jan 2020) sets where the test starts.

### Why TradingView's numbers won't match the app's exactly

- **History.** TradingView loads a limited number of candles, which depends on your plan. A 15m chart may go back only weeks or months, not to 2020. Compare like with like: set **Trade from** to the first date the Tester shows, or use Deep Backtesting if your plan has it.
- **Prices.** Each broker's feed has slightly different prices, and FundingPips' MT5 feed isn't on TradingView. Use a CFD feed close to it (Pepperstone, OANDA, FXCM, ICMarkets).
- **Candles that hit two levels.** When one candle reaches both the stop and the target, the app always counts the stop, which is the cautious choice. TradingView guesses the order from the candle's shape. Turn on **Bar Magnifier** in Properties if your plan has it.
- **NY Inside Bar fills.** When a candle gaps past the target, the app skips the trade but TradingView takes it.

These differences are small, but on a short history they can move the profit factor a lot. Judge each setup on the app's 6.9-year MT5 numbers. Use the Tester to see the trades on the chart and to check recent behaviour.

## Indicators (alerts and checkpoints)

The Playbook has four active setups. Each one has an indicator that marks entry, stop and target with the same rules and defaults as the backtest:

| Playbook setup | TradingView (this folder) | MT5 (`../mt5`) | Chart |
|---|---|---|---|
| *Retired:* NAS100 and S&P 500 NY Inside Bar, 15m | `ny-inside-bar-checkpoints.pine` | `PB_NYInsideBar.mq5` | 15m |
| NAS100 MACD + 200 EMA + S/R, 4h | `macd-200ema-sr-checkpoints.pine` | `PB_MACD200EMA_SR.mq5` | 1h (builds the UTC 4h candles itself) |
| Gold Smart Money Concepts, 4h | `smc-checkpoints.pine` | `PB_SMC.mq5` | 1h (builds the UTC 4h candles itself) |
| NAS100 S/R Sweep + Trend-Line Break, 1h | `sr-sweep-trendline-checkpoints.pine` | `PB_SRSweepTrendline.mq5` | 1h |
| EUR/USD Liquidity Reversal, 1h | `liquidity-reversal-checkpoints.pine` | `PB_LiquidityReversal.mq5` | 1h |

`liquidity-sweep-checkpoints.pine` (ETH 1h) and `liquidity-reversal-mtf-checkpoints.pine` (5m) are for setups the Playbook has retired because they lost money on 6.5 years of MT5 data. They are kept for reference only.

The reference signals below come from the app's own strategy code run on FundingPips' MT5 bars (2020 to Nov 2026). MT5 indicators read that same feed, so they should match exactly. TradingView's feeds differ a little, so expect small differences in levels there, and now and then a signal that appears on one feed and not the other.

## NY Inside Bar checkpoints (NAS100 and S&P 500, 15m)

**Retired (Nov 2026): it loses money.** Its first backtest cancelled an order whenever one candle reached both the trigger and the cancel level. MT5's Strategy Tester showed the trigger usually trades first, so a real order fills, and most of those trades lose. Counting them, NAS100 made profit factor 0.90 over 1,877 trades since 2020 (MT5 tester 1.06) and SPX500 0.78. The scripts are kept for study; the trade list below is from the old rule.

`ny-inside-bar-checkpoints.pine` ports `src/strategies/nyInsideBarStrategy.ts` and tracks its own trades the same way the app does, so every mark is a trade the backtest took (or an order it cancelled). Put it on a **15-minute** chart. Times are New York's whatever the chart's time zone, daylight saving included.

| Mark | Checkpoint | Rule |
|---|---|---|
| shaded band, **1 Up / 1 Down / 1 Flat** | Bias | The 09:30 and 09:45 candles. The 09:45 close above the 09:30 open = buys only today, below = sells only, equal = no trade. |
| **2 Inside** with dashed / red / green lines | Order | After 10:00 and before 15:00, a candle whose body sits inside the previous candle's body. Buy stop at its high (sell stop at its low), stop beyond both candles' wicks, target 1 × the risk. The lines run while the order is live. |
| **x** (hover for the reason) | Cancelled | Price reached the other side of the inside candle first (a candle that reaches both fills), 3 candles passed, a newer inside candle replaced it, the next candle starts at 15:00 or later, or price gapped past the target. |
| **BUY / SELL** price | Fill | The stop order filled (at the trigger, or the open if price gapped through it). |
| **TP / SL / 16:00** with R | Exit | Target, stop (a candle reaching both counts as the stop) or the 16:00 open. R is after the cost input (NAS100 0.0031, S&P 500 0.0037). |

The panel shows today's side, what to do now (the order to place, or what to wait for) and the results in R on the chart's history. At most 2 trades a day, one at a time.

Alerts: one **Any alert() function call** alert gives every step with prices (the side at 10:00, the order to place, the fill, the exit). Or pick one of the four named conditions.

The app's last NAS100 trades on FundingPips' MT5 15m bars (New York times). TradingView's NAS100 feed has slightly different prices, so a candle can occasionally qualify on one feed and not the other:

| Inside candle | Filled | Side | Entry | Stop | Target | Exit candle |
|---|---|---|---|---|---|---|
| 2026-10-22 11:30 | 11:45 | BUY | 29132.34 | 29057.71 | 29206.97 | 12:30 |
| 2026-10-23 11:30 | 11:45 | BUY | 29129.92 | 29054.15 | 29205.69 | 12:15 |
| 2026-10-26 14:15 | 14:30 | SELL | 29336.29 | 29391.40 | 29281.18 | 14:45 |
| 2026-10-27 10:45 | 11:00 | SELL | 29362.75 | 29525.63 | 29199.87 | 11:45 |
| 2026-10-27 13:00 | 13:30 | SELL | 29664.88 | 29713.50 | 29616.26 | 13:45 |
| 2026-10-30 10:00 | 10:15 | BUY | 28669.70 | 28607.95 | 28731.45 | 10:30 |
| 2026-11-02 11:30 | 11:45 | SELL | 28506.36 | 28567.81 | 28444.91 | 12:30 |
| 2026-11-03 12:45 | 13:00 | BUY | 28257.19 | 28198.90 | 28315.48 | 14:00 |

## MACD + 200 EMA + S/R checkpoints (NAS100 4h)

`macd-200ema-sr-checkpoints.pine` ports `src/strategies/macd200EmaSrStrategy.ts`:

| Mark | Checkpoint | Rule |
|---|---|---|
| orange line | Trend | 200 EMA of the 4h closes. Longs only while the 4h candle closes above it, shorts only below. |
| dotted line | Level | Support = a swing low lower than the 5 candles on each side, removed once a candle closes below it. Resistance is the mirror. The nearest live levels are drawn. |
| small dot | Touch | A 4h candle closing above the EMA has its low at or below a live support (short side: high at or above a resistance, closing below the EMA). |
| **BUY / SELL** | Entry | Within 10 candles of the touch, MACD (12, 26, 9) crosses its signal line: up with both lines below zero for a buy, down with both above zero for a sell. Stop = the 200 EMA. Target = 1.5 × the risk. |

Put it on a **1h** chart. The app builds 4h candles on the UTC clock (00:00, 04:00, 08:00 …) and so does the indicator. On a 4h chart it uses the chart's own candles, which may start at other hours depending on the feed. It needs about 220 4h candles (900 1h bars) before the EMA is ready.

Alerts: **Any alert() function call** sends the entries with prices, plus the touches. Named conditions: **Long entry**, **Short entry**, **Support touched (long setup)**, **Resistance touched (short setup)**.

App signals on MT5 NDX100 (FundingPips' NAS100), 55 since 2020:

| 4h candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2025-11-10 00:00 | BUY | 25351.95 | 25110.65 | 25713.90 |
| 2026-01-02 08:00 | BUY | 25524.00 | 25327.01 | 25819.49 |
| 2026-02-12 12:00 | SELL | 24938.49 | 25370.55 | 24290.40 |
| 2026-02-26 16:00 | SELL | 25017.27 | 25139.97 | 24833.22 |
| 2026-04-07 04:00 | SELL | 24076.95 | 24321.90 | 23709.53 |
| 2026-05-20 12:00 | BUY | 29240.43 | 27525.74 | 31812.46 |
| 2026-08-21 08:00 | BUY | 29416.15 | 29311.41 | 29573.26 |
| 2026-10-29 12:00 | SELL | 29373.13 | 29845.24 | 28664.96 |

## Smart Money Concepts checkpoints (Gold 4h)

`smc-checkpoints.pine` ports `src/strategies/smartMoneyConceptsStrategy.ts`:

| Label | Checkpoint | Rule |
|---|---|---|
| **1 Sweep** | Liquidity taken | A 4h low dips below the latest swing low (lower than the 5 candles each side, known 5 candles later) and the candle closes no more than 0.2% below it. The swing high that was latest at that moment becomes the line to break (dotted). |
| **2 CHoCH** | Change of character | Within 40 candles, a close above that line. |
| **3 FVG** | Fair value gap | On the CHoCH candle, every bullish gap in the last 7 candles (green middle candle, candle 1's high below candle 3's low) is boxed. A gap lives 60 candles, or until a close below its bottom. |
| **BUY / SELL** | Entry | A later candle's low reaches the gap's midpoint and it closes at or above the gap's bottom. Stop = the lower of the gap bottom and the sweep low, minus 0.2%. Target = the latest swing high or 3R, whichever is further. One trade per gap. |

Shorts are the mirror image. Put it on a **1h** chart, as above.

Alerts: **Any alert() function call** sends the CHoCH (and whether it left a gap) and the entries with prices. Named conditions: **1 Swing low swept**, **2 Bullish CHoCH**, **4 Long entry** and the short versions.

App signals on MT5 XAUUSD, 112 since 2020:

| 4h candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2026-05-15 04:00 | BUY | 4570.87 | 4530.74 | 4718.80 |
| 2026-05-15 12:00 | BUY | 4539.63 | 4515.62 | 4718.80 |
| 2026-06-26 08:00 | SELL | 4045.88 | 4391.04 | 3010.39 |
| 2026-07-08 08:00 | BUY | 4061.97 | 3934.47 | 4444.48 |
| 2026-07-13 16:00 | BUY | 4002.08 | 3934.47 | 4204.92 |
| 2026-07-24 00:00 | BUY | 4029.29 | 3974.61 | 4193.32 |
| 2026-10-12 12:00 | BUY | 4165.12 | 4092.40 | 4383.28 |
| 2026-11-06 12:00 | BUY | 4054.56 | 3957.26 | 4346.46 |

The indicator marks every signal. The backtest holds one trade at a time, so a signal that comes while an earlier trade is still open (two came on 15 May, for example) was not taken there.

## S/R Sweep + Trend-Line Break checkpoints (NAS100 1h)

`sr-sweep-trendline-checkpoints.pine` ports `src/strategies/srSweepTrendlineStrategy.ts`:

| Mark | Checkpoint | Rule |
|---|---|---|
| dashed line | Level | Two swing lows (3 candles each side) within 0.25 × ATR(14), at most 100 candles apart, nothing lower between them. Drawn when it gets swept. |
| **Sweep** | Liquidity taken | A low trades below the level (up to 300 candles after it formed), and a candle closes back above it within 3 candles. |
| dotted line | Trend line | Through the last two falling swing highs (3 candles each side) at or before the sweep candle, within 80 candles of it. Drawn on the signal. |
| **BUY / SELL** | Entry | Within 48 candles of the reclaim, a green candle with a body of at least 1 × ATR closes above the line and above the 200 EMA. Stop = the lowest low since the sweep − 0.1 × ATR. Target = 3R. A new low that closes back at or below the level kills the setup. |

Shorts are the mirror image. Use a **1h** chart.

Alerts: **Any alert() function call** sends the entries with prices. Named conditions: **Long entry**, **Short entry**, **Support swept**, **Resistance swept**.

App signals on MT5 NDX100 1h, 129 since 2020 (the backtest took 84, one trade at a time):

| Candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2026-07-15 14:00 | SELL | 29428.67 | 29874.69 | 28090.61 |
| 2026-07-29 13:00 | SELL | 27585.59 | 28041.99 | 26216.40 |
| 2026-08-30 23:00 | SELL | 29235.75 | 29763.97 | 27651.10 |
| 2026-09-01 07:00 | SELL | 29383.75 | 29525.47 | 28958.58 |
| 2026-09-01 08:00 | SELL | 29183.13 | 29511.74 | 28197.30 |
| 2026-09-16 18:00 | SELL | 28923.09 | 29246.31 | 27953.44 |
| 2026-09-17 12:00 | BUY | 29418.50 | 28740.36 | 31452.92 |
| 2026-10-12 13:00 | SELL | 30735.63 | 31070.38 | 29731.38 |

This setup depends on where the hourly candles start. TradingView's NAS100 feeds start them on the hour, like MT5, but their prices differ a little, so some signals will differ.

## Liquidity Reversal checkpoints (EUR/USD 1h)

`liquidity-reversal-checkpoints.pine` draws each checkpoint of the app's Liquidity Reversal strategy, using the same rules and defaults as `src/strategies/liquidityReversalStrategy.ts`:

| Label | Checkpoint | Rule |
|---|---|---|
| **1 Equal lows / highs** | Liquidity | Two swing lows (lower than the 3 candles each side) within 0.1 × ATR(14), no more than 100 candles apart, nothing lower between them. Blue (long) or orange (short) dashed line, which stops at the candle that sweeps it. |
| **2 Sweep** | Liquidity taken | A wick trades through the level. |
| **3 Shift** | Structure change | A candle closes above (below) the last swing high (low) before the sweep extreme, within 48 candles. Dotted line. |
| **4 Zone** | Demand / supply | The last red (green) candle at, or up to 10 candles before, the sweep extreme: its open to the sweep extreme. Shaded box. |
| **5 BUY / SELL** | Entry | Price wicks into the zone, then a candle closes back beyond it, within 48 candles. Stop = sweep extreme ∓ 0.1 × ATR. Target = nearest untouched swing paying at least 2R (no such swing means the trade is skipped). |
| **x** | Dropped | Expired, cancelled by a close through the sweep extreme, or no 2R target. |

The panel at the top right shows where the long and short sides are now and what to wait for next. Everything is computed on closed candles, so nothing repaints.

### Install

1. In TradingView, open the **Pine Editor** at the bottom of the chart.
2. Paste the whole file and click **Save**, then **Add to chart**.
3. Use the **1h** timeframe (the timeframe the strategy was backtested on).

### Alerts

Create an alert on the indicator and choose either:

- **Any alert() function call**: one alert that sends the shift and entry messages, with prices.
- A named condition, such as **5 Long entry** or **1-2 Long: equal lows swept**.

### Check it matches the backtest

The swings depend on the price feed. An earlier check on the Binance gold contract (**BINANCE:XAUUSDT.P**, 1h, UTC), up to 8 Nov 2026 13:00 UTC:

| Candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2026-09-20 16:00 | SELL | 4377.35 | 4382.58 | 4350.16 |
| 2026-09-21 12:00 | SELL | 4363.73 | 4389.40 | 4243.81 |
| 2026-09-30 16:00 | BUY | 4163.44 | 4115.02 | 4288.39 |
| 2026-10-07 06:00 | BUY | 4135.16 | 4107.73 | 4228.70 |
| 2026-10-19 13:00 | BUY | 4162.02 | 4154.14 | 4196.75 |
| 2026-10-26 18:00 | SELL | 4021.33 | 4035.12 | 3986.13 |

App signals on MT5 EURUSD (the Playbook setup), 133 since 2020, times in UTC:

| Candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2026-07-22 13:00 | SELL | 1.14134 | 1.14294 | 1.13784 |
| 2026-08-13 16:00 | BUY | 1.15296 | 1.15109 | 1.15701 |
| 2026-09-15 06:00 | BUY | 1.15340 | 1.15224 | 1.15636 |
| 2026-09-27 23:00 | BUY | 1.13783 | 1.13583 | 1.14552 |
| 2026-09-30 16:00 | BUY | 1.13392 | 1.13105 | 1.14110 |
| 2026-10-20 14:00 | SELL | 1.12424 | 1.12708 | 1.11809 |
| 2026-10-26 11:00 | BUY | 1.11991 | 1.11837 | 1.12315 |
| 2026-11-05 07:00 | SELL | 1.12427 | 1.12746 | 1.11752 |

Small differences in stops are expected for the first candles of a chart (ATR warm-up). On FundingPips' own XAUUSD feed, which closes at weekends, the levels will differ slightly from Binance's 24/7 contract.

## Liquidity Sweep checkpoints (retired setup)

`liquidity-sweep-checkpoints.pine` does the same for `src/strategies/liquiditySweepStrategy.ts`, the Playbook's top ETH 1h setup:

| Label | Checkpoint | Rule |
|---|---|---|
| **1 Uptrend / Downtrend leg** | Trend | A close beyond the latest swing starts a leg. The most adverse candle since that swing is the protected level (dotted line), and that candle is the zone (box). A close through the protected level flips the trend. A close beyond the leg's last swing high (low) starts a new leg. |
| **2 Equal lows / highs** | Liquidity | Two swing lows (highs) inside the leg within 0.1 × ATR. |
| **3 Sweep** | Liquidity taken | A wick through the level. |
| **4 BUY / SELL** | Entry | Price reaches the zone, then a candle closes back beyond the zone's far edge. Stop = protected level ∓ 0.1 × ATR. Target = the leg's extreme, taken only if it pays at least 2R. One trade per leg. |

Install it the same way as above. Each indicator is a separate script, so add both if you want both.

### Alerts at every stage

Every checkpoint can alert you, on the candle close where it happens:

| Stage | Alert message (from "Any alert() function call") |
|---|---|
| 1 | `ETHUSD 60 LS 1/4: uptrend leg started (break of structure). Protected low …, zone top …, target …` |
| 2 | `… LS 2/4: equal lows at …. Next: a wick below them (the sweep).` |
| 3 | `… LS 3/4: equal lows … swept. Next: price back to the zone (top …).` |
| 4a | `… LS 4a: price is in the zone. Entry on a close above … if target … pays 2R.` |
| 4 | `… LS 4/4 BUY … SL … TP … (2.4R)`, or `4/4 skipped: target pays only 1.3R` |

Two ways to set it up (right-click the chart → **Add alert**, Condition = **LS checkpoints**):

- **Any alert() function call**: one alert for every stage, with exact prices. Stages that happen on the same candle arrive in one message. This is the one to use.
- A single named condition, if you only want some stages: **1 Long: uptrend leg started**, **2 Long: equal lows formed**, **3 Long: equal lows swept**, **4a Long: price in demand zone**, **4 Long entry**, **4 Entry skipped (under 2R)**, the Short versions, or **Any checkpoint**. Set these to fire **Once Per Bar Close**.

TradingView's free plan allows only a few active alerts at once, so one "Any alert() function call" alert per chart is the cheapest way to cover everything.

## Liquidity Reversal MTF checkpoints (1h setup, 5m entry, retired setup)

`liquidity-reversal-mtf-checkpoints.pine` ports `src/strategies/liquidityReversalMtfStrategy.ts`, the only lower-timeframe strategy that made money on ETH in testing (2 years: 21 trades, 52% won, +0.87R per trade, profit factor 2.68; 3.08 with a forced 21:00 UTC daily close).

Put it on a **5m** chart. It builds the 1h candles from the chart's bars and runs the 1h Liquidity Reversal rules on them (labels 1–4, prefixed "1h"), then marks the 5m pullback into the 1h zone (5) and the entry (6) when a 5m candle closes above the last 5m swing high formed between the 1h shift and the pullback low. The stop stays under the 1h sweep low and the target is the nearest untouched 1h swing high paying at least 2R. One trade per zone. The zone dies on a close below the sweep low or 24 hours after the shift.

It needs enough 5m history to build the 1h setup: about 5,000 bars (17 days) on TradingView's free plan, more on paid plans.

App signals on BINANCE:ETHUSDT.P to compare (UTC):

| Candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2026-07-30 13:35 | SELL | 1918.90 | 1937.50 | 1872.00 |
| 2026-08-02 17:20 | BUY | 1870.40 | 1821.07 | 1977.99 |
| 2026-09-27 23:25 | BUY | 2685.36 | 2663.76 | 2743.00 |

The indicator only sees the history TradingView loads, so a setup that formed before the first loaded bar won't appear. Use Bar Replay to check older dates.
