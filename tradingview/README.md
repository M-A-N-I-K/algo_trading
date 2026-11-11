# TradingView indicators

The Playbook has three active setups. Each one has an indicator that marks entry, stop and target with the same rules and defaults as the backtest:

| Playbook setup | TradingView (this folder) | MT5 (`../mt5`) | Chart |
|---|---|---|---|
| NAS100 MACD + 200 EMA + S/R, 4h | `macd-200ema-sr-checkpoints.pine` | `PB_MACD200EMA_SR.mq5` | 1h (builds the UTC 4h candles itself) |
| Gold Smart Money Concepts, 4h | `smc-checkpoints.pine` | `PB_SMC.mq5` | 1h (builds the UTC 4h candles itself) |
| EUR/USD Liquidity Reversal, 1h | `liquidity-reversal-checkpoints.pine` | `PB_LiquidityReversal.mq5` | 1h |

`liquidity-sweep-checkpoints.pine` (ETH 1h) and `liquidity-reversal-mtf-checkpoints.pine` (5m) are for setups the Playbook has retired because they lost money on 6.5 years of MT5 data. They are kept for reference only.

The reference signals below come from the app's own strategy code run on FundingPips' MT5 bars (2020 to Nov 2026). MT5 indicators read that same feed, so they should match exactly. TradingView's feeds differ a little, so expect small differences in levels there, and now and then a signal that appears on one feed and not the other.

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
