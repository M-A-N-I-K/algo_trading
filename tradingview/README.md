# TradingView indicators

## Liquidity Reversal checkpoints

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

The swings depend on the price feed, so compare on the same feed the backtest used: **BINANCE:XAUUSDT.P**, 1h, times in UTC. The app's last gold signals up to 8 Nov 2026 13:00 UTC:

| Candle open (UTC) | Side | Entry (close) | Stop | Target |
|---|---|---|---|---|
| 2026-09-20 16:00 | SELL | 4377.35 | 4382.58 | 4350.16 |
| 2026-09-21 12:00 | SELL | 4363.73 | 4389.40 | 4243.81 |
| 2026-09-30 16:00 | BUY | 4163.44 | 4115.02 | 4288.39 |
| 2026-10-07 06:00 | BUY | 4135.16 | 4107.73 | 4228.70 |
| 2026-10-19 13:00 | BUY | 4162.02 | 4154.14 | 4196.75 |
| 2026-10-26 18:00 | SELL | 4021.33 | 4035.12 | 3986.13 |

Small differences in stops are expected for the first candles of a chart (ATR warm-up). On FundingPips' own XAUUSD feed, which closes at weekends, the levels will differ slightly from Binance's 24/7 contract.

## Liquidity Sweep checkpoints

`liquidity-sweep-checkpoints.pine` does the same for `src/strategies/liquiditySweepStrategy.ts`, the Playbook's top ETH 1h setup:

| Label | Checkpoint | Rule |
|---|---|---|
| **1 Uptrend / Downtrend leg** | Trend | A close beyond the latest swing starts a leg. The most adverse candle since that swing is the protected level (dotted line), and that candle is the zone (box). A close through the protected level flips the trend. A close beyond the leg's last swing high (low) starts a new leg. |
| **2 Equal lows / highs** | Liquidity | Two swing lows (highs) inside the leg within 0.1 × ATR. |
| **3 Sweep** | Liquidity taken | A wick through the level. |
| **4 BUY / SELL** | Entry | Price reaches the zone, then a candle closes back beyond the zone's far edge. Stop = protected level ∓ 0.1 × ATR. Target = the leg's extreme, taken only if it pays at least 2R. One trade per leg. |

Install it the same way as above. Each indicator is a separate script, so add both if you want both.

## Liquidity Reversal MTF checkpoints (1h setup, 5m entry)

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
