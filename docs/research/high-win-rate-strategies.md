# Which strategy has the highest win rate, and is it the one that makes money?

Researched 2026-11-07. The question: "What is the best trading strategy with the highest win rate?" Scope: an India-based retail trader running intraday and swing strategies through this app on CoinDCX crypto perpetuals (and also forex, gold and index futures). Costs: **0.059% per side taker, 0.0236% maker**, GST included (see [exchange-fees-india.md](exchange-fees-india.md)).

Every URL below was accessed on **2026-11-07** unless marked "(2026-11-06, via scalping-strategies.md)". Those were read for [scalping-strategies.md](scalping-strategies.md) the day before and not reopened.

---

## TL;DR

- **Win rate on its own doesn't tell you whether a strategy makes money.** What matters is win rate × average win against loss rate × average loss, **after fees**. A strategy that wins 80% of the time with a 0.25R target needs to win **89%** at our taker fee just to break even (formula below).
- **We tested it.** A textbook "high win rate" setup was run through this repo's own simulator on 12 markets over 2 years at 0.059% per side: Bollinger-band fade, small target (0.5 × ATR), wide stop (2 × ATR). It **won 70–77% of trades and lost money on every market and every timeframe.** The median 1h account lost 83%; on 15m it lost 99.9%. A Connors-style RSI(2) won 53–63% and also lost on 34 of 36 market-timeframe pairs. Before fees it had a small edge (+0.02% to +0.07% a trade); the 0.118% round trip took all of it.
- **Highest win rate among the repo's coded strategies:** **MACD + 200 EMA + S/R on 4h**, at **45.1%** (175 trades across 12 markets, 2 years, 0.059% per side). It is also positive after fees: **+0.51% a trade**, median profit factor 1.40, and 8 of 12 markets made money. But it **qualifies on no market**, because it averages about 15 trades per market in 2 years. On 1h and 15m the same strategy wins 39–40% and **loses money**.
- **Best after fees, by the numbers we have:** **Liquidity Reversal MTF (1h setup, 5m entry).**
  - It wins **37.8%** but averages **+0.87% a trade**, with median profit factor 1.90.
  - 9 of 12 markets made money and it qualifies on **6** (ETH, AAVE, DOGE, NEAR, ADA, BTC), more than any other strategy.
  - Worst drawdown on any market: 19.4%.

  Runner-up is **Smart Money Concepts on 4h**: 29.7% win rate, +1.17% a trade, 9 of 12 profitable, qualifies on 4 markets. None of this is proof. These are the best of 21 strategy/timeframe combinations, picked after the fact, and the qualifying markets have only 20–30 trades each.
- **Across all 30,994 trades from every coded strategy, the pooled win rate is 30.8%.** Average net result is **−0.03% a trade** (+0.08% before fees). The 19 qualifying pairs win 38.3% and make +1.40% a trade. They don't win more often than the rest so much as they win bigger: average win is 2.8× the average loss.
- **The academic evidence agrees.** The best-documented edges have **low hit rates**:
  - Opening-range breakout on QQQ: **24% win rate**, +0.13R a trade, net of commissions ([Zarattini & Aziz 2023](#sources)).
  - Noise-area intraday momentum on SPY: **43% daily hit ratio**, Sharpe 1.33 net of costs ([Zarattini, Aziz & Barbon 2024](#sources)).
  - Time-series momentum on 58 futures markets: Sharpe above 1 ([Moskowitz, Ooi & Pedersen 2012](#sources)).

  The one paper here that reports a 77% "success rate" shows that this version **earned less** than the 54% version.
- **Most retail traders lose regardless of the strategy.** In India, 93% of individual F&O traders lost money over FY22–FY24 and about 91% in FY25 ([SEBI](#sources)). Under 1% of Taiwanese day traders beat the market consistently ([Barber et al.](#sources)).

**Straight answer:** the highest win rate you can buy is a small-target, wide-stop (or no-stop, martingale, grid) system: 70–98% winners. At our fees **it loses money**. Among strategies that actually made money here:

- **Liquidity Reversal MTF** is the best after fees (38% win rate, high payoff, 6 qualifying markets).
- **MACD + 200 EMA + S/R 4h** is the highest-win-rate strategy that was positive (45%).

None is proven enough to size up.

---

## 1. Win rate vs reward:risk, with fees

### The formula

Measure everything in **R**, where 1R is the amount you lose when the stop is hit. Let:

- `p` = win rate
- `R` = average win ÷ average loss (the payoff ratio; for fixed targets, target distance ÷ stop distance)
- `f` = round-trip fee as a fraction of the stop distance = `round-trip fee % ÷ stop distance %`

Each win pays `R − f` and each loss costs `1 + f`, so:

```
Expectancy per trade (in R) = p·(R − f) − (1 − p)·(1 + f) = p·(1 + R) − (1 + f)
Break-even win rate          = (1 + f) / (1 + R)        (= 1 / (1 + R) with no fees)
```

At CoinDCX taker fees the round trip is 2 × 0.059% = **0.118% of notional**. The fee is a fixed % of price, so **the tighter the stop, the more R the fee costs.** That is why tight-stop, small-target systems are the ones fees kill.

### Break-even win rates at our costs

| Setup | Stop distance | Target (R) | Break-even, no fees | Break-even, taker/taker 0.118% | Maker in / taker out 0.0826% |
|---|---|---|---|---|---|
| "High win rate": small target, wide stop | 1.0% | 0.25R | 80.0% | **89.4%** | 86.6% |
| Same, tighter stop | 0.5% | 0.25R | 80.0% | **98.9%** | |
| 1:1 scalp (5m VWAP / RSI(2) type) | 0.3% | 1R | 50.0% | **69.7%** | 63.8% |
| 2R intraday | 1.0% | 2R | 33.3% | 37.3% | |
| 2R swing (4h) | 3.0% | 2R | 33.3% | 34.6% | |
| 3R (SMC / sweep style) | 2.0% | 3R | 25.0% | 26.5% | |

### Worked example (₹1 lakh notional, 1% stop = ₹1,000 risk)

Fees per round trip: ₹1,00,000 × 0.118% = **₹118 = 0.118R**.

- **The 80% strategy (0.25R target).** Wins pay ₹250 − ₹118 = **₹132**. Losses cost ₹1,000 + ₹118 = **₹1,118**.
  - 100 trades: 80 × ₹132 − 20 × ₹1,118 = ₹10,560 − ₹22,360 = **−₹11,800**.
  - Before fees it was exactly break-even (80 × ₹250 = 20 × ₹1,000). The fees are the whole loss. An 80% win rate feels great and loses ₹118 a trade.
- **A 40% strategy (2R target).** Wins pay ₹2,000 − ₹118 = ₹1,882. Losses cost ₹1,118.
  - 100 trades: 40 × ₹1,882 − 60 × ₹1,118 = ₹75,280 − ₹67,080 = **+₹8,200** (+0.082R a trade).
  - At 35% it would lose ₹6,800. Low-win-rate systems are fragile too, just in the other direction.

**Rule of thumb:** for any strategy, compare its win rate with `(1 + f) / (1 + R)` using its *actual* average win and loss. The tables below give that "BE WR" column for every strategy.

---

## 2. External evidence

"Win rate" in the table is what the paper calls hit ratio, win rate or success rate. Where a paper doesn't report one, it says **not reported**.

| Strategy family | Study | Market, period | Win / hit rate | Return / Sharpe | Costs included? |
|---|---|---|---|---|---|
| Opening-range breakout (5-min, stop at the first bar's extreme, 10R or end-of-day target) | [Zarattini & Aziz 2023, SSRN 4416622](https://papers.ssrn.com/abstract=4416622) (PDF via [Wealth-Lab](https://wealth-lab.com/api/discussion/download/pdf/6590-ORB-Strategy-pdf)) | QQQ, Jan 2016 – Feb 2023, 1,795 trades | **24%** | +0.13R a trade; 31%/yr, Sharpe 1.12 (QQQ with 4× cap) | Commission $0.0005/share; **no slippage assumed** |
| Intraday "noise area" momentum, VWAP trailing stop | [Zarattini, Aziz & Barbon 2024, SFI 24-97](https://alexandria.unisg.ch/server/api/core/bitstreams/a99aba00-f967-49b3-aceb-f544dc386e0b/content) | SPY, 2007 – early 2024 | Base: **54%**; final version: **~43% daily hit ratio** ("decreased to 43% due to tighter stops") | Base 6.2%/yr, Sharpe 0.61. Final 19.6%/yr, Sharpe 1.33, max DD 25% | Yes: $0.0035/share commission + $0.001/share slippage |
| Market intraday momentum (first half-hour predicts last half-hour) | [Gao, Han, Li & Zhou, JFE 2018](https://ideas.repec.org/a/eee/jfinec/v129y2018i2p394-414.html); figures from the working paper ([copy](https://c.mql5.com/forextsd/forum/173/intraday_momentum_-_the_first_half-hour_return_predicts_the_last_half-hour_return.pdf)) | SPY, 1993–2013 | Timing on r1: **54.37%** "success rate" (always long: 50.42%). r1 + r12 combined: **77.05%**, but 4.39%/yr vs 6.67%/yr | 6.67%/yr gross (r1); 4.46%/yr after costs post-2001; 6.52% after costs post-2005 | Spread costs modelled; **commissions ignored** |
| Time-series momentum (12-month trend) | [Moskowitz, Ooi & Pedersen, JFE 2012](https://fairmodel.econ.yale.edu/ec439/jpde.pdf) ([RePEc](https://econpapers.repec.org/RePEc:eee:jfinec:v:104:y:2012:i:2:p:228-250)) | 58 futures (equity index, FX, commodity, bond), 1985–2009 | **Not reported** | Diversified Sharpe "greater than one", about 2.5× equities; strongest in extreme markets | Reported Sharpe ratios are **gross** |
| Crypto trend-following (Donchian ensemble, top-20 coins) | [Zarattini, Pagani & Barbon, SFI RP 25-80](https://ideas.repec.org/p/chf/rpseri/rp2580.html) | Crypto, daily | **Not seen** (full text not retrieved) | Net Sharpe above 1.5, alpha 10.8%/yr vs BTC (abstract) | Tested at 0.10%, 0.25% and 0.50% per trade |
| Crypto time-series momentum | [Liu & Tsyvinski, RFS 2021](https://econpapers.repec.org/RePEc:oup:rfinst:v:34:y:2021:i:6:p:2689-2727.) ([NBER w24877](https://www.nber.org/system/files/working_papers/w24877/w24877.pdf)) | BTC, ETH, XRP, from 2011 (BTC) | **Not reported** (a predictability study, not a trading rule) | Significant momentum at daily and weekly horizons | n/a |
| Short-term reversal (mean reversion) | [Nagel, RFS 2012, "Evaporating Liquidity"](https://nber.org/papers/w17653) | US stocks | **Not reported** | Reversal returns are pay for providing liquidity, highest when VIX is high | Paper's focus is gross returns to liquidity provision |
| Crypto 1–4h reversal after big moves | [De Nicola 2021, Ledger](https://ledger.pitt.edu/ojs/ledger/article/view/213) (2026-11-06, via scalping-strategies.md) | BTC | **Not reported** | Negative autocorrelation at 1–4 h | Not stated in abstract |
| Crypto overreactions | [Caporale & Plastun, CESifo 6861](https://econpapers.repec.org/RePEc:ces:ceswps:_6861) (2026-11-06, via scalping-strategies.md) | BTC, LTC, XRP, Dash | **Not reported** | "Do not clearly yield exploitable profits" | Costs cited as a likely reason |
| Crypto quarter-hour effect | [Kim & Hansen 2026, arXiv:2607.09426](https://arxiv.org/html/2607.09426) (2026-11-06, via scalping-strategies.md) | Binance perps, 2021–2024 | **Not reported** | About 0.5 bp per boundary, "one tenth of a single standard-tier taker fee" | Authors say it's smaller than costs |
| Funding/basis carry (delta-neutral) | [He, Manela, Ross & von Wachter, arXiv:2212.06888](https://arxiv.org/abs/2212.06888) (2026-11-06, via scalping-strategies.md) | Binance, 2020–2024 | **Not reported** | Sharpe 3.27 (BTC) to 6.63 (BNB) after fees and spreads; sniping the funding timestamp earns ~1.5 bp gross against ~3 bp of cost | Yes, at a fee tier needing $15M+/month |
| RSI(2) (Connors) | No peer-reviewed study found. Practitioner backtest: [Backtrex](https://backtrex.com/en/backtests/connors-rsi-2-sp-500) | S&P 500 CFD, 2016–2026, 73 trades | **71.2%** | 1.7%/yr vs 13.5% buy-and-hold; avg win 1.22%, avg loss 2.10% | Vendor site, unverified |
| Grid trading | [Chen, Chen & Jang 2025, arXiv:2506.11921](https://arxiv.org/abs/2506.11921v1) | BTC, ETH, 1-min, 2021–2024 | **Not reported** | A traditional grid's expected return is "essentially zero" under simple assumptions; a dynamic reset version beats it (figures not seen) | Not stated in abstract |
| Martingale (doubling) | [Pflaumer 2019, TU Dortmund](https://eldorado.tu-dortmund.de/handle/2003/38279) | Roulette (fair or negative-expectancy bets) | High short-term win probability | Doubling raises the chance of a small gain and makes large losses far more severe | n/a |

### Retail outcomes

| Study | Market | Result |
|---|---|---|
| [SEBI, Sep 2024](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html) | India equity F&O, FY22–FY24 | **93%** of individual traders lost money; aggregate losses above ₹1.8 lakh crore (headline; body not retrieved) |
| SEBI FY25 study, July 2025, as reported by [PTI / The Week](https://www.theweek.in/wire-updates/business/2025/07/07/dcm92-biz-sebi-derivatives-study.html) | India equity F&O, FY25 | **~91%** lost; net losses ₹1,05,603 crore, up 41% from ₹74,812 crore in FY24. The SEBI original was not retrieved. |
| [SEBI, July 2024](https://taxguru.in/sebi/sebi-study-finds-7-10-individual-intraday-traders-equity-cash-segment-losses.html) (2026-11-06, via scalping-strategies.md) | India equity cash intraday, FY23 | 71% lost; **80% of very frequent traders** lost |
| [Barber, Lee, Liu & Odean, "Cross-Section of Speculator Skill" (2011 WP)](https://faculty.haas.berkeley.edu/odean/papers/day%20traders/Day%20Trading%20Skill%20110523.pdf) | Taiwan day traders, 1992–2006 | About 13–15% profit net of fees in a typical year, but **less than 1% (1,000 of 360,000) outperform consistently**. Prior-year top 500: +28.1 bps/day after fees; bottom: −34.2 bps/day |
| [ESMA, 27 Mar 2018](https://www.esma.europa.eu/node/84933) | EU retail CFD accounts | **74–89%** of retail accounts typically lose money |

### What the papers say about win rate

1. **The robust edges are trend and momentum strategies with low hit rates and a right-skewed payoff.** ORB wins 24% of trades. Noise-area momentum dropped from a 54% to a 43% hit ratio when stops were tightened, and its Sharpe ratio roughly doubled.
2. **A higher success rate can mean lower returns.** In Gao et al., combining two signals lifted the "success rate" from 54% to 77% while cutting return from 6.67% to 4.39% a year. Part of that 77% is days with **zero** return: the paper counts "zero or positive" days as successes, so days out of the market count as wins. That is the kind of definition that turns into "90% win rate" in marketing.
3. **Short-term mean reversion is real but is pay for providing liquidity.** It is largest when markets are stressed, and in crypto the published effect is about the size of one fee or smaller. That is where high win rates come from, and why they don't survive retail costs.
4. **Grids and martingales have zero or negative expectancy before costs.** They swap many small wins for a rare, very large loss (§5).

---

## 3. This repo's strategies, ranked by win rate (2-year run at our real fee)

**How it was run.** A read-only script in the session scratchpad called this repo's `simulate` and `createCodedStrategy` with the Signals page settings from `src/lib/signals/scan.ts`:

- **Fees and sizing:** 0.059% per side, $10,000 start, whole balance per trade, 2% risk cap, no leverage, no slippage, no funding.
- **Data:** 2 years of Binance candles to 7 Nov 2026 (gold and silver have less history).
- **Markets:** BTC, ETH, XAU, XAG, XRP, SOL, AVAX, DOGE, ADA, SUI, NEAR, AAVE.
- **Strategies and timeframes:** every strategy on every timeframe it runs on (`scanTargets()`).

"Qualified" means it passes `QUALIFY_RULE`: at least 20 trades, PF ≥ 1.3, ≥ 8%/yr, beats buy and hold, max DD ≤ 20%, and both halves ≥ +2%. The numbers in each column mean:

- **WR net / gross:** win rate after fees and before fees.
- **Payoff:** average winning trade ÷ average losing trade, after fees.
- **BE WR:** the win rate needed to break even at that payoff.
- **Exp:** average net return per trade on notional, and in R where the trade had a stop.

Totals: 252 strategy-market-timeframe runs, 30,994 trades, 19 qualifying pairs with 689 trades. That matches [top-down-analysis.md](top-down-analysis.md), so this run reproduces the Signals page.

#### By strategy and timeframe, pooled over 12 markets, sorted by win rate

| # | Strategy | TF | Trades (markets) | WR net | WR gross | Payoff | BE WR | Exp net / trade | Exp gross / trade | Median PF | Markets profitable | Qualified | Median return | Median / worst DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | MACD + 200 EMA + S/R | 4h | 175 (12) | **45.1%** | 45.1% | 1.36 | 42.4% | **+0.51%** | +0.63% | 1.40 | 8/12 | 0 | +4.4% | 6.2% / 19.6% |
| 2 | MACD + 200 EMA + S/R | 1h | 713 (12) | 40.1% | 40.3% | 1.40 | 41.6% | −0.12% | +0.00% | 0.95 | 4/12 | 1 | −2.9% | 18.6% / 30.6% |
| 3 | MACD + 200 EMA + S/R | 15m | 2,858 (12) | 38.6% | 39.2% | 1.42 | 41.3% | −0.10% | +0.02% | 0.83 | 2/12 | 0 | −23.6% | 35.0% / 52.7% |
| 4 | **Liquidity Reversal MTF (1h setup)** | 5m | 267 (12) | 37.8% | 37.8% | 2.49 | 28.7% | **+0.87%** | +0.99% | **1.90** | 9/12 | **6** | +17.5% | 11.5% / 19.4% |
| 5 | MACD + SMA + ATR (no stop) | 4h | 396 (12) | 36.6% | 36.9% | 1.89 | 34.6% | +0.51% | +0.63% | 0.86 | 4/12 | 0 | −21.0% | 71.0% / 92.9% |
| 6 | Session London BOS | 15m | 5,073 (12) | 35.2% | 35.2% | 1.76 | 36.2% | −0.07% | +0.05% | 0.94 | 2/12 | 0 | −14.1% | 40.6% / 67.7% |
| 7 | Session London BOS | 1h | 1,057 (12) | 34.5% | 34.7% | 1.90 | 34.5% | −0.00% | +0.12% | 0.95 | 5/12 | 1 | −6.0% | 23.7% / 42.9% |
| 8 | MACD + SMA + ATR (no stop) | 1h | 1,903 (12) | 31.9% | 32.3% | 1.95 | 33.9% | −0.22% | −0.11% | 0.86 | 1/12 | 0 | −43.5% | 79.5% / 96.2% |
| 9 | MACD + SMA + ATR (no stop) | 15m | 7,327 (12) | 31.9% | 33.6% | 2.15 | 31.8% | +0.00% | +0.12% | 0.96 | 5/12 | 0 | −31.1% | 77.5% / 97.4% |
| 10 | Liquidity Reversal | 1h | 494 (12) | 31.8% | 32.2% | 2.58 | 28.0% | +0.33% | +0.45% | 1.30 | 10/12 | 2 | +15.5% | 14.6% / 42.2% |
| 11 | **Smart Money Concepts** | 4h | 279 (12) | 29.7% | 29.7% | 3.14 | 24.2% | **+1.17%** | +1.29% | 1.40 | 9/12 | 4 | +12.7% | 13.9% / 19.3% |
| 12 | Liquidity Reversal | 15m | 1,942 (12) | 27.0% | 27.1% | 2.33 | 30.0% | −0.12% | −0.00% | 0.79 | 2/12 | 0 | −11.4% | 32.0% / 54.7% |
| 13 | Liquidity Reversal | 4h | 112 (12) | 25.0% | 25.0% | 2.94 | 25.4% | −0.07% | +0.05% | 0.73 | 5/12 | 0 | −1.9% | 9.4% / 21.2% |
| 14 | Smart Money Concepts | 15m | 4,015 (12) | 24.6% | 24.6% | 2.77 | 26.5% | −0.12% | −0.00% | 0.86 | 3/12 | 0 | −34.4% | 53.0% / 79.9% |
| 15 | Smart Money Concepts | 1h | 986 (12) | 24.3% | 24.3% | 2.88 | 25.8% | −0.16% | −0.04% | 0.87 | 5/12 | 1 | −11.1% | 32.5% / 65.3% |
| 16 | Extreme Order Block | 15m | 1,439 (12) | 24.0% | 24.0% | 2.89 | 25.7% | −0.09% | +0.03% | 0.80 | 1/12 | 0 | −18.0% | 30.5% / 46.5% |
| 17 | Liquidity Sweep | 1h | 236 (12) | 23.3% | 23.3% | 3.39 | 22.8% | +0.06% | +0.17% | 0.96 | 6/12 | 2 | −1.2% | 18.3% / 35.1% |
| 18 | Liquidity Sweep | 15m | 1,067 (12) | 20.1% | 20.1% | 3.67 | 21.4% | −0.08% | +0.04% | 0.84 | 1/12 | 0 | −11.2% | 31.7% / 40.5% |
| 19 | Top-Down (weekly/daily bias) | 5m | 167 (12) | 18.6% | 18.6% | 4.20 | 19.2% | −0.04% | +0.08% | 0.97 | 6/12 | 0 | −0.2% | 12.2% / 20.1% |
| 20 | Liquidity Sweep | 4h | 68 (12) | 17.6% | 17.6% | 3.02 | 24.9% | −1.58% | −1.46% | 0.69 | 3/12 | 0 | −2.4% | 12.1% / 18.5% |
| 21 | Perfect Entry | 1h | 420 (12) | 13.8% | 13.8% | 8.05 | 11.0% | +0.57% | +0.69% | 1.10 | 7/12 | 2 | +7.5% | 25.3% / 49.7% |
| | **All coded strategies** | | 30,994 (252 runs) | 30.8% | 31.3% | 2.20 | 31.2% | **−0.03%** | +0.08% | 0.92 | 98/252 | 19 | −4.5% | 21.0% / 97.4% |

How to read it:

- **Win rate doesn't predict profit here either.** Ranks 1–3 are the same strategy. On 4h it is positive; on 1h and 15m it wins 39–40%, needs 41–42%, and loses. Rank 4 wins less but each win is 2.5× the loss, so it needs only 28.7%.
- **The profitable rows are the ones whose win rate clears BE WR by a margin**, not the ones with the highest win rate:
  - Liquidity Reversal MTF: 37.8% against 28.7% needed.
  - SMC 4h: 29.7% against 24.2%.
  - Perfect Entry: 13.8% against 11.0%.
- **Fees decide most lower-timeframe rows.** Many 15m rows are flat or slightly positive before fees (+0.02% to +0.12% a trade) and negative after. The 0.118% round trip is larger than their gross edge.
- **Perfect Entry** wins 1 trade in 7 and still makes money on average, but its worst market drew down 49.7%. It runs at the edge of its break-even, so a small drop in win rate turns it negative.
- **MACD + SMA + ATR has no stop**, which explains its 71–97% drawdowns. Its 4h expectancy is positive on average, but only 4 of 12 markets made money.

#### The 19 qualifying pairs, sorted by win rate

| Strategy | TF | Market | Trades | WR | Payoff | BE WR | PF | Exp net / trade | Exp R | Return (2y) | Max DD | Halves |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Liquidity Reversal MTF | 5m | ETH | 21 | **52.4%** | 2.47 | 28.8% | 2.68 | +1.64% | +0.87 | +31.1% | 7.1% | +10.4% / +18.8% |
| Liquidity Sweep | 1h | ETH | 26 | 50.0% | 3.36 | 22.9% | 3.52 | +2.42% | +1.26 | +58.8% | 11.9% | +3.2% / +53.8% |
| MACD + 200 EMA + S/R | 1h | ADA | 60 | 48.3% | 1.35 | 42.5% | 1.34 | +0.54% | +0.13 | +18.9% | 10.5% | +2.8% / +15.6% |
| Liquidity Reversal MTF | 5m | AAVE | 30 | 46.7% | 2.79 | 26.4% | 2.45 | +2.18% | +0.61 | +45.9% | 15.0% | +5.7% / +38.0% |
| Liquidity Reversal MTF | 5m | DOGE | 24 | 45.8% | 4.22 | 19.2% | 2.14 | +3.04% | +0.54 | +31.6% | 10.2% | +23.6% / +6.5% |
| Liquidity Reversal MTF | 5m | NEAR | 20 | 45.0% | 2.38 | 29.6% | 2.08 | +1.94% | +0.62 | +25.4% | 10.5% | +4.2% / +20.3% |
| Liquidity Reversal MTF | 5m | ADA | 25 | 44.0% | 2.34 | 29.9% | 1.92 | +1.36% | +0.60 | +29.1% | 13.1% | +12.6% / +14.6% |
| Session London BOS | 1h | BTC | 86 | 43.0% | 1.82 | 35.4% | 1.39 | +0.70% | +0.25 | +38.1% | 17.0% | +5.7% / +30.6% |
| Liquidity Sweep | 1h | NEAR | 24 | 41.7% | 5.26 | 16.0% | 2.50 | +4.06% | +1.08 | +59.0% | 17.7% | +43.8% / +10.6% |
| Liquidity Reversal MTF | 5m | BTC | 25 | 40.0% | 3.08 | 24.5% | 1.87 | +0.78% | +0.29 | +17.1% | 6.7% | +6.0% / +10.4% |
| Liquidity Reversal | 1h | XAU | 23 | 39.1% | 3.02 | 24.9% | 1.89 | +0.40% | +0.57 | +9.4% | 5.8% | +2.4% / +6.8% |
| Smart Money Concepts | 4h | BTC | 29 | 37.9% | 2.65 | 27.4% | 1.88 | +1.26% | +0.75 | +30.6% | 14.1% | +5.1% / +24.3% |
| Liquidity Reversal | 1h | BTC | 45 | 37.8% | 2.65 | 27.4% | 1.42 | +0.57% | +0.30 | +17.4% | 9.9% | +5.8% / +11.0% |
| Smart Money Concepts | 4h | SUI | 25 | 36.0% | 3.13 | 24.2% | 1.53 | +3.38% | +0.40 | +19.8% | 10.8% | +11.4% / +7.5% |
| Smart Money Concepts | 4h | AVAX | 28 | 35.7% | 3.71 | 21.2% | 1.57 | +3.59% | +0.43 | +23.3% | 15.9% | +17.2% / +5.2% |
| Smart Money Concepts | 1h | SUI | 82 | 31.7% | 2.91 | 25.6% | 1.34 | +0.86% | +0.27 | +47.3% | 16.3% | +18.1% / +24.7% |
| Smart Money Concepts | 4h | SOL | 32 | 31.2% | 2.23 | 31.0% | 1.63 | +0.05% | +0.44 | +30.9% | 12.2% | +16.6% / +12.2% |
| Perfect Entry | 1h | AVAX | 47 | 21.3% | 6.81 | 12.8% | 1.78 | +1.65% | +0.94 | +70.2% | 18.6% | +16.3% / +46.4% |
| Perfect Entry | 1h | NEAR | 37 | 18.9% | 6.63 | 13.1% | 1.45 | +1.16% | +0.43 | +29.4% | 17.4% | +2.9% / +25.7% |

Pooled, the 19 win **38.3%** and make **+1.40% a trade**. The payoff is 2.76, so the break-even win rate is 26.6%. None of the 19 wins more than 53%. Even the best rows have only 20–86 trades, so a single win rate is uncertain by roughly ±10 points.

The "Exp R" column is the average of net P&L ÷ initial risk. It is noisy because of the 2% risk cap: some trades were sized down, so their R differs from their % return.

**Forex and indices** (from [top-down-analysis.md](top-down-analysis.md), same simulator at 0.01% per side):

- Forex: of 140 strategy-pair runs, only Liquidity Reversal on USD/JPY 1h qualifies (39 trades, PF 2.26, +27.9%/yr). The win rate wasn't recorded in that note.
- Index futures (Nasdaq 100, S&P 500): **no strategy qualifies**. Both indices rose about 24–29%, and nothing beat buy and hold with an acceptable drawdown.

### The guides' 6-month numbers (0.04% per side, 5 May – 3 Nov 2026)

The guides (`src/guides/*.ts`, settings in `src/guides/shared.ts`) quote shorter, cheaper runs. The highest single win rate anywhere in them is **Liquidity Sweep on ETH 1h: 85.7% (6 of 7 trades), PF 27.5, +35.8%**. Over 2 years at the real fee, the same strategy on the same market won **50.0% of 26 trades** (PF 3.52, +58.8%). It is still one of the best rows, but the "86% strategy" was seven trades of luck. On BTC 1h, the same guide shows 11.1% (1 of 9).

| Guide | Highest win rate quoted | Trades | PF | Return | Lowest quoted |
|---|---|---|---|---|---|
| Liquidity Sweep | ETH 1h 85.7% | 7 | 27.46 | +35.8% | BTC 1h 11.1% |
| Top-Down | BTC 66.7% | 3 | 17.36 | +7.4% | ETH 16.7% |
| Liquidity Reversal MTF | ETH 60.0% | 5 | 3.59 | +7.9% | XRP 14.3% |
| Liquidity Reversal | BTC 1h 50.0% | 12 | 1.65 | +6.4% | ETH 1h 30.0% |
| Session London BOS | BTC 38.4% | 99 | 1.20 | +13.3% | ETH 37.3% |
| MACD + 200 EMA + S/R | ETH 37.9% | 66 | 0.95 | −1.7% | BTC 31.6% |
| MACD + SMA + ATR | ETH 32.7% | 162 | 1.30 | +44.9% | BTC 31.3% |
| Extreme Order Block | BTC 31.7% | 41 | 0.89 | −1.9% | ETH 17.1% |
| Smart Money Concepts | ETH 25.2% | 107 | 1.01 | +0.7% | BTC 21.6% |
| Perfect Entry | ETH 20.0% | 5 | 1.07 | +0.3% | BTC 6.3% |

Every win rate above 50% in the guides comes from **3–12 trades**. With 7 trades, a true 40% strategy shows 6+ wins about 2% of the time. Across 10 guides and 2–5 markets each, a couple of rows like that are expected by chance alone.

---

## 4. "High win rate" strategies run through the same simulator

These two are **not in the repo**. They were coded in the scratchpad only to measure the classic high-win-rate designs on our markets and costs, with the same settings as §3.

- **BB fade, small target:** close below the lower Bollinger band (20, 2) → long; above the upper → short. Target 0.5 × ATR(14), stop 2 × ATR(14), i.e. a 0.25R target.
- **RSI(2), Connors style:** long when close > SMA(200) and RSI(2) < 10; short when close < SMA(200) and RSI(2) > 90. Exit when close crosses SMA(5). **No stop**, as in the original.

| Strategy | TF | Trades (12 markets) | WR net | WR gross | Payoff | BE WR | Exp net / trade | Exp gross / trade | Median PF | Markets profitable | Median return (2y) | Median / worst DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BB fade, 0.25R target | 1h | 15,180 | **76.7%** | 78.4% | 0.22 | 82.2% | **−0.15%** | −0.04% | 0.69 | **0/12** | **−82.6%** | 84.0% / 90.8% |
| BB fade, 0.25R target | 4h | 3,889 | **76.6%** | 76.6% | 0.23 | 81.0% | −0.26% | −0.14% | 0.69 | 0/12 | −36.1% | 41.4% / 57.5% |
| BB fade, 0.25R target | 15m | 61,155 | **70.5%** | 79.3% | 0.23 | 81.5% | −0.12% | −0.00% | 0.66 | 0/12 | **−99.9%** | 99.9% / 100.0% |
| RSI(2), no stop | 4h | 1,979 | 62.6% | 65.1% | 0.57 | 63.7% | −0.05% | +0.07% | 0.86 | 2/12 | −11.6% | 29.3% / 75.8% |
| RSI(2), no stop | 1h | 7,968 | 58.7% | 64.6% | 0.58 | 63.5% | −0.10% | +0.02% | 0.81 | 0/12 | −58.1% | 65.7% / 75.9% |
| RSI(2), no stop | 15m | 31,878 | 52.7% | 65.6% | 0.63 | 61.4% | −0.08% | +0.03% | 0.73 | 0/12 | −90.8% | 92.6% / 97.2% |

The best single BB-fade runs won **80.7%** (NEAR 15m, 5,330 trades, −99.6%) and **80.3%** (BTC 4h, 366 trades, −29.9%).

**Compare:** the highest-win-rate *repo* strategy (MACD + 200 EMA + S/R 4h, 45.1%) and the best-after-fees one (Liquidity Reversal MTF, 37.8%) both win far less often than these demos, and both made money.

What this shows:

- **The win rate is real and it still loses.** BB fade wins about 77% of trades on 1h and 4h. Its average win is less than a quarter of its average loss, so it needs about 81–82% to break even, and it falls 4–11 points short on every timeframe (0 of 12 markets profitable on each).
- **Fees turn winners into losers.** RSI(2) on 15m wins 65.6% before fees and 52.7% after: about one winner in five was smaller than the 0.118% round trip. Before fees, RSI(2) had a small positive expectancy on every timeframe (+0.02% to +0.07% a trade). After fees it was negative on all three.
- **No stop means huge drawdowns.** RSI(2)'s worst market drew down 76% on 1h and 4h. Most of the time a high-win-rate system's equity curve looks smooth, until it doesn't.

---

## 5. Red flags for "80–90%+ win rate" claims

1. **Small target, wide or no stop.** By the formula, 90% wins with 0.11R winners is break-even before fees. Ask for the average win and average loss, not the win rate.
2. **Martingale or averaging down.** Double the size after each loss, up to 6 steps, on a 50/50 bet: each cycle "wins" with probability 63/64 = **98.4%**, but the 1.6% losing cycle costs 63 units. Expectancy before fees is **exactly zero** (63/64 × 1 = 1/64 × 63). After fees it's negative, and the chance of at least one blow-up in 100 cycles is 1 − (63/64)^100 = **79%**.
3. **Grid bots.** A grid sells into every bounce and buys every dip, so it books many small wins and holds the losers as open inventory. In a trend that inventory is the drawdown. A traditional grid's expected return is "essentially zero" under simple assumptions ([Chen et al. 2025](https://arxiv.org/abs/2506.11921v1)), before our 0.118% per round trip.
4. **Win rate counted on closed trades only.** Losing positions left open (or "being managed") don't count as losses. Ask for open P&L and max drawdown.
5. **"Success" that includes flat days or break-even exits.** Gao et al. count zero-return days as successes; many sellers count break-even stop-outs as "not a loss".
6. **Tiny samples.** Our guides' 86% (7 trades) became 50% over 26 trades. Ask for at least 100 trades, or 20+ per market across several markets, and results for both halves of the period.
7. **No fees, no slippage, bar-close fills.** Every high-win-rate design here has small wins, so costs hit it hardest. Our scalping research found taker fills are adversely selected and limit fills are adversely selected too (Albers et al., in [scalping-strategies.md](scalping-strategies.md)).
8. **Selected after the fact.** If someone tried 50 settings and shows you the best, its win rate is biased up. That applies to our own "best" rows too.
9. **Selling options or "income" strategies.** Short premium wins most months for the same reason as the small-target fade, with the same tail. 93% of Indian F&O traders lost money over FY22–24 ([SEBI](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html)).

---

## 6. Answer

**Highest win rate, any design:** a small-target, wide-stop fade. Ours won **70–77%** (best single run 80.7%). Martingale and grid designs can show 95%+. **All of them lost money at our fees:**

- The BB fade lost on 36 of 36 market-timeframe runs.
- RSI(2) lost on 34 of 36.
- Martingale and grids have zero expectancy before fees and carry a blow-up risk.

**Highest win rate among the repo's coded strategies:** **MACD + 200 EMA + S/R on 4h, 45.1%** (175 trades, 12 markets). It was positive after fees (+0.51% a trade, median PF 1.40, 8 of 12 markets). But it **does not qualify on any market**: about 15 trades per market in 2 years is too few. On 1h and 15m the same rules won 39–40% and **lost money**. The single highest qualifying win rate is **Liquidity Reversal MTF on ETH: 52.4% of 21 trades** (PF 2.68, +31.1% in 2 years).

**Best after fees:** **Liquidity Reversal MTF (1h setup, 5m entry).**

- **Numbers:** win rate 37.8%, +0.87% a trade, median PF 1.90.
- **Markets:** 9 of 12 profitable; qualifies on 6 (ETH, AAVE, DOGE, NEAR, ADA, BTC).
- **Drawdown:** worst 19.4%.
- **Runner-up:** **Smart Money Concepts 4h** (29.7%, +1.17% a trade, qualifies on BTC, SOL, AVAX, SUI).
- **Caveats:**
  - Both are the best of 21 combinations, picked after the fact, on 20–30 trades per market.
  - Both hold through funding, which the simulator doesn't charge.
  - Liquidity Reversal MTF's own guide says not to trade it on silver or XRP.

**Is any of this "proven"?** No. The evidence, in this repo and in the literature, supports a weaker claim: **low-to-moderate win rate (25–45%) with winners 2–3× the size of losers, on 1h-and-up setups, is the only shape that has survived our 0.118% round trip.** Pick strategies by expectancy after fees, drawdown and sample size, not by win rate.

---

## 7. Next steps for this codebase

1. **Show expectancy next to win rate everywhere.** The simulator already computes `expectancy`, `avgWin`, `avgLoss` and `avgR` (`src/domain/backtesting/metrics.ts`). Add to the backtest page and the Signals table:
   - payoff ratio,
   - break-even win rate `(1 + f)/(1 + R)`,
   - average net R per trade.

   A row should never show win rate without them.
2. **Show a gross vs net column.** Run each backtest at fee 0 as well, or add back `totalFees`. A strategy whose pre-fee expectancy is under 0.118% a trade can't be fixed with better entries, only with cheaper execution or bigger targets.
3. **Add a minimum stop-distance check.** Flag any signal where the round-trip fee is more than 10% of the stop distance (stop < 1.18% at taker fees). Those are the trades where fees decide the outcome.
4. **Don't add grid, martingale or no-stop averaging strategies to `CODED_STRATEGIES`.** If one is ever wanted for research, its backtest must report the worst drawdown and the probability of a blow-up, not win rate.
5. **Model maker entries.** A maker-in / taker-out option (0.0826% round trip) with conservative fills (fill only if the next bar trades through the limit). `exchange-fees-india.md` covers why that's the biggest cost lever.
6. **Add funding to the simulator** before trusting any strategy that holds across funding times (SMC 4h, MACD + 200 EMA 4h, and the 1h-stop Liquidity Reversal MTF). `src/lib/backtesting.ts` and `src/domain/backtesting` still record funding as 0.
7. **Out-of-sample check on the "best after fees" rows.** Walk-forward on Liquidity Reversal MTF and SMC 4h across all 12 markets (`pnpm backtest:walk-forward`), plus a check of the 4h MACD + 200 EMA with more history (it needs more than 15 trades per market).
8. **Update the guides' "backtest" sections** to quote payoff and break-even win rate, so a beginner reading "50% win rate" also sees what it needs to be.
9. **Keep the user-facing message simple:** pick strategies by expectancy after fees, drawdown and sample size, not by win rate.

---

## Sources

All accessed 2026-11-07 unless marked.

**Strategy evidence**
- Zarattini & Aziz (2023), Can day trading really be profitable? SSRN 4416622. https://papers.ssrn.com/abstract=4416622 ; PDF: https://wealth-lab.com/api/discussion/download/pdf/6590-ORB-Strategy-pdf
- Zarattini, Aziz & Barbon (2024/2025), Beat the market: an effective intraday momentum strategy for S&P500 ETF (SPY), SFI RP 24-97. https://alexandria.unisg.ch/server/api/core/bitstreams/a99aba00-f967-49b3-aceb-f544dc386e0b/content ; https://www.sfi.ch/de/publications/n-24-97-beat-the-market-an-effective-intraday-momentum-strategy-for-s-p500-etf-spy
- Gao, Han, Li & Zhou (2018), Market intraday momentum, *JFE* 129(2). https://ideas.repec.org/a/eee/jfinec/v129y2018i2p394-414.html ; working paper copy: https://c.mql5.com/forextsd/forum/173/intraday_momentum_-_the_first_half-hour_return_predicts_the_last_half-hour_return.pdf
- Moskowitz, Ooi & Pedersen (2012), Time series momentum, *JFE* 104(2). https://fairmodel.econ.yale.edu/ec439/jpde.pdf ; https://econpapers.repec.org/RePEc:eee:jfinec:v:104:y:2012:i:2:p:228-250
- Zarattini, Pagani & Barbon, Catching crypto trends, SFI RP 25-80. https://ideas.repec.org/p/chf/rpseri/rp2580.html
- Liu & Tsyvinski (2021), Risks and returns of cryptocurrency, *RFS* 34(6). https://econpapers.repec.org/RePEc:oup:rfinst:v:34:y:2021:i:6:p:2689-2727. ; https://www.nber.org/system/files/working_papers/w24877/w24877.pdf
- Nagel (2012), Evaporating liquidity, *RFS* 25(7). https://nber.org/papers/w17653
- De Nicola (2021), On the intraday behavior of Bitcoin, *Ledger* 6. https://ledger.pitt.edu/ojs/ledger/article/view/213 (2026-11-06)
- Caporale & Plastun, Price overreactions in the cryptocurrency market, CESifo WP 6861. https://econpapers.repec.org/RePEc:ces:ceswps:_6861 (2026-11-06)
- Kim & Hansen (2026), The quarter-hour effect, arXiv:2607.09426. https://arxiv.org/html/2607.09426 (2026-11-06)
- He, Manela, Ross & von Wachter, Fundamentals of perpetual futures, arXiv:2212.06888. https://arxiv.org/abs/2212.06888 (2026-11-06)
- Backtrex, Connors RSI(2) on the S&P 500 (vendor backtest, not peer-reviewed). https://backtrex.com/en/backtests/connors-rsi-2-sp-500
- Chen, Chen & Jang (2025), Dynamic grid trading strategy, arXiv:2506.11921. https://arxiv.org/abs/2506.11921v1
- Pflaumer (2019), A statistical analysis of the roulette martingale system. https://eldorado.tu-dortmund.de/handle/2003/38279

**Retail outcomes**
- SEBI (23 Sep 2024), updated F&O study, FY22–FY24. https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html
- PTI via The Week (7 Jul 2025), SEBI FY25 derivatives study. https://www.theweek.in/wire-updates/business/2025/07/07/dcm92-biz-sebi-derivatives-study.html
- SEBI (Jul 2024), intraday equity cash study (press release text). https://taxguru.in/sebi/sebi-study-finds-7-10-individual-intraday-traders-equity-cash-segment-losses.html (2026-11-06)
- Barber, Lee, Liu & Odean (2011 WP; published 2014 *J. Financial Markets* 18), The cross-section of speculator skill. https://faculty.haas.berkeley.edu/odean/papers/day%20traders/Day%20Trading%20Skill%20110523.pdf
- ESMA (27 Mar 2018), product intervention measures on CFDs and binary options. https://www.esma.europa.eu/node/84933

**Repo**
- `src/strategies/registry.ts`, `src/lib/signals/scan.ts` (`QUALIFY_RULE`, `MARKET_COSTS`), `src/domain/backtesting/`, `src/guides/*.ts`, `src/guides/shared.ts`
- [scalping-strategies.md](scalping-strategies.md), [top-down-analysis.md](top-down-analysis.md), [exchange-fees-india.md](exchange-fees-india.md)
