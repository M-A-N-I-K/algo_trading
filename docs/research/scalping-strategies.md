# Intraday / scalping strategies for crypto perps and gold: what the evidence supports

Researched 2026-11-06. Scope: holding periods from minutes to a few hours, 1m–15m charts, liquid crypto perpetuals (BTC, ETH, SOL, …) and gold, traded on CoinDCX futures with a ~$350 account.

Cost assumptions used throughout (CoinDCX base tier incl. 18% GST, see [Costs](#0-our-cost-level-in-numbers)):

| Execution | Per side | Round trip |
|---|---|---|
| Taker in, taker out | 0.059% | **0.118%** |
| Maker in, taker out (typical for a stop exit) | 0.024% + 0.059% | **0.083%** |
| Maker in, maker out | 0.024% | **0.047%** |

Slippage and funding come on top of these.

---

## Short answer

No. I found **no credible primary source showing a retail-accessible scalping strategy (1m–15m, holding minutes) on crypto perpetuals or gold that is profitable after costs at our level of 0.05–0.12% per round trip.** The intraday patterns that are statistically real in crypto (intraday momentum, short-horizon reversal, quarter-hour order-flow effects, the funding-time price drift) are mostly **a fraction of a basis point to a few basis points per trade**. That is smaller than a single taker fee. Where papers do model costs, the edge either goes away or belongs to fee tiers and latency we don't have.

The evidence that holds up after costs points to **longer holding periods and fewer trades**: hourly-to-daily trend/momentum, and the delta-neutral **funding/basis carry trade**. This fits our own backtests: 5m/15m mean reversion had a pre-fee profit factor of about 1.0 and died on fees, while the same sweep logic on 1h made money. Outcome studies point the same way: well under 1% of retail day traders are reliably profitable after costs.

---

## 0. Our cost level, in numbers

- **CoinDCX fees.** The official VIP page lists USDT-M futures at a base tier of **0.02% maker / 0.05% taker, plus 18% GST**, so 0.0236% / 0.059% effective ([CoinDCX VIP page](https://coindcx.com/vip/)). The page returned HTTP 403 to automated fetches, so these figures come from search-engine extracts of it. They match the brief's 0.059% taker figure. Verify in-app before relying on the maker number.
- **Binance funding mechanics** (also the reference for our backtest data). By default funding is paid every 8 h at 00:00, 08:00 and 16:00 UTC; some contracts use shorter intervals. The interest component is 0.01% per 8 h, and `F = P̄ + clamp(0.01% − P̄, ±0.05%)`, so funding sits at exactly 0.01% while the premium index is roughly between −0.04% and +0.06%. Closing before the timestamp means you neither pay nor receive ([Binance FAQ](https://www.binance.com/en/support/faq/360033525031)). At the default, a long pays about 0.03%/day, roughly **11%/yr simple**, which matters for any strategy that holds overnight.
- **How big the fee is next to the edge.** A trade whose target is 0.30% (typical for a 5m VWAP or RSI(2) scalp) spends **39% of the target on fees at taker/taker** and 16% at maker/maker. With our observed average win of about 0.5× the average loss, the pre-fee profit factor has to be well above 1.3 before fees leave anything. Ours was about 1.0.
- **Our backtester does not model funding.** `src/lib/backtesting.ts` has no funding term; funding only appears in the journal metrics. Any strategy held across funding timestamps, including carry, needs that added before its results can be trusted.
- **India tax** (affects any spot leg). Transfers of virtual digital assets are taxed at a flat 30%, losses cannot be set off or carried forward, and 1% TDS applies under s.194S ([Income Tax Dept: Taxation of VDA](https://incometaxindia.gov.in/w/taxation-of-virtual-digital-asset-vda-)). I did not verify how CoinDCX futures P&L is classified. Ask a tax professional.

---

## 1. Academic evidence on intraday predictability in crypto

### 1a. Intraday time-series momentum (first part of the "day" predicts the last part)

- **Equity origin.** In SPY data from 1993 to 2013, the first half-hour return (measured from the previous close) predicts the last half-hour return. The effect is stronger on volatile, high-volume and macro-news days and also shows up in 10 other ETFs ([Gao, Han, Li & Zhou 2018, JFE](https://ideas.repec.org/a/eee/jfinec/v129y2018i2p394-414.html)). Equities only. The abstract does not report results net of costs.
- **International.** The effect is economically sizable and statistically significant both in and out of sample in most of 16 developed markets. It is stronger when liquidity is low, volatility is high and information arrives in discrete chunks ([Li, Sakkas & Urquhart 2022, JFM](https://centaur.reading.ac.uk/95566)). Equity indices only; I could not confirm how it treats costs.
- **Bitcoin.** Bitcoin trades 24/7 and has no open or close, so the authors use volume as a proxy for trading time. They find the first half-hour return predicts the last half-hour, in sample and out of sample. The effect is strongest in high-volume, high-volatility sessions and pays off mostly during Bitcoin downturns, and the authors attribute it to liquidity provision ([Shen, Urquhart & Wang 2022, Financial Review, doi:10.1111/fire.12290](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/)). **I could not get the full text**, so the exact session definition, sample period and cost treatment are unverified. The strategy trades about once a day, which means about 43%/yr of fee drag at taker/taker (365 × 0.118%) and about 17%/yr at maker/maker.
- **Momentum and reversal.** In Bitcoin data from March 2013 to May 2020, both intraday momentum and intraday reversal appear. The patterns change around large jumps, FOMC announcements, liquidity conditions and COVID, and similar effects appear in ETH, LTC and XRP. Timing strategies beat buy-and-hold "in economic value" ([Wen, Bouri, Xu & Zhao 2022, NAJEF](https://ideas.repec.org/a/eee/ecofin/v62y2022ics1062940822000833.html)). The abstract does not state cost assumptions. The result depends on regime, so expect it to be unstable.

**Takeaway:** intraday momentum in crypto is real at the half-hour-to-session scale, but the published crypto evidence does not show that it survives 0.1% round trips. It holds once per day, so at best it is a low-frequency strategy and not a scalp.

### 1b. Short-horizon mean reversion

- BTC returns show significant negative first-order autocorrelation at 1-, 2- and 4-hour horizons, and larger moves reverse more. The author attributes this to overreaction and liquidation cascades ([De Nicola 2021, Ledger 6:58–80](https://ledger.pitt.edu/ojs/ledger/article/view/213)). A simple strategy is tested, but the abstract gives no cost treatment.
- Overreactions in BTC, LTC, XRP and Dash "do not clearly yield exploitable profits", and the authors suggest transaction costs as one reason ([Caporale & Plastun, CESifo WP 6861](https://econpapers.repec.org/RePEc:ces:ceswps:_6861)).
- A cross-sectional stat-arb approach does survive costs, but it is not a single-market scalp. A random forest on minute data across 40 coins goes long the top 3 and short the bottom 3 for 120-minute holds, and earns **7.1 bps/day after 15 bps per half-turn**. The out-of-sample window is short (reported as Jun–Sep 2018, from a truncated snippet) and limited by volume ([Fischer, Krauss & Deinert 2019, JRFM](https://mdpi.com/1911-8074/12/1/31)). It needs simultaneous long/short across many coins, 2018-era liquidity and an ML pipeline. Not a fit for $350.

**Takeaway:** the reversal that exists is at the **1–4 hour** horizon after large moves, not at the 5m Bollinger-band scale. That matches our result: a 63–66% win rate with wins half the size of losses gives a pre-fee profit factor of about 1.

### 1c. Time-of-day, weekday and candle-boundary seasonality

- Data from 7 exchanges with more than 15M observations show persistent patterns in volume (lower in local evenings and on weekends) but **"no persistent effects" in returns** ([Baur, Cahill, Godfrey & Liu 2019, FRL](https://econpapers.repec.org/RePEc:eee:finlet:v:31:y:2019:i:c:p:78-92)).
- Activity, volatility and liquidity across 38 exchanges peak at 16:00–17:00 UTC ([Brauneis et al., "The crypto world trades at tea time"](https://irep.ntu.ac.uk/id/eprint/51576)). This describes volatility and liquidity, not a return signal.
- "Buy BTC 21:00, sell 23:00 UTC" earned 33%/yr with a −22.45% max drawdown on Gemini hourly data from Oct 2015 to Feb 2022 ([Quantpedia, Padyšák & Vojtko 2022](https://quantpedia.com/are-there-seasonal-intraday-or-overnight-anomalies-in-bitcoin/)). This is a vendor research note, not peer-reviewed, and **costs are not reported**. At our taker cost the fee drag (~43%/yr) exceeds the gross return. **Treat as an unverified claim.**
- Returns cluster at the first minute of each 15-minute candle ([Shanaev, Vasenin & Stepanov 2023, Heliyon](https://researchportal.northumbria.ac.uk/en/publications/turn-of-the-candle-effect-in-bitcoin-returns/)). I could not get the full text, so magnitude and costs are unverified.
- **The Quarter-Hour Effect** ([Kim & Hansen 2026, arXiv:2607.09426](https://arxiv.org/html/2607.09426)) uses Binance perps for BTC, ETH, XRP, SOL, DOGE and ADA from Jan 2021 to Oct 2024. Opening returns at quarter-hour boundaries are predictable out of sample, but the predictable part **"averages about 0.5 bp per boundary… about one tenth of a single standard-tier taker fee and one twentieth of a round trip"**. The authors say it is "small relative to trading costs" and frame it as useful for execution and market making, not as a strategy. Order imbalance predicts returns over about 4–12 hours. **This is the most direct evidence on our question, and it is negative for scalping.**

### 1d. Order-flow imbalance (OFI)

- On Binance perps, 1-second order book data from Jan 2022 to Oct 2025 predict **3-second** mid-price returns, with similar feature patterns across BTC, LTC, ETC, ENJ and ROSE. The paper reports taker backtests **gross of fees** and maker backtests that ignore fees. In a flash crash the maker strategy lost money because it was "providing liquidity to this informed, directional flow" ([Bieganowski & Ślepaczuk 2026, arXiv:2602.00776](https://arxiv.org/html/2602.00776)). A 3-second horizon is unreachable with our latency and fees.
- In the quarter-hour paper above, order imbalance predicts over hours, not minutes, and the magnitudes sit below fees.

---

## 2. Microstructure: who earns money at high frequency

- **Taker orders get adversely selected by latency.** Millions of live market and marketable-limit orders on Bybit and Binance show that profitable orders fill worse than the order book snapshot implied, while losing orders fill as expected. Marketable limits often fail to fill at all. The gap grows with volatility and latency ([Albers, Cucuringu, Howison & Shestopaloff 2025, Quantitative Finance 25(6)](https://ideas.repec.org/a/taf/quantf/v25y2025i6p919-947.html)). **Implication: a candle backtest that fills at the signal bar's close overstates scalping returns.**
- **Maker orders get adversely selected by fills.** A live experiment on the Binance BTC perp finds a **negative correlation between fill probability and post-fill returns**. "Commonly cited" maker strategies are highly unprofitable, and viable ones usually trade *against* the prevailing order book imbalance ([Albers et al. 2025, "The Market Maker's Dilemma", arXiv:2502.18625](https://arxiv.org/abs/2502.18625)).
- In equities, the same price-contingent fills explain many apparent retail "biases": limit orders fill when the price moves against you ([Linnainmaa 2010, Journal of Finance 65(4)](https://ideas.repec.org/a/bla/jfinan/v65y2010i4p1473-1506.html)).
- **Implication for us:** switching from taker to maker cuts fees by about 60%, but **a backtest that assumes every limit touch fills will overstate results.** Model maker fills conservatively: fill only if price trades *through* the limit, and count missed winners.
- **Fee tiers:** the arbitrage paper below shows Sharpe ratios rising steeply as fees fall (BTC 3.35 at Binance's "high"/retail tier vs 11.65 at zero fees). Being high-frequency is an advantage of fee tier and latency, not of chart patterns.

---

## 3. Funding-rate effects and basis/funding arbitrage

- **Sniping the funding timestamp does not pay.** In an earlier version of He, Manela, Ross & von Wachter ([arXiv:2212.06888 v3](https://arxiv.org/pdf/2212.06888v3), Appendix C), the authors open a delta-neutral position 5 minutes before funding and close it 5 minutes after, using 1-minute Kaiko data for BTC, ETH and DOGE. Average profit is **about 1.5 bps per event before costs**, against a spot round trip of about 3 bps even at low fees. When funding is positive the perp falls relative to spot around the timestamp, which offsets the funding received. *Do not build "enter before funding, exit after".*
- **Carry / no-arbitrage convergence does pay, even at retail fee tiers.** The same paper (v7) uses Binance data from 2020-01 to 2024-03 for BTC, ETH, BNB, DOGE and ADA. Its strategy opens long spot / short perp (or the reverse) when the futures-spot spread breaches a cost-adjusted no-arbitrage bound, and closes when the spread returns to zero. **Net of Binance's "high" (individual-trader) maker fees** (0.0675% spot + 0.0144% perp per side, about 0.164% two-leg round trip) the Sharpe ratio is 3.35 for BTC, and after effective spreads it is **3.27 for BTC, 4.45 for ETH and up to 6.63 for BNB**. Deviations shrank by more than 50% over the sample and compressed further after Binance introduced portfolio margining in April 2022 ([arXiv:2212.06888 v7](https://arxiv.org/abs/2212.06888)). Caveats:
  - The fee tier assumes $15M+/month of futures volume.
  - The positions hold for hours to days, so this is not intraday.
  - It needs a spot leg, which for us means CoinDCX spot with the India tax issues above, or another venue.
  - Deviations are shrinking over time.
- **The carry level is large on average but carries crash risk.** BTC/ETH futures-spot carry averaged above 10%/yr and peaked near 60%/yr. High carry predicts crashes, and the arbitrage is risky because margin spikes and liquidations hit during drawdowns ([Schmeling, Schrimpf & Todorov, BIS WP 1087, "Crypto carry"](https://www.bis.org/publ/work1087.htm)). Earlier work reports in-sample carry Sharpe ratios of about 7–10 on a single exchange ([Christin, Routledge, Soska & Zetlin-Jones, "The Crypto Carry Trade", CMU draft](https://www.andrew.cmu.edu/user/azj/files/CarryTrade.v1.0.pdf)). These are in-sample figures from an early draft.
- I could not verify a claim that carry profits have "compressed sharply since 2024". It appeared only in a search snippet citing an unnamed arXiv paper. Rate it as an unverified claim, though it fits the documented downward trend in deviations.

---

## 4. Opening-range breakout (ORB) and session-open strategies

- **US equities, 5-minute ORB on "Stocks in Play"** ([Zarattini, Barbon & Aziz, SFI RP 24-98](https://concretumgroup.com/a-profitable-day-trading-strategy-for-the-u-s-equity-market/)). Rules as summarised by [CXO Advisory](https://www.cxoadvisory.com/individual-investing/intraday-trading-of-overactive-stocks-via-opening-range-breakout/):
  - Universe: the top 20 stocks by relative volume, each with price above $5, average daily volume of 1M+ shares and ATR above $0.50.
  - Entry: a stop order at the high or low of the first 5-minute bar, in the direction of that bar.
  - Stop: 10% of the 14-day ATR. Exit at the close.
  - Sizing: 1% risk per trade, leverage capped at 4×.
  - Costs: commission of $0.0035/share.
  - Results for 2016–2023: **41.6%/yr, Sharpe 2.81**.

  **A $0.0035/share commission on a $50 stock is about 0.007% per side, roughly 8× cheaper than our taker fee**, and the edge comes from stock-specific news flow, which has no analogue in BTC. The 10%-of-daily-ATR stop would be about 0.3% on BTC, so our taker round trip would eat about 39% of the risk unit.
- **QQQ 5-minute ORB** for 2016–2023 is reported as "net of commissions" ([Zarattini & Aziz, SSRN 4416622](https://concretumgroup.com/can-day-trading-really-be-profitable/)). The commission level was not visible to me. Equities only.
- **Bitcoin range breakouts** on 1-minute data are often followed by positive returns, but the effect fades at lower frequencies and **after transaction costs the strategies do not beat buy-and-hold** ([NCCU master's thesis 2024](https://thesis.lib.nccu.edu.tw/thesis/detail/5ee3a21ae846b1c833ff57e17695599b)). This is a thesis, not peer-reviewed, but it is the only crypto ORB study with costs that I found.
- A blog replication of the ORB paper on five index CFDs "reproduced gross, net zero" ([MQL5 blog](https://www.mql5.com/en/blogs/post/776235)). **Unverified claim.**
- **Gold.** I found no peer-reviewed evidence of a profitable intraday ORB or session strategy for gold at retail costs.
  - COMEX gold volume and volatility jumped as soon as the London PM fix started, before results were published (GC futures, GLD) ([Caminschi & Heaney 2014, J. Futures Markets](https://ideas.repec.org/a/wly/jfutmk/v34y2014i11p1003-1039.html)). The fix was replaced by the LBMA Gold Price in 2015, so the result is historical.
  - In Chinese gold and silver futures, first-half-hour momentum moved to the night session once night trading began ([Zhou et al.](https://acfr.aut.ac.nz/__data/assets/pdf_file/0008/686816/4a-Z-Ivy-Zhou.pdf)). This shows the effect depends on market structure, not a stable rule.
- **Intraday momentum on SPY with "noise area" breakouts** produced 19.6%/yr and a Sharpe of 1.33 net of costs from 2007 to early 2024 ([Zarattini, Aziz & Barbon, SFI WP 24-97](https://www.sfi.ch/de/publications/n-24-97-beat-the-market-an-effective-intraday-momentum-strategy-for-s-p500-etf-spy)). Signals are checked only on the hour and half-hour, with VWAP-based trailing stops and a flat close. I did not see the exact cost assumptions. Equities only, but this is the most adaptable design for crypto (candidate B below).

---

## 5. Retail day-trader outcome studies

| Study | Market / sample | Result |
|---|---|---|
| [Barber, Lee, Liu & Odean 2014, J. Financial Markets](https://econpapers.repec.org/RePEc:eee:finmar:v:18:y:2014:i:c:p:1-24) ([PDF](https://faculty.haas.berkeley.edu/odean/papers/day%20traders/Day%20Trading%20Skill%20110523.pdf)) | Taiwan Stock Exchange, all day traders, 1992–2006 | **Less than 1%** of day traders predictably earn positive abnormal returns net of fees. The top 500 by prior-year return then earn 37.9 bps/day after fees; the bottom group earns −28.9 bps/day. |
| [Barber, Lee, Liu & Odean, "Do day traders rationally learn about their ability?"](https://faculty.haas.berkeley.edu/odean/papers/day%20traders/day%20trading%20and%20learning%20110217.pdf) | Same data | Day traders' aggregate performance net of fees is negative in each of the 15 years (from search extract). |
| [Chague, De-Losso & Giovannetti 2019, "Day Trading for a Living?"](https://ideas.repec.org/p/spa/wpaper/2019wpecon47.html) | Brazil equity-index futures; everyone who started 2013–2015 and kept going for 300+ days | **97% lost money. Only 0.4% earned more than a bank teller (about US$54/day).** No evidence of learning. |
| [SEBI PR, July 2024](https://taxguru.in/sebi/sebi-study-finds-7-10-individual-intraday-traders-equity-cash-segment-losses.html) | India, equity cash intraday, FY23, top-10 brokers | 71% of individual intraday traders lost money; **80% of very frequent traders** lost. Loss-makers paid an extra 57% of their losses in trading costs. |
| [SEBI PR, Sep 2024](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html) | India, equity F&O, FY22–FY24 | 93% of about 1.13 crore individuals lost money, ₹1.81 lakh crore in total. Only 7.2% made a profit over the three years. |
| [ESMA 2018 product intervention](https://www.esma.europa.eu/node/84933) | EU retail CFD accounts (national regulator analyses) | 74–89% of retail accounts typically lose money. |

All of these are equity or CFD markets, not crypto perps. I found no comparable regulator-grade study of crypto perp traders. The pattern is the same everywhere: more frequent trading goes with worse outcomes, and costs explain much of it.

---

## 6. Candidate strategies worth backtesting in our app

Each one is designed to be **falsified**. Run them at **both** taker/taker (0.118% round trip) and maker-entry/taker-exit (0.083%), with conservative maker fills (fill only if the next bar trades through the limit). Use our usual pass filter (PF ≥ 1.3, ≥ 8%/yr, both halves profitable, max DD ≤ 20%). Add funding to the backtester before testing anything held across 00/08/16 UTC.

| # | Strategy (codeable rules) | Evidence | Cost level it reportedly survives | Confidence |
|---|---|---|---|---|
| **A** | **Funding/basis carry (delta-neutral), threshold version.** Markets: BTC, ETH (maybe SOL). Data: 1h perp price, spot price, funding history. Signal: annualised basis `ρ = (perp/spot − 1) × (365×24/h_to_next_funding)`, or simply the trailing 3-period average funding × 3 × 365. **Enter** short perp + long spot (equal notional) when annualised expected funding net of fees > threshold (start at 20%/yr, which the BIS paper puts well above the >10% average). **Exit** when annualised funding < 0 or `ρ` returns to 0. **Risk:** perp leg at ≤2× effective leverage with a liquidation buffer of ≥3× the 30-day max adverse daily move. Never take the reverse leg (it needs short spot). | He–Manela–Ross–von Wachter (Binance 2020–24): Sharpe 3.27 net for BTC at individual-tier maker fees plus spreads. BIS WP 1087: carry above 10%/yr on average, up to 60%, with crash and margin risk. | About 0.164% two-leg round trip (Binance "high" tier, maker), plus effective spreads. | **High** that the effect exists. **Medium-low** for our account: needs a spot leg (Indian tax: 30% with no loss offset, 1% TDS), $350 is too small to pay for the friction, deviations are shrinking, and our backtester needs funding added. Not a scalp. |
| **B** | **Intraday "noise-area" momentum, hourly checks** (crypto adaptation of SFI WP 24-97). Markets: BTC, ETH, SOL, XAU. Session = UTC day (alternative: US cash session 13:30–20:00 UTC, worth testing because volume peaks there). For each 30-min time of day *t*, `σ_t` = mean over the last 14 sessions of `|close_t / session_open − 1|`. Upper = `open × (1 + σ_t)`, lower = `open × (1 − σ_t)`. **Check only at :00 and :30.** **Long** if close > upper; **short** if close < lower. **Stop/trail:** long exits if close < max(upper, session VWAP); short exits if close > min(lower, session VWAP), also checked at :00/:30. **Flat** at session end. One position at a time. Size by volatility target (for example 2% daily vol target, capped at 3×). | SPY 2007–2024: 19.6%/yr, Sharpe 1.33, net of costs (cost level not verified). Crypto intraday TSM evidence (Shen et al. 2022; Wen et al. 2022) supports the direction. Matches our finding that 1h logic beats 15m logic. | Unknown for crypto. Few trades per day, holds of hours. Must beat about 0.12% per trade. | **Medium-low** |
| **C** | **1h large-move reversal** (overreaction plus liquidation cascades). Markets: BTC, ETH, SOL, plus the alts in our set. On the 1h close, if the bar's return is beyond ±2.5 × the 30-day stdev of 1h returns (or ≥3%) **and** volume ≥ 2× its 24h average, enter **against** the move. Use a limit at the 1h close price, filled only if the next 5m bars trade through it (the "1h setup, 5m entry" that worked for us). **Target:** 50% retrace of the trigger bar. **Stop:** beyond the trigger bar's extreme plus 0.25 × ATR(14, 1h). **Time stop:** 4 h. | Negative autocorrelation at 1–4 h, stronger after big moves (De Nicola 2021). Reversal component in Wen et al. 2022. Albers et al. find viable maker trades are contrarian to the imbalance. Our own 1h sweep-reversal results were positive. | Not established; Caporale & Plastun say overreaction profits may not survive costs. | **Low-medium** |
| **D** | **Daily/4h Donchian trend ensemble** (control strategy: not intraday, but the best-supported directional approach). BTC, ETH and liquid alts. Signal = average of {long if close > N-bar high, flat if close < N/2-bar low} for N ∈ {20, 40, 60, 120, 240} on 4h or daily bars. Position = signal × (target vol / realised vol). Long-only first. | Zarattini, Pagani & Barbon, SFI RP 25-80, tested at 0.10%, 0.25% and 0.50% costs. I did not retrieve its performance numbers. | Paper models 0.10–0.50% per trade. | **Medium** (exact results not verified by me) |
| **E** | **US-open ORB on BTC/ETH/XAU**, to falsify. Opening range = 13:30–14:00 UTC (30 min, not 5, to make the stop wide relative to fees). **Long** on a 5m close above the OR high, **short** on a 5m close below the OR low, first signal only. **Stop:** opposite side of the OR. **Target:** 2 × OR width, or flat at 20:00 UTC. Skip if OR width < 0.4% (fees would be over 25% of risk). | Equity ORB papers (above). The crypto thesis finds breakouts *don't* beat buy-and-hold after costs. | Equity versions survive about 0.007% per side; crypto unknown. | **Low** (run mainly to rule it out) |

Not proposed: anything on 1m–5m entries without a higher-timeframe setup; pure hour-of-day trades; OFI-based scalps; funding-timestamp sniping (see below).

---

## 7. What to avoid, with evidence

1. **Sub-hour mean-reversion scalps at taker fees.** Our 192 runs failed. Predictable intraday components are about 0.5 bp at quarter-hour marks against a 5 bp taker fee ([Kim & Hansen 2026](https://arxiv.org/html/2607.09426)). Overreaction profits are not clearly exploitable after costs ([Caporale & Plastun](https://econpapers.repec.org/RePEc:ces:ceswps:_6861)).
2. **Entering just before a funding timestamp to collect funding.** It earns about 1.5 bps gross against about 3 bps of costs, and the price moves against you around the timestamp ([He et al. v3, App. C](https://arxiv.org/pdf/2212.06888v3)).
3. **Backtests that assume limit orders always fill, or that market orders fill at the bar close.** Fills are adversely selected on both sides ([Albers et al. 2025 QF](https://ideas.repec.org/a/taf/quantf/v25y2025i6p919-947.html); [Albers et al. 2025 arXiv](https://arxiv.org/abs/2502.18625); [Linnainmaa 2010](https://ideas.repec.org/a/bla/jfinan/v65y2010i4p1473-1506.html)).
4. **Hour-of-day or weekday return rules without cost modelling.** Returns show no persistent effects across exchanges ([Baur et al. 2019](https://econpapers.repec.org/RePEc:eee:finlet:v:31:y:2019:i:c:p:78-92)). The popular 21:00–23:00 UTC BTC trade reports no costs, and its daily round trip would cost more than its gross return at our taker rate.
5. **Porting equity ORB results to crypto.** The equity edge relies on stock-specific news and fees about 8× lower than ours ([CXO summary of SFI 24-98](https://www.cxoadvisory.com/individual-investing/intraday-trading-of-overactive-stocks-via-opening-range-breakout/)). Crypto breakout tests fail after costs ([NCCU thesis](https://thesis.lib.nccu.edu.tw/thesis/detail/5ee3a21ae846b1c833ff57e17695599b)).
6. **Order-book or OFI scalping.** The horizon is about 3 seconds, the published backtests are gross of fees, and makers get run over in crashes ([Bieganowski & Ślepaczuk](https://arxiv.org/html/2602.00776)).
7. **High trade frequency in general.** Among very frequent intraday traders in India, 80% lost ([SEBI July 2024](https://taxguru.in/sebi/sebi-study-finds-7-10-individual-intraday-traders-equity-cash-segment-losses.html)). Under 1% of Taiwanese day traders are reliably profitable ([Barber et al. 2014](https://econpapers.repec.org/RePEc:eee:finmar:v:18:y:2014:i:c:p:1-24)). 97% of persistent Brazilian futures day traders lost ([Chague et al.](https://ideas.repec.org/p/spa/wpaper/2019wpecon47.html)).
8. **High leverage on carry.** Margin spikes and liquidations during drawdowns are the main risk of the "riskless" basis trade ([BIS WP 1087](https://www.bis.org/publ/work1087.htm)).

---

## 8. Gaps and unverified items

- Shen, Urquhart & Wang (2022): full text not retrieved. Exact session construction, sample and cost treatment unverified.
- Turn-of-the-candle (Heliyon 2023): magnitude and costs unverified.
- Zarattini SPY intraday momentum and QQQ ORB: exact commission and slippage assumptions not seen.
- Zarattini, Pagani & Barbon crypto trend paper: performance numbers not retrieved.
- CoinDCX fee page: blocked automated fetch; figures come from search extracts of the official page.
- No primary evidence found on: price behaviour around funding times for *directional* (non-hedged) traders beyond He et al.; intraday gold strategies at retail cost; crypto-perp retail outcome statistics.
- "Carry compressed since 2024": unverified.

---

## Sources

**Crypto intraday predictability**
- Shen, Urquhart & Wang (2022), Bitcoin intraday time series momentum, *Financial Review* 57(2). https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/ (doi:10.1111/fire.12290)
- Wen, Bouri, Xu & Zhao (2022), Intraday return predictability in the cryptocurrency markets, *NAJEF* 62. https://ideas.repec.org/a/eee/ecofin/v62y2022ics1062940822000833.html
- De Nicola (2021), On the intraday behavior of Bitcoin, *Ledger* 6. https://ledger.pitt.edu/ojs/ledger/article/view/213
- Caporale & Plastun, Price overreactions in the cryptocurrency market, CESifo WP 6861. https://econpapers.repec.org/RePEc:ces:ceswps:_6861
- Fischer, Krauss & Deinert (2019), Statistical arbitrage in cryptocurrency markets, *JRFM* 12(1). https://mdpi.com/1911-8074/12/1/31
- Baur, Cahill, Godfrey & Liu (2019), Bitcoin time-of-day, day-of-week and month-of-year effects, *FRL* 31. https://econpapers.repec.org/RePEc:eee:finlet:v:31:y:2019:i:c:p:78-92
- Brauneis et al., The crypto world trades at tea time. https://irep.ntu.ac.uk/id/eprint/51576
- Padyšák & Vojtko (2022), Quantpedia note (vendor, costs not reported). https://quantpedia.com/are-there-seasonal-intraday-or-overnight-anomalies-in-bitcoin/
- Shanaev, Vasenin & Stepanov (2023), Turn-of-the-candle effect in bitcoin returns, *Heliyon*. https://researchportal.northumbria.ac.uk/en/publications/turn-of-the-candle-effect-in-bitcoin-returns/
- Kim & Hansen (2026), The Quarter-Hour Effect, arXiv:2607.09426. https://arxiv.org/html/2607.09426
- Bieganowski & Ślepaczuk (2026), Explainable patterns in cryptocurrency microstructure, arXiv:2602.00776. https://arxiv.org/html/2602.00776

**Equity / cross-asset intraday momentum and ORB**
- Gao, Han, Li & Zhou (2018), Market intraday momentum, *JFE* 129(2). https://ideas.repec.org/a/eee/jfinec/v129y2018i2p394-414.html
- Li, Sakkas & Urquhart (2022), Intraday time series momentum: global evidence, *JFM* 57. https://centaur.reading.ac.uk/95566
- Zarattini & Aziz, Can day trading really be profitable? SSRN 4416622. https://concretumgroup.com/can-day-trading-really-be-profitable/
- Zarattini, Barbon & Aziz, A profitable day trading strategy for the U.S. equity market, SFI RP 24-98. https://concretumgroup.com/a-profitable-day-trading-strategy-for-the-u-s-equity-market/ ; rules summary: https://www.cxoadvisory.com/individual-investing/intraday-trading-of-overactive-stocks-via-opening-range-breakout/
- Zarattini, Aziz & Barbon, Beat the market: intraday momentum for SPY, SFI WP 24-97. https://www.sfi.ch/de/publications/n-24-97-beat-the-market-an-effective-intraday-momentum-strategy-for-s-p500-etf-spy
- Zarattini, Pagani & Barbon, Catching crypto trends, SFI RP 25-80. https://ideas.repec.org/p/chf/rpseri/rp2580.html
- NCCU thesis (2024), Intraday technical analysis trading strategies in Bitcoin: trading range breakouts. https://thesis.lib.nccu.edu.tw/thesis/detail/5ee3a21ae846b1c833ff57e17695599b
- MQL5 blog ORB replication (unverified). https://www.mql5.com/en/blogs/post/776235

**Gold**
- Caminschi & Heaney (2014), Fixing a leaky fixing, *J. Futures Markets* 34(11). https://ideas.repec.org/a/wly/jfutmk/v34y2014i11p1003-1039.html
- Zhou et al., Intraday momentum in Chinese metal futures and night trading. https://acfr.aut.ac.nz/__data/assets/pdf_file/0008/686816/4a-Z-Ivy-Zhou.pdf

**Microstructure**
- Albers, Cucuringu, Howison & Shestopaloff (2025), The good, the bad, and latency, *Quantitative Finance* 25(6). https://ideas.repec.org/a/taf/quantf/v25y2025i6p919-947.html
- Albers et al. (2025), The market maker's dilemma, arXiv:2502.18625. https://arxiv.org/abs/2502.18625
- Linnainmaa (2010), Do limit orders alter inferences about investor performance and behavior?, *JF* 65(4). https://ideas.repec.org/a/bla/jfinan/v65y2010i4p1473-1506.html

**Perpetuals, funding, carry**
- He, Manela, Ross & von Wachter, Fundamentals of perpetual futures, arXiv:2212.06888 (v7 for arbitrage results; v3 Appendix C for the funding-time event study). https://arxiv.org/abs/2212.06888 , https://arxiv.org/pdf/2212.06888v3
- Schmeling, Schrimpf & Todorov, Crypto carry, BIS WP 1087. https://www.bis.org/publ/work1087.htm
- Christin, Routledge, Soska & Zetlin-Jones, The crypto carry trade (draft). https://www.andrew.cmu.edu/user/azj/files/CarryTrade.v1.0.pdf
- Binance, Introduction to Binance Futures funding rates. https://www.binance.com/en/support/faq/360033525031
- CoinDCX VIP / fee page. https://coindcx.com/vip/

**Retail outcomes and regulation**
- Barber, Lee, Liu & Odean (2014), The cross-section of speculator skill, *JFM* 18. https://econpapers.repec.org/RePEc:eee:finmar:v:18:y:2014:i:c:p:1-24
- Barber, Lee, Liu & Odean, Do day traders rationally learn about their ability? https://faculty.haas.berkeley.edu/odean/papers/day%20traders/day%20trading%20and%20learning%20110217.pdf
- Chague, De-Losso & Giovannetti (2019), Day trading for a living? https://ideas.repec.org/p/spa/wpaper/2019wpecon47.html
- SEBI (July 2024), intraday equity cash study (press release text). https://taxguru.in/sebi/sebi-study-finds-7-10-individual-intraday-traders-equity-cash-segment-losses.html
- SEBI (Sep 2024), updated F&O study. https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html
- ESMA (2018), product intervention on CFDs. https://www.esma.europa.eu/node/84933
- Income Tax Department, Taxation of virtual digital assets. https://incometaxindia.gov.in/w/taxation-of-virtual-digital-asset-vda-

---

## 9. Our backtest results (6 Nov 2026)

Run in this repo on 2 years of Binance candles (gold 11 months, silver 10 months) for 12 markets: BTC, ETH, XAU, XAG, XRP, SOL, AVAX, DOGE, ADA, SUI, NEAR, AAVE. Fees: 0.059% per side (CoinDCX taker incl. GST), and 0.0413% per side as a maker-entry/taker-exit blend that assumes every limit order fills (optimistic). Pass filter as in the Signals page: PF ≥ 1.3, ≥ 8%/yr, both halves ≥ +2%, max DD ≤ 20%, beats buy and hold.

| Strategy | Fees | Profitable markets | Pass filter | Median PF | Median trades/week |
|---|---|---|---|---|---|
| VWAP fade (±2σ, target VWAP), 5m and 15m, two stop widths | taker / maker | 0/12 (one 15m variant: 0–2/12) | 0 of 192 runs | 0.73–0.95 | 7–25 |
| RSI(2) + Bollinger(20,2) with 200-EMA filter, 5m and 15m | taker / maker | 0–2/12 | 0 | 0.76–0.95 | 7–25 |
| B: noise-area momentum, 30-min checks, UTC-day session | taker / maker | 0/12 | 0 | 0.74 / 0.82 | 23 |
| B: noise-area momentum, US session 13:30–20:00 UTC | taker / maker | 0/12 / 1/12 (ETH) | 0 | 0.82 / 0.88 | 10 |
| C: 1h big-move (≥2.5σ or 3%, 2× volume) reversal, 4h time stop | taker / maker | 0/12 | 0 | 0.65 / 0.69 | 3 |

Notes:
- B (US session) had a real pre-fee edge on several markets (ETH +117%, BTC +38% gross over 2 years) but traded about 460 times a year, and fees of 0.118% per round trip took more than the edge. ETH at maker-entry fees netted +34% but with PF 1.07, a 27% drawdown and +3.9% in the second half, so it fails.
- C lost money before fees on the median market: big 1h moves in 2024–26 tended to continue, not reverse.
- What did pass the same filter in this repo trades on 1h–4h setups (see the Signals page), including the 1h-setup / 5m-entry Liquidity Reversal MTF.

## 10. Higher-timeframe liquidity and order blocks with a 1m sweep-candle entry (6 Nov 2026)

**The idea:** take liquidity and order blocks from a higher timeframe (15m, 1h or 4h), then enter on a 1m candle that sweeps the last 15 minutes of 1m lows and closes back above them as a green candle. Shorts are the mirror image.

**Markets and settings:** BTC, ETH, XAU, XAG, SOL and XRP, using 1 year of 1m candles. The fee was 0.059% per side, with 1% risk per trade.

**The 72 variants per market** combined:
- **Where to trade:** an untaken swing low being swept, an order-block touch, or both.
- **Stop:** under the 1m sweep candle (at least 0.2% away), or under the higher-timeframe level.
- **Entry:** on the sweep candle's close, or after the next candle closes above the sweep candle's high.
- **Target:** the nearest untaken higher-timeframe high that pays at least 2R, or a fixed 2R.

The script is `sweep1m.ts` in the session scratchpad.

**Results:**
- **No run qualified.** 5 of 427 runs made money after fees.
- **Before fees, only 23 of 72 variants made money**, and none by much. This isn't a fee problem: the 1m sweep candle doesn't pick good entries on its own.
- **Higher timeframes did better:**
  - 15m setups lost thousands of R across 9,000–13,000 trades.
  - 4h setups were the least bad.

**Best single runs, all failing on drawdown or on one half of the year:**

| Market | Setup | Trades | Profit factor | Net R | Max drawdown |
|---|---|---|---|---|---|
| SOL | 4h order block, stop under it, target the 4h high | 186 | 1.22 | +59.6 | 39.7% |
| ETH | 4h order block | 180 | 1.08 | +35.5 | 34.5% |
| ETH | 4h liquidity sweep, wait for the next candle to confirm | 116 | 1.08 | +14 | 17.4% |
