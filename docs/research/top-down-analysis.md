# Top-down analysis (TDA): what actually helps our trades

Written 6 Nov 2026. The question: the "TDA process" says to read the weekly and daily charts at the weekend (build a narrative and bias), then take entries on 1h–5m during the week. Does a weekly or daily bias make the trades on our Signals page better, and how should it shape the plan for each coin?

## How it was tested

- Every coded strategy on every Signals market (240 strategy-market pairs, 30,781 trades), plus the 19 that qualify on the Signals page at the real fee (689 trades). That's 2 years of cached Binance candles at a 0.059% fee per side, using the same simulator and settings as the Signals page.
- Each trade was tagged by what the higher timeframes said when it was entered. Only fully closed daily and weekly candles were used, so there is no look-ahead. The tags:
  - **Daily trend**: last daily close above or below the 20-day EMA. Also tried with the 50-day EMA.
  - **Weekly trend**: last weekly close above or below the 10-week EMA.
  - **Daily momentum**: last daily close above or below the one before.
  - **Weekly location (premium/discount)**: entry price below the midpoint of the previous week's range, called "discount", or above it, called "premium". A long in discount, or a short in premium, counts as "with".
- Each tag was compared on profit factor and average net % per trade for trades "with" vs "against", in both halves of the window (split on 3 Dec 2025).

## Results

### Qualified strategies (the 19 on the Signals page)

| Filter | With: PF | Against: PF | Raises the pair's total profit if used as a hard filter |
|---|---|---|---|
| **Weekly location** | **2.10** (317 trades) | 1.44 (372) | 4 of 19 |
| Daily trend (20 EMA) | 1.73 | 1.65 | 4 of 19 |
| Daily momentum | 1.82 | 1.58 | 3 of 19 |
| Daily trend (50 EMA) | 1.45 | 2.10 | 1 of 19 |
| Weekly trend (10 EMA) | 1.44 | **2.11** | **0 of 19** |

Weekly location by half:

| Half | With: PF | Against: PF |
|---|---|---|
| First (to Dec 2025) | 1.98 | 1.55 |
| Second | 2.25 | 1.27 |

The weekly-location result held for longs and for shorts:

| Side | With: PF | Against: PF |
|---|---|---|
| Longs | 1.74 | 1.32 |
| Shorts | 2.50 | 1.55 |

### All 240 pairs (including the strategies that lose)

- **Weekly location is the only tag that separates winners from losers in both halves.**
  - With: PF 1.04 (+0.05% a trade).
  - Against: PF 0.93 (−0.13% a trade).
- **Trading with the weekly trend did worst.** Longs taken while the weekly trend was up had PF 0.81 over 6,132 trades.

### What that means

1. **Weekly trend is context, not a filter.**
   - On these strategies in 2024–26, waiting for the weekly trend to agree made results worse every time.
   - These are mostly liquidity-sweep and reversal setups. They are designed to enter against the most recent move, so a trend filter removes their best trades.
2. **Daily trend does almost nothing** (PF 1.73 vs 1.65), and the two halves disagree. Don't use it.
3. **Weekly location (premium/discount) is the useful weekend work.**
   - Longs taken below last week's midpoint and shorts above it did clearly better, in both halves.
4. **Grade trades with it; don't skip them.**
   - Used as a hard filter, it cut total profit in 15 of 19 pairs, because it throws away half the trades and the "against" trades still made money (PF 1.44).
   - The sensible use is sizing: **full size (1% risk) for a trade "with" location, half size for one "against".** This sizing rule was not backtested separately; it follows from both groups being profitable.

### Coin-by-coin caveats

Per-coin samples are small (10–70 trades), so treat these as hints:

| Coin | Qualified trades, with location | Against location | Read |
|---|---|---|---|
| XAU | PF 4.60 (13) | 0.42 (10) | Strongly helps |
| ETH | 4.40 (25) | 1.81 (22) | Helps |
| DOGE | 5.10 (17) | 1.28 (7) | Helps |
| ADA | 2.55 (27) | 1.27 (59) | Helps |
| NEAR | 2.57 (48) | 1.51 (33) | Helps |
| AAVE | 2.73 (20) | 1.85 (10) | Helps |
| SUI | 2.13 (44) | 1.10 (62) | Helps |
| BTC | 1.79 (73) | 1.36 (113) | Helps a little |
| **AVAX** | 1.18 (32) | **2.45** (43) | **Reversed: ignore the grade** |
| **SOL** | 0.70 (18) | 1.21 (13) | **Reversed: ignore the grade** |
| XAG, XRP | none qualify | | **No qualified strategy: don't trade them** |

## The process, adapted to what the data supports

**Weekend (or Monday morning), for each coin:**

1. Mark last week's **high, low and midpoint**. The midpoint is the line between premium and discount for the whole week.
2. Mark the nearest **daily swing high and low** above and below price. These are the obvious targets and stops other traders see.
3. Note the weekly trend, for context only. It tells you which way a breakdown is likely to run. It is not a reason to skip a signal.
4. Note the **daily ATR**. A stop much tighter than about a quarter of the daily ATR on a 1h trade is likely to be hit by noise.

**Day to day:**

1. Take entries only from the **Signals page**, which handles the 1h setups and the 5m entries.
2. Grade each signal:
   - **A (full size, 1% risk):** long below last week's midpoint, or short above it.
   - **B (half size):** the opposite.
   - For AVAX and SOL, use full size either way.
3. Before entering, check the target isn't beyond a daily swing level that price is likely to stall at.

## This week's map (taken 6 Nov 2026, about 09:00 UTC)

"Last week" is Mon 26 Oct – Sun 1 Nov. Position is where price sits in last week's range: 0% is the low and 100% is the high. Below 0% means price is under last week's low.

| Coin | Price | Last week L / mid / H | Position | A-grade side now | Daily support | Daily resistance | Daily ATR | Weekly / daily trend |
|---|---|---|---|---|---|---|---|---|
| XAU | 4078 | 3881 / 3985 / 4089 | 95% | **Short** | 4073, 3979 | 4089, 4187 | 66 (1.6%) | down / up |
| XAG | 52.20 | 48.97 / 51.85 / 54.73 | 56% | (no qualified strategy) | 48.97 | 54.73, 58.70 | 1.77 (3.4%) | down / down |
| BTC | 75,716 | 76,326 / 79,148 / 81,971 | −11% | **Long** | 74,968, 62,535 | 79,500 | 2,326 (3.1%) | down / down |
| ETH | 2228 | 2174 / 2283 / 2392 | 25% | **Long** | 2174, 1854 | 2392, 2527 | 95 (4.2%) | down / down |
| XRP | 1.189 | 1.200 / 1.272 / 1.344 | −7% | (no qualified strategy) | 0.99 | 1.344, 1.399 | 0.054 (4.6%) | down / down |
| SOL | 89.75 | 92.34 / 98.10 / 103.85 | −23% | either (grade reversed) | 74.6 | 102.7, 103.9 | 4.5 (5.0%) | down / down |
| AVAX | 8.265 | 8.00 / 8.58 / 9.16 | 23% | either (grade reversed) | 8.00, 7.28 | 8.32, 9.06 | 0.50 (6.1%) | down / down |
| DOGE | 0.0719 | 0.0722 / 0.0768 / 0.0815 | −3% | **Long** | 0.0690 | 0.0732, 0.0815 | 0.0036 (5.0%) | down / down |
| ADA | 0.1838 | 0.1820 / 0.1961 / 0.2101 | 6% | **Long** | 0.1820, 0.1712 | 0.2101, 0.2159 | 0.0111 (6.0%) | down / down |
| SUI | 0.857 | 0.828 / 0.896 / 0.965 | 21% | **Long** | 0.828, 0.725 | 0.954, 0.965 | 0.057 (6.7%) | down / down |
| NEAR | 3.722 | 3.909 / 4.360 / 4.810 | −21% | **Long** | 2.27 (far) | 4.81, 5.44 | 0.40 (10.9%) | up* / down |
| AAVE | 130.0 | 115.2 / 128.2 / 141.2 | 57% | **Short** (marginal) | 120.3, 119.7 | 131.8, 133.7 | 9.7 (7.4%) | down / down |

\* NEAR's last weekly close was above its 10-week EMA, but price has since fallen below it (4.14).

**The narrative this week:**
- **Crypto:** every coin is in a weekly and daily downtrend, down 10–37% over four weeks, and almost every coin is now at or below last week's low.
  - The trend says "down". Location says longs are the A-grade side. In the backtest, location beat trend.
  - So: **take long signals at full size, take short signals at half size, and don't short into the lows on your own.**
- **Gold:** rallied from 3907 to 4152 this week and is now in the top of last week's range.
  - Shorts are A-grade there, which fits the open short from 4098.
  - Resistance is 4089, the top of last week's range, and 4152, this week's high. Support is 4073, then 3979.

**Refresh Monday.** From Monday, "last week" becomes this week (2–8 Nov). Its range so far, which may still stretch for crypto over the weekend:

| Coin | Low | Mid | High |
|---|---|---|---|
| XAU | 3899 | 4026 | 4152 |
| BTC | 75,208 | 78,202 | 81,196 |
| ETH | 2206 | 2328 | 2450 |
| SOL | 88.3 | 93.2 | 98.1 |

Recompute the midpoints after Sunday's close.

## Currency pairs (added 6 Nov 2026)

The 7 majors (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD) now run through the same scanner, using Yahoo Finance candles (`src/lib/forex/yahoo.ts`).

**Data:** 2 years of 1h, with 4h built from 1h. Below 1h, Yahoo only has 60 days, so strategies on 15m and 5m can't be judged on forex. That rules out the 1h setup + 5m entry strategy and Extreme Order Block.

**Costs and size:** 0.01% per side for spread and commission, at 10× leverage. The 2% risk cap still applies.

**Backtests:** 140 strategy-pair runs on 1h and 4h. Only **Liquidity Reversal on USD/JPY 1h** qualifies:

| Trades | Profit factor | Return a year | Max drawdown | First half | Second half |
|---|---|---|---|---|---|
| 39 | 2.26 | +27.9% | 12.6% | +56.8% | +4.3% |

Close misses:

| Pair and strategy | Trades | Profit factor | Return a year | Why it failed |
|---|---|---|---|---|
| USD/CAD Session London BOS 1h | 87 | 1.32 | +16.7% | Lost money in the first half |
| NZD/USD Liquidity Reversal 1h | 38 | 1.56 | +13.3% | Flat in the first half |
| EUR/USD Liquidity Reversal 1h | 25 | 1.78 | +11.0% | Second half only +0.5% |

**Weekly location (premium/discount):** this separates forex trades even more than crypto.

| | A-grade trades | B-grade trades |
|---|---|---|
| All 1h/4h trades | PF 1.05 | **PF 0.72** |
| First half | PF 0.99 | PF 0.71 |
| Second half | PF 1.13 | PF 0.74 |

A-grade beat B-grade on 6 of 7 pairs; it ran backwards on USD/CHF. On forex, B-grade trades lost money outright, so the app says **skip them** rather than halve them. USD/CHF gets no grade.

## The video's full process as a strategy (`top-down`, added 6 Nov 2026)

`src/strategies/topDownStrategy.ts`, with its guide at `/guides/top-down`. The rules:

- **Weekly bias:** the last week was green and closed above the prior week's high (red and below its low for shorts).
- **Daily structure** must agree.
- **1h range:** the latest leg, at least 3 × ATR tall.
- **Entry:** a 5m break of structure in the discount half.
- **Stop:** under the pullback low, and at least 0.5 × ATR from entry.
- **Targets:** at least 3R to the range high, where half comes off. The other half runs to the nearest untaken weekly swing high.

**Results:** 2 years, 12 markets, at 0.059% per side.

| Market | Trades | Profit factor | Return |
|---|---|---|---|
| ETH | 15 | 2.44 | +17.4% |
| BTC | 15 | 2.49 | +8.4% |
| NEAR | 10 | 1.96 | +14.4% |
| AVAX | 11 | 1.50 | +7.0% |
| XAU | 6 | 1.91 | +1.3% |
| XRP | 14 | 1.07 | +0.5% |
| SOL | | | −1.5% |
| XAG | | | −1.0% |
| SUI | | | −8.4% |
| ADA | | | −14.0% |
| DOGE | | | −15.9% |
| AAVE | | | −15.9% |

- **It qualifies on no market.** It never reaches 20 trades, because most weeks give no bias.
- **The bias helps this strategy** (unlike the location test above, which used different entries). Without it, the same entries had a profit factor of 0.89 on BTC and 0.76 on ETH.
- **The runner made most of the profit.** ETH without the runner made 0.0%.

## Indices: Nasdaq 100 and S&P 500 (added 6 Nov 2026)

**Data.** Yahoo's continuous futures, NQ=F (as `NAS100`) and ES=F (as `SPX500`). They trade about 23 hours a day, five days a week. Yahoo gives 2 years of 1h (4h is built from it) but only 60 days below 1h, so only the 1h and 4h strategies could be judged. The continuous contract isn't back-adjusted: each quarterly roll leaves a jump, and 10 of the S&P's 1h opens gapped more than 1% from the previous close (weekends included).

**Costs.** 0.01% per side and 5× leverage, the same sizing rule as forex.

**Results: no strategy qualifies on either index.** Both indices rose over the period: buy and hold made +29% on the Nasdaq and +24% on the S&P. No strategy beat that with an acceptable drawdown.

| Market | Strategy | Trades | PF | Return | Why it fails |
|---|---|---|---|---|---|
| Nasdaq 100 | macd-sma-atr 4h | 18 | 1.34 | +49% | 59.9% drawdown; lost 12.6% in the first half |
| Nasdaq 100 | macd-200ema-sr 4h | 8 | 4.15 | +14.6% | too few trades, below buy and hold |
| Nasdaq 100 | liquidity-sweep 1h | 11 | 1.85 | +13% | too few trades, below buy and hold |
| S&P 500 | smc 1h | 48 | 1.06 | +4.1% | best S&P result; far below buy and hold |
| S&P 500 | liquidity-reversal 1h | | | −34.8% | |
| S&P 500 | perfect-entry 1h | | | −28.7% | stops hit again and again in the April 2025 sell-off |
| S&P 500 | session-london-bos 1h | | | −18.4% | |

**The weekly location grade runs backwards on indices.** Across every index trade from every strategy, A-grade trades had a profit factor of 0.69 (330 trades) and B-grade 0.89 (502). That held in both halves (0.57 vs 0.88, then 0.82 vs 0.90) and on both indices (Nasdaq 0.63 vs 0.96, S&P 0.76 vs 0.80). Indices trend, so buying the cheap half of last week means buying against the trend. Both indices are in `GRADE_REVERSED`, so they show no grade.

**What this means.** The indices are on the Weekly plan and in the Signals table so you can watch them. Nothing sends a signal there. Use the plan for levels and trend, not for an A/B grade.
