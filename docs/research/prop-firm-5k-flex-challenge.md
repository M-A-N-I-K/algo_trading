# Passing and keeping a $5,000 FundingPips "2 Step Flex" account: rules, arithmetic, and which of our strategies fit

Researched 2026-11-08. Scope: an India-resident retail trader holding a **$5,000 FundingPips 2 Step Flex** account (currently Phase 1, then Phase 2, then the "Master" funded account), who has algorithmic strategies in this repo (`src/strategies/`). The user confirmed the firm is FundingPips, so no firm-identification step was needed. The brief called the account "Flex"; this note works out what that means in FundingPips' own words (§1).

**Educational research, not personalised financial or legal advice.** No strategy guarantees a pass, most evaluations fail (§6), and nothing here promises profit. Nothing was backtested for this note: every repo number is quoted from the repo's own docs and labelled with where it came from.

**Rules and prices change often.** Every figure below is as of **2026-11-08**, the date I read it. The help-center articles were last updated **2026-10-19 to 2026-11-02** (dates in the source list). FundingPips changed Flex terms at least twice in 2026 (see §1), so **re-read your own dashboard and the Flex article before relying on any number**. Source labels:

- **Fetched:** I read the official FundingPips help-center article in full. The article pages returned HTTP 403 to the fetch tool, so I read the same article bodies through the help center's own public JSON endpoint (`help.fundingpips.com/api/v2/help_center/en-us/articles.json`). That is the official text, not a summary.
- **Extract:** the official page blocked automated fetching (`fundingpips.com` product, blog and T&C pages returned HTTP 429), so the figure comes from a search-engine extract of that official page. One attempt to fetch the product page with a browser-style user agent was blocked by the tooling's permission check, and I did not retry it. Check these in the app.
- **Unverified:** secondary source only (third-party review, press, forum). Never used as the citation for a rule.

---

## TL;DR

**What "Flex" is.** FundingPips sells a named model called **2 Step Flex**, with a sibling called 1 Step Flex. Your description (two phases, then funded, $5K size) is 2 Step Flex [1][6]. What "Flex" changes versus **2 Step Standard** [1][5]:

| | 2 Step Flex | 2 Step Standard |
|---|---|---|
| Phase 1 / Phase 2 target | **10% / 8%** | 8% / 5% |
| Daily loss / max loss | **4% / 12% (static)** | 3% or 5% / 10% (static) |
| Min trading days | **1 per phase** on the 80% split; 3 profitable days (>=0.5% each) on the 95% split | 3 per phase (none with the 3% daily-loss add-on) |
| Reward split | **80% or 95% bi-weekly, or 100% on demand; the 80/95 choice is locked at purchase** | weekly 60%, bi-weekly 80%, on demand 100%; chosen after reaching Master |
| Reg-fee refund at 4th reward | **No** | Yes |

**Conclusion.** The Flex limits are looser than Standard's on daily and total loss but demand a bigger profit (+$500, then +$400). Both limits are measured on **equity including floating P&L**, and the daily limit is breached the instant it is *touched*. A pass is therefore decided by a small number of controlled-risk trades with an edge that has to exist before sizing, not by size. Derived from the rules (arithmetic, not FundingPips' numbers): the $ limits are **$200 a day and $600 total** (§3).

**Rules to follow (8 to 10; items marked [FP] are FundingPips rules, the rest are my derived suggestions):**

1. **[FP] Never touch the loss limits.** Daily: 4% of the higher of that day's opening balance or equity = **$200** on a fresh $5,000, floating P&L counts, resets at 00:00 platform time (**22:00 UTC in winter = 03:30 IST; 21:00 UTC in summer = 02:30 IST**). Total: equity or balance **can never touch $4,400** (12% of the *starting* size, static, never moves) [1].
2. **Risk 0.5% ($25) per trade, 1% ($50) as a hard ceiling.** At 1% four consecutive full losses reach the daily limit; at 0.5% it takes eight (§3).
3. **Self-imposed daily stop at -2% ($100), closed plus floating.** Half the firm's 4%, to absorb slippage, spread spikes at rollover and gaps. Stop for the day and do not "make it back".
4. **Cap total open risk at 1% ($50) across all positions**, and treat BTC and ETH as one idea. Always place a hard stop-loss, even though FundingPips does not require one [3].
5. **[FP] Profit only counts when closed.** Reaching +$500 with open trades does not pass; close everything, and a Phase 1 account needs at least 1 trading day on the 80% split [1].
6. **[FP] Place one fully closed trade at least every 30 days** or the account is breached for inactivity. There is no time limit otherwise [1].
7. **[FP] Personal EA only, with proof of ownership; no VPN/VPS; no hedging, HFT, tick scalping, gap trading, latency tricks, or copying signals into the account** [2]. If your app will send orders automatically, ask support in writing first (§4.7). The simplest compliant path is to trade the signals by hand from your normal home connection.
8. **[FP] On the Master account:** positions are force-closed daily (21:45 to 22:00 UTC winter) unless you bought the Swing add-on **at purchase**; profits on trades opened or closed within 5 minutes either side of high-impact news on the affected currency can be deducted [1][4]. Check which add-ons and which split (80% or 95%) your account was bought with.
9. **After the target, lower risk, do not raise it.** The 12% floor never moves, so profit adds cushion, not permission (§3). Phase 2 is only 8%, and a Master account that pays 80% of profit every 14 days is a long game.
10. **Only trade what FundingPips lists** (41 instruments; crypto is only BTCUSD and ETHUSD, at 1:2 leverage, 1 lot per click) [1]. Only **4 of the 12 markets in our backtests** (BTC, ETH, XAU, XAG) are available (§5).

**Realistic chance.** Third-party and firm-CEO figures put the share of challenge buyers who pass at roughly **5 to 15%**, with about **7% ever reaching a payout** (§6, all unaudited). A 4%/12% rule set is forgiving, so most failures come from the trader's edge or behaviour, not the limits. If the strategy has no edge after FundingPips' real costs, sizing cannot save it (§3 table).

---

## 1. What "Flex" means in FundingPips' own wording

- The official help center lists the models as **1 Step Flex, 2 Step Standard, 2 Step Flex, 2 Step Pro and Zero** [6]. "Flex" is part of two model names. It is **not** a drawdown option or a payout option on another model.
- **2 Step Flex** is "a two-phase evaluation. Phase 1 and Phase 2, then trading on a Master Account", with the reward structure chosen at purchase. Account sizes: $5K, $10K, $25K, $50K, $100K [1].
- Terms have moved. Old 2 Step Standard accounts with a 10% profit target were reset into 2 Step Flex with an 85% split [5]. A launch blog (Extract only) described a 10%/6% target, 85% split and no minimum days; the current help center says **10%/8%** and an **80%/95%/100%** split, and I treat the help center as authoritative [1]. If your account was bought before **26 Aug 2026**, the 80%-split minimum-days rule is **0** for your existing phases; resets and new accounts need 1 day [1].
- **"Master Account" is the funded stage.** It trades simulated capital, and FundingPips is explicit that it is "not a live brokerage" and that rewards are cash paid out of the firm's side [3]. So "funded" here means a Master account that pays a split of simulated profit.
- **Not found officially:** the FundingPips Terms and Conditions text (page blocked, Extract-only), so I could not read the full legal terms. Read them before paying or withdrawing.

---

## 2. The $5,000 2 Step Flex rules (official), by stage

All from the 2 Step Flex help article [1] unless another number is cited. "Same" means the article states one rule for every stage.

| Rule | Phase 1 | Phase 2 | Master (funded) |
|---|---|---|---|
| Profit target | **10% = $500** | **8% = $400** | none |
| Minimum trading days | 1 (80% split) or 3 profitable days >=0.5% = >=$25 each (95% split) | same | n/a |
| Time limit | **None** | **None** | n/a |
| Daily loss | 4% of the higher of opening balance or opening equity; floating P&L counts; resets 00:00 platform time (UTC+2 winter / UTC+3 summer) | same | same |
| Max loss | **12% static of the starting size** (floor $4,400 on a $5,000 account), equity or balance, floating counts; stated to hold "across both phases and the Master Account" | same | same |
| Profit lock on drawdown | **None.** The floor is static and never trails or rises | same | same |
| Consistency / best-day rule | **None stated in the Flex article for the evaluation** | same | none on the bi-weekly splits ("no Consistency Score on either Bi-Weekly split"); **35%** best-day cap on the 100% on-demand split |
| News | No restriction while evaluating; holding through news is allowed | same | Profit on trades opened or closed within **5 min before to 5 min after** high-impact news or speeches on the affected currency can be deducted; trades opened **>=5 hours** before are exempt |
| Overnight / weekend | Allowed on all instruments | Allowed | **Not allowed** unless the Swing add-on was bought at purchase; positions auto-closed in a 15-minute window (20:45 to 21:00 UTC summer, 21:45 to 22:00 UTC winter); auto-close is not a breach |
| Inactivity | Breach after **30 consecutive days** with no fully closed trade (clock starts at account creation) | same | same |
| Stop-loss required | **No** (strongly advised) [3] | No | No |
| Platforms | MT5, cTrader, Match-Trader (named in the Swap-Free add-on text) [1] | same | same |

### Hard breaches, verbatim in effect [1]

- The account is closed instantly if equity or balance touches the 12% floor or the 4% daily floor, "even briefly" and even if the trade "closes in profit". Server-side data is final regardless of what your terminal shows [1][3].
- **A reset** is offered on the dashboard for **7 calendar days** after a breach, with a discount of **12% (Phase 1), 10% (Phase 2), 7% (Master)**, and every reset restarts at **Phase 1** (even if you breached Phase 2) [1].
- Caution on one wording clash: the Flex article says there are no news restrictions in evaluation, but also that "purposely trading during news and speeches in both the Evaluation and Master phases is prohibited and will result in account closure" [1][4]. "Purposely" is not defined officially. Avoid deliberate news-event trades even in Phase 1.

### Leverage, lots, instruments [1]

| Class | Evaluation leverage | Master leverage | Notes |
|---|---|---|---|
| Forex | 1:100 | 1:100 | 28 pairs |
| Metals (XAUUSD, XAGUSD) | 1:30 | **Dynamic**, 1:50 for the first 0.05 lot down to 1:5 above 0.50 lot ("temporary", from 16 Mar 2026) | 1 lot XAU = 100 oz |
| Energies (UKOIL, USOIL) | 1:10 | Dynamic as metals | |
| Indices (7 cash CFDs) | 1:20 | Dynamic as metals | |
| Crypto (BTCUSD, ETHUSD only) | **1:2** | **1:1** | **1 lot per click** on crypto; 20 lots per trade everywhere |

- Commission: forex and metals **$5 per lot** (Swing and Swap-Free accounts $10), energies and indices none, crypto **0.04%** (lot size x price x 0.04%) [1]. The article does not say whether $5 is per side or round turn: **not found officially**.
- Swap-Free add-on (+10% of price, Extract) and Swing/weekend add-ons are bought **at purchase**; the weekend-holding add-on is described as a 10% add-on [1].

### Price, split, payout, scaling

| Item | Detail | Status |
|---|---|---|
| Fee for $5K | **$35** on the product page and homepage; one third-party review says $32 | Extract (2 official-page extracts agree on $35); $32 is Unverified. **Not found officially in a page I could read.** Check checkout |
| Refund | The "registration fee refund at the 4th reward" applies to 2 Step Standard only; **not** to 2 Step Flex | Fetched [6] |
| Reset price | 12% off Phase 1 reset = about **$30.80** if the fee is $35 (my arithmetic) | Derived |
| Reward cycles | **80% split:** every 14 calendar days after the first executed Master trade, no other gate. **95% split:** every 14 days plus **3 profitable days** in the cycle. **100% on demand:** 35% best-day consistency, **7** profitable days (>=0.5% of starting size each) and the Striking System | Fetched [1] |
| Profitable day | A day with profit >= 0.5% of the starting size = **$25** on $5K | Fetched [1] |
| Minimum reward | **1% of the Master size = $50** | Fetched [1][7] |
| Reward rules | Close all trades including pending orders; wait 15 minutes; trading is disabled while a reward processes; processed in 1 to 3 working days | Fetched [8] |
| Payout methods | Card (Visa/Mastercard), crypto (USDT/USDC on ERC20, 1% minimum), Rise ($500 minimum, KYC), bank transfer ($500 minimum, "selected regions"). **India is not in the listed Pay-to-Card countries** | Fetched [8] |
| Striking System (100% split only) | A "trade idea" losing 1% of the account (closed plus floating) earns a warning. 2nd warning halves the split, 3rd drops it to 20%, 4th closes the account. Same-instrument, same-direction trades and new trades within 10 minutes of a losing close count as one idea | Fetched [1] |
| Scaling plan | **Not in the Flex article.** FundingPips' scaling plan sits on the invite-only **Prime Account** (x12.5 multiplier, 80% daily split), entry is by invitation after performance | Fetched [10]; not found officially for Flex Master |
| KYC / eligibility | 18+; restricted residents: Iran, Vietnam, UAE (India not listed); one verified account per person; KYC, 2-day review, agreement and 2-day onboarding before the Master account opens | Fetched [6][7] |

### Conduct rules that matter for an algorithmic workflow [2][3][9]

- **Forbidden:** gap trading, high-frequency trading, server spamming, latency arbitrage, toxic flow, **hedging**, long-short arbitrage, reverse arbitrage, **tick scalping**, server execution exploits, opposite-account trading, churn-and-burn. Breaches can mean termination without warning [2].
- **EA / bot policy:** a **third-party** EA is allowed only as a trade or risk manager; using one to generate and execute your trades means denial of the evaluation or reward and closure. A **personal EA you wrote** can fully automate, but you must **prove ownership**: uncompiled source, version-control history, development-environment evidence or a live call explaining the logic; "a compiled binary on its own is not proof" [2].
- **Copy trading:** copying **out** of your FundingPips account to an external one is allowed; copying **into** it from any outside source, including signal providers, is prohibited and counts as third-party management [2]. FundingPips' own dashboard Copy Trader exists (MT5, cTrader, Match-Trader, Beta, max 4 accounts) but only a FundingPips account can be the Lead [11].
- **VPN / VPS:** "Connecting to a VPN or VPS while accessing your trading account is not permitted." The IP region must stay consistent; a regional change can trigger a proof-of-location request [2]. This rules out running a bot on a cloud server.
- **Not found officially:** a minimum trade duration, a trades-per-day cap, or definitions of "tick scalping", "gap trading" and "hedging". The Flex article has no consistency rule for the evaluation phases; absence is not a guarantee, so check support if you plan very short holds.

---

## 3. The $5,000 arithmetic (derived from the rules above, not published by FundingPips)

### 3.1 The dollar limits

| Item | Rule | On $5,000 |
|---|---|---|
| Phase 1 target | 10% of starting size | **+$500** (closed balance >= $5,500) |
| Phase 2 target | 8% | **+$400** (>= $5,400) |
| Daily loss limit | 4% of max(opening balance, opening equity) | **$200** (equity floor $4,800 at a $5,000 baseline; $212 if the baseline is $5,300) |
| Total loss limit | 12% of starting size, static | **$600** (equity or balance floor **$4,400**, even after you are up) |
| Profitable day (95% split) | >=0.5% | $25 |
| Minimum reward | 1% | $50 |

Three maximum-loss days in a row (3 x 4%) reaches the 12% floor, so the daily cap is the tighter, more frequently binding limit.

### 3.2 Risk per trade vs consecutive full-risk losses

"Full-risk" means each loss is exactly the amount risked. "With costs" assumes each loss is 1.1x the amount risked (0.1R for spread, commission and slippage; **my assumption**, not a FundingPips number). A touch of the limit is a breach [1].

| Risk per trade | $ per trade | Losses to hit the **daily** $200 limit (gross / with costs) | Losses to hit the **total** $600 limit (gross / with costs) | Verdict |
|---|---|---|---|---|
| 1.00% | $50 | **4** / 4 | 12 / 11 | Ceiling only; one bad day away from a breach |
| 0.75% | $37.50 | 6 / 5 | 16 / 15 | Too tight on the daily limit |
| **0.50%** | **$25** | **8** / 8 | **24** / 22 | **Default** |
| 0.25% | $12.50 | 16 / 15 | 48 / 44 | Use after the target, or on low-conviction setups |

- **Self-imposed daily stop of -$100 (2%):** two full losses at 1%, four at 0.5%, eight at 0.25%. That leaves the other $100 for a spread spike or a gap that slips past a stop.
- **Overlapping positions:** the limit is measured on **equity**, so two 0.5% trades open at once that both stop out in one move cost 1%. Keep total open risk at 1%.
- **Profit raises the floor's cushion, not the floor.** The $4,400 level is fixed at 88% of the *starting* balance [1]. After +$500 you have $1,100 of room to it. That is a reason to keep risk in dollars flat or lower, not to raise it.
- **Crypto leverage check:** at 1:2, notional is capped at about 2x equity (about $10,000). A $25 risk needs a stop of at least **0.25%** of price (25 / 10,000); $50 needs 0.5%. Normal BTC and ETH stops are wider, so margin will not bind. XAU at 1:30 rarely binds either.

### 3.3 Reaching the target

The target in R units is `target % / risk %`:

| Risk per trade | Phase 1 (10%) | Phase 2 (8%) | Wins needed with **zero losses** at 2R / 3R (lower bound) |
|---|---|---|---|
| 1% | 10R | 8R | 5 / 4 |
| 0.5% | **20R** | **16R** | 10 / 7 |
| 0.25% | 40R | 32R | 20 / 14 |

In practice you need many more trades, because losses subtract. Break-even win rate with 0.1R costs is `(1 + 0.1) / (1 + R)`: **36.7% at 2R, 27.5% at 3R, 44% at 1.5R, 55% at 1R**. Compare with the repo's own break-even logic in [high-win-rate-strategies.md](high-win-rate-strategies.md) §1.

### 3.4 What win-rate and R:R combinations are realistic (simulation of a random-walk model)

This is an **illustrative model, not a backtest and not evidence about any real strategy**. Each trade is independent; win rate `p` and reward:risk `R` are assumed and **known**; each trade risks a fixed % of the starting size; cost 0.1R per trade; the only barrier modelled is the **12% static floor** (the daily limit is assumed to be managed by rule 3); 20,000 simulated runs per row, no time limit. "Both" is P(pass Phase 1) x P(pass Phase 2, 8% target).

| Win rate / R:R | Edge per trade (after 0.1R cost) | Risk | P(Phase 1 pass) | P(hit the 12% floor first) | Mean trades to pass | P(pass both phases) |
|---|---|---|---|---|---|---|
| 40% / 2R | +0.10R | 0.5% | 91% | 9% | 167 | 84% |
| | | 1.0% | 78% | 22% | 54 | 63% |
| 45% / 2R | +0.25R | 0.5% | 100% | 0% | 82 | 99% |
| | | 1.0% | 95% | 5% | 38 | 91% |
| 35% / 3R | +0.30R | 0.5% | 99% | 1% | 69 | 98% |
| | | 1.0% | 91% | 9% | 29 | 83% |
| 30% / 3R | +0.10R | 0.5% | 83% | 17% | 129 | 70% |
| | | 1.0% | 71% | 29% | 38 | 51% |
| 55% / 1R | 0.00R | 0.5% / 1.0% | 54% | 45% to 46% | 461 / 125 | 32% |
| 35% / 2R | -0.05R | 0.5% | 29% | 71% | 209 | 10% |
| | | 1.0% | **40%** | 60% | 58 | 18% |
| 50% / 1R | -0.10R | 0.5% / 1.0% | 2% / 12% | 98% / 88% | 203 / 86 | 0% / 2% |

How to read it, honestly:

- **If the edge is real and known, 0.5% risk beats 1%:** the pass probability rises (91% vs 78% for 40%/2R) at the price of more trades (167 vs 54). That is the whole argument for the 0.5% default.
- **If the edge is zero or negative, raising the risk raises the pass rate.** A -0.05R strategy passes Phase 1 about 40% of the time at 1% risk, higher than at 0.5% (29%). That is the lottery effect: variance is what makes a pass possible, and **a pass then says almost nothing about skill**. It is also how an account with no edge reaches the funded stage and then breaches.
- The model uses a **known** edge. Real edges are estimated from small, selected samples (§5), so the true `p` and `R` will usually be worse than the backtest. Use these rows as "what must be true", not as a forecast.
- A 1R target needs better than 55% wins after costs. Tight-target, high-win-rate styles are the least forgiving shape here; the repo found the same thing at crypto fees (§5, [high-win-rate-strategies.md](high-win-rate-strategies.md) §4).

### 3.5 How long a losing streak can last

Probability of at least one run of N straight losses somewhere in 100 independent trades (exact calculation, same iid assumption): at 0.5% risk, 22 losses is the 12% floor with costs; at 1% risk, 11 losses is.

| Win rate | P(run >= 11 in 100 trades) | P(run >= 22 in 100 trades) |
|---|---|---|
| 13.8% (Perfect Entry's pooled rate) | 98% | **40%** |
| 29.7% (SMC 4h pooled) | 44% | 1% |
| 37.8% (Liquidity Reversal MTF pooled) | 17% | 0.1% |
| 45% | 6% | 0% |

So a **1% risk** on a low-win-rate system hits the floor within 100 trades more often than not, while **0.5%** removes most of that risk for 25 to 45% win-rate systems. The very-low-win-rate Perfect Entry strategy is a poor fit even at 0.5%.

---

## 4. Practical rules for each phase

### 4.1 Phase 1 and Phase 2

- Trade only your 2 or 3 best-tested setups, one at a time per market, **0.5% ($25) risk**, hard stop in the trade at entry, total open risk <= 1%.
- Do the daily-limit math in **equity**. At the platform reset (22:00 UTC / 03:30 IST in winter) write down `max(balance, equity)` and compute the day's floor (4% below it). Your own stop is 2% below the same number.
- **Stop for the day** after -2%. Stop for the week after three consecutive full losses at 0.5% if you were not following the plan on them (a behavioural rule of mine, not a research finding).
- When closed balance reaches target, **flatten everything** and make sure the day counts: Phase 1 on the 80% split needs 1 trading day if your account was bought on or after 26 Aug 2026 [1].
- Do not hold trades into 5 PM New York rollover with tight stops: spreads widen and "the Ask may spike and trigger your stop even if the visible chart never touched your line" [3]. This is one of the firm's own listed causes of unexpected breaches.
- Keep a minimum of one fully closed trade per 30 days. A single sparse strategy can leave you inactive for a month (§5).

### 4.2 After the target (Master account)

- Same 4% / 12% rules, but add: positions close daily unless you hold the Swing add-on, news windows can strip profit, and crypto leverage drops to 1:1 [1].
- Drop to **0.25 to 0.5%** risk. The Master pays 80% (or 95% with 3 profitable days) of profit per 14-day cycle; a $500 gain is $400 to you on the 80% split, versus a $35 fee and a $600 breach limit. There is no scaling plan to chase.
- On the 95% split you need 3 days of >=0.5% profit ($25) per cycle. That pushes toward slightly bigger wins, so it is the one place a rule rewards more risk; do not let it override the daily cap.
- **Withdraw every cycle.** Profit left in the Master account earns nothing and is exposed to the floor you must not touch.

### 4.3 Compliance flags to settle before you automate

- A personal EA is allowed with proof of ownership; the repo is TypeScript, so any MT5/cTrader/Match-Trader link is either your own bridge or a third-party one. **Third-party tools that generate and execute trades are not allowed**, and "inbound copy trading" is prohibited [2]. Whether a bridge you wrote that sends your own app's signals counts is **not defined officially**: ask support in writing and keep the answer.
- **No VPN/VPS**: a cloud-hosted bot is out [2]. Home-run only, same region.
- **India-specific, not researched from primary sources:** the legal, FEMA and income-tax treatment of receiving payouts from an overseas prop firm. FundingPips' own blog says Indian residents can join (Extract; marketing). Ask a chartered accountant before withdrawing.

---

## 5. How the repo's strategies fit

**Method.** I read `src/strategies/*.ts` and `src/lib/signals/scan.ts`, and the three research notes ([high-win-rate-strategies.md](high-win-rate-strategies.md), [scalping-strategies.md](scalping-strategies.md), [top-down-analysis.md](top-down-analysis.md)). All numbers below are quoted from [high-win-rate-strategies.md](high-win-rate-strategies.md) §3 (2 years of Binance candles to 7 Nov 2026, **0.059% per side, $10,000 start, whole balance per trade, 2% risk cap, no leverage, no slippage, no funding**) unless noted. I did not run anything.

**Four mismatches that apply to every strategy:**

1. **Instruments.** FundingPips lists 41 instruments; the backtests used 12 markets. Only **BTC, ETH, XAU, XAG** overlap. XRP, SOL, AVAX, DOGE, ADA, SUI, NEAR and AAVE are not offered [1]. Of forex and indices, only forex pairs exist on the firm's list and only **Liquidity Reversal on USD/JPY 1h** qualifies in the repo (39 trades, PF 2.26) [[top-down-analysis.md](top-down-analysis.md) via high-win-rate-strategies.md §3]; no strategy qualifies on the Nasdaq 100 or S&P 500.
2. **Costs and data.** Backtests charge a crypto exchange taker fee (0.059% per side). FundingPips charges spread plus $5/lot (forex, metals) or 0.04% (crypto) [1], on its own price feed. The costs are of the same order but not the same; re-run before trusting any row. The backtester also has **no swap model** (it records funding as 0).
3. **Sizing and drawdown.** The backtests risk up to 2% per trade at full balance. That is **four times** the 0.5% default here, so the reported max drawdowns are not comparable to a 12% floor. Roughly proportional scaling may help but is **not verified**.
4. **News calendar.** The repo reads the ForexFactory weekly feed (`src/lib/economicCalendar.ts`, described in its own comments as unofficial). FundingPips' official source is the calendar on **its own dashboard** [1]. The two can differ, which matters only for Master-account profit deductions.

**The best-after-fees rows on firm-listed instruments** (all from [high-win-rate-strategies.md](high-win-rate-strategies.md) §3, 19 qualifying pairs; trades are over 2 years, in-sample, selected after the fact):

| Strategy / TF | Market | Trades | Win rate | PF | Max DD (2% sizing) | Exp R/trade (noisy) | Approx trades/month |
|---|---|---|---|---|---|---|---|
| Liquidity Reversal MTF 5m | ETH | 21 | 52.4% | 2.68 | 7.1% | +0.87 | 0.9 |
| Liquidity Reversal MTF 5m | BTC | 25 | 40.0% | 1.87 | 6.7% | +0.29 | 1.0 |
| Liquidity Sweep 1h | ETH | 26 | 50.0% | 3.52 | 11.9% | +1.26 | 1.1 |
| Session London BOS 1h | BTC | 86 | 43.0% | 1.39 | 17.0% | +0.25 | 3.6 |
| Liquidity Reversal 1h | XAU | 23 | 39.1% | 1.89 | 5.8% | +0.57 | 1.0 |
| Liquidity Reversal 1h | BTC | 45 | 37.8% | 1.42 | 9.9% | +0.30 | 1.9 |
| Smart Money Concepts 4h | BTC | 29 | 37.9% | 1.88 | 14.1% | +0.75 | 1.2 |

Time to the Phase 1 target if these in-sample figures simply persisted (my arithmetic: `target R / (Exp R x trades per month)`): **one row alone takes about 7 to 33 months at 1% risk (10R) and 15 to 66 months at 0.5% (20R)**. All seven rows together would be about 5.3 R a month, or roughly 2 months at 1% and 4 months at 0.5%, but the rows overlap (BTC alone appears four times), are the best of 21 strategy and timeframe combinations, and the repo itself warns each row has only 20 to 30 trades. Treat the combined figure as an **upper bound**, not a plan. Fewer than 2 trades a month per market also puts the **30-day inactivity rule** in play unless several markets run at once.

### Compatibility, strategy by strategy

Columns: **Freq** = trades per market over 2 years, from the pooled counts in §3 of the repo note divided by 12 markets; **Stop** = from the code; **DD** = repo median/worst drawdown across markets at 2% sizing.

| Strategy | Freq / stop / repo result | Daily 4% cap | 12% floor | News / weekend / EA | Verdict |
|---|---|---|---|---|---|
| `macd-sma-atr` | 4h 396 trades (about 33 per market), **no stop** (comment in code; "MACD + SMA + ATR (no stop)"); PF 0.86; DD 71% median, 93% worst | Cannot cap risk per trade | **Incompatible**: 71 to 97% drawdowns | n/a | **Exclude.** Floating losses count and no stop means no defined risk |
| `macd-200ema-sr` | 4h 175 trades (about 15 per market), stop = EMA200 at entry, **1.5R target**; WR 45.1%, +0.51%/trade, 8/12 markets profitable, **qualifies nowhere**; 1h and 15m lose | Fine at 0.5% | 4h median DD 6.2%, worst 19.6% | One closed trade per month is not enough to keep an account active | **Marginal.** Too few trades; EMA200 stop distance varies a lot, so lots must come from the stop distance |
| `smc` (4h) | 279 trades (about 23 per market), stop = FVG/sweep low x 0.998, targets from structure; WR 29.7%, +1.17%/trade, qualifies on BTC (and SOL, AVAX, SUI which FundingPips does not list); 1h and 15m lose | Fine, about 1 trade per month per market | DD 13.9% median, 19.3% worst: **would have breached 12% at 2% sizing**; 0.5% sizing likely fits but is unverified | 4h swings fit weekend-holding in evaluation; the Master needs the Swing add-on | **Candidate on BTC only**, after re-testing with FundingPips costs |
| `session-london-bos` | Up to **3 arming windows per day** (0000-0200, 0700-0900, 1200-1400 defaults), stop = last pivot, **fixed 2R**; 1h 1,057 trades, 15m **5,073**; 1h WR 34.5%, 15m loses (PF 0.94); qualifies on BTC 1h only (86 trades, DD 17.0%) | **Highest risk of clustered losses**: 3 attempts a day; with 0.5% risk, 3 losses = 1.5% | BTC row DD 17.0% | Windows sit around London and New York opens, where scheduled releases cluster; evaluation has no news rule but the Master does; session time zone is not stated in the docs | **Conditional**, 1h BTC only; add the daily stop |
| `extreme-order-block` | 15m only, 1,439 trades; WR 24.0%; PF 0.80; 1/12 profitable; **no qualifying market** | n/a | n/a | n/a | **Exclude** |
| `perfect-entry` (1h) | 420 trades; **WR 13.8%**, payoff 8.05, BE WR 11.0%, +0.57%/trade; DD 25.3% median, **49.7% worst**; qualifies on AVAX and NEAR (not listed) | OK | **22-loss runs hit the 12% floor within 100 trades about 40% of the time** (§3.5) | n/a | **Poor fit**: the streak math above is the problem; also no qualifying firm-listed market |
| `liquidity-sweep` | 1h 236 trades; stop = zone edge + ATR buffer; WR 23.3%; qualifies on ETH 1h (26 trades, WR 50%) and NEAR; **4h loses (-1.58%/trade)**, 15m loses | Fine | ETH row DD 11.9% (borderline at 2% sizing) | One position at a time per market | **Candidate on ETH 1h**, small sample |
| `liquidity-reversal` | 1h 494 trades; WR 31.8%, +0.33%/trade, 10/12 markets profitable, qualifies on **XAU** and BTC (1h); median DD 14.6%, worst 42.2%; 15m and 4h lose | Fine | XAU row DD 5.8%, BTC row 9.9% | The USD/JPY 1h row also qualifies (39 trades) | **Candidate** on XAU, BTC, USD/JPY 1h |
| `liquidity-reversal-mtf` | 1h setup, 5m entry; 267 trades (about 22 per market), **stop = 1h sweep low minus buffer** (wide, structural), target = nearest untouched 1h swing high with minimum R:R; WR 37.8%, **+0.87%/trade**, median PF 1.90, 9/12 profitable, qualifies on ETH, BTC (and AAVE, DOGE, NEAR, ADA); DD median 11.5%, worst 19.4% | Best fit: rare, structured entries | ETH 7.1% and BTC 6.7% rows are the only <12% ones with decent samples | 5m entries sit nearer news; the repo's guide says avoid silver and XRP | **Best candidate**, but about 1 trade per month per market, so run it on ETH, BTC and XAU together |
| `top-down` | 5m entry, weekly and daily bias, half off at the range high and **half left to run to the weekly target** (partial exit); 167 trades (about 14 per market), WR 18.6%, PF 0.97; **no market qualifies** | OK | OK | The runner is held across the weekend; fine in evaluation, force-closed on the Master | **Exclude** as coded (no qualifying row) |

**Per-rule summary for the algorithmic workflow:**

- **EA policy:** your own code is allowed if you can prove ownership [2]; the safe option is manual execution of your own signals. The Signals page is not an EA.
- **Consistency rule:** none in the evaluation or on the 80% and 95% splits, so no strategy is excluded on that ground. The 100% on-demand split would need 35% and a Striking System; not recommended for a first Master.
- **Scalping rule:** tick scalping and HFT are forbidden [2], and the repo's own note says sub-30-minute crypto scalps do not survive fees anyway ([scalping-strategies.md](scalping-strategies.md)). Your 5m entries with 1h stops are not tick scalping.
- **Daily 4% cap:** every coded strategy holds one position at a time per market, so the practical risk is **several markets losing together** (BTC and ETH are highly correlated) and the three-window Session BOS strategy.
- **The repo's own warning** applies here too: the best rows are the best of many, picked after the fact, on 20 to 30 trades each. None is proven enough to size up [high-win-rate-strategies.md](high-win-rate-strategies.md) §6.

### Backtesting the firm's rules as constraints (suggested; no code changed)

1. **Equity-based daily loss.** Reconstruct the day baseline at the platform reset (22:00 UTC from the first Sunday of November, 21:00 UTC from the first Sunday of March) as `max(balance, equity)`, then flag any bar whose **intrabar worst equity** (high or low against the position) touches 4% below it. Evaluate on bar extremes, not closes; floating P&L counts [1].
2. **Static 12% floor** from the starting balance, tested on the same intrabar equity.
3. **Close-only target:** count a phase passed only when balance, with nothing open, is >= +10% (then +8% for Phase 2), plus the 1-day minimum and the 30-day inactivity breach.
4. **FundingPips costs and leverage:** spread plus $5/lot (forex, metals) or 0.04% (crypto), crypto notional <= 2x equity, 1 lot per click. Add a swap term. The existing sim records funding as 0.
5. **Fixed-fractional sizing** at 0.25, 0.5, 0.75 and 1% of equity from the stop distance, with the self-imposed -2% daily stop and a 1% total-open-risk cap.
6. **Pass probability, not one number.** Start a fresh Phase 1 attempt on every day of the sample (rolling start dates) and report the pass, breach-by-daily, breach-by-total and unfinished rates. Add a bootstrap that reshuffles the R-multiples (as in §3.4 but using your real trade list) to see the spread of outcomes.
7. **Walk-forward and a held-out period.** The repo already has `pnpm backtest:walk-forward` ([high-win-rate-strategies.md](high-win-rate-strategies.md) §7); select markets and settings on the first half only.
8. **Keep the Master constraints separate:** force-flat at 21:45 to 22:00 UTC, a +/-5 minute news mask using FundingPips' calendar, and the 14-day reward cycle, so Phase 1 results are not mixed with funded-stage behaviour.

---

## 6. What is documented about approaches that fit a constrained-drawdown evaluation

**What the evidence actually supports, and what it does not.**

- **Most challenge buyers do not pass or get paid.** A prop-firm CEO said his firm's pass rate "ranges from 5 to 10%" and that about 20% of funded traders receive payouts, in a Discord update reported by Finance Magnates on 18 March 2025 (no sample size given); the same article cites FPFX Tech saying **7% of 300,000 prop accounts reached a payout** and PipFarm saying 41% of its clients do (no sample size) [12]. A search summary of industry sources gives a 5 to 15% pass range and says no major firm publishes audited statistics. **All of this is unaudited, self-reported, mostly marketing-adjacent data; it is not FundingPips' own figure**, and I found no FundingPips pass rate in an official page. Treat 5 to 15% as the order of magnitude only.
- **Retail trading results are poor in general.** The repo's own note collects SEBI's F&O studies (93% lost money FY22 to FY24, about 91% FY25), ESMA's 74 to 89% of CFD accounts losing, and Barber et al.'s Taiwanese day traders (under 1% consistently outperform) ([high-win-rate-strategies.md](high-win-rate-strategies.md) §2, "Retail outcomes"). I did not re-open those pages today; the original access date was 2026-11-07 in that note.
- **FundingPips' own guidance** lists the habits it recommends: avoid high-impact news, manage risk, watch equity not balance, keep stops wider than rollover and spread spikes, and avoid excessive leverage or full margin [3][9]. That is the firm's text, not research.
- **Position sizing and streak risk are arithmetic, not folklore.** Fixed-fractional sizing below the loss-limit-implied cap, a streak table (§3.5), and a pass probability that depends on the edge (§3.4) are derived from the rules plus an assumed random walk. The assumptions (independent trades, known edge, fixed costs) are generous; real trades are serially dependent and the edge is uncertain. Kelly-type sizing theory (Thorp's chapter on blackjack, sports betting and the stock market is the standard reference) says to avoid overbetting; I could read only the abstract online and did not verify any drawdown figure from it ([13]).
- **What has no solid evidence here:** "stop after N losses", "reduce risk after the target", "trade only the best setups" are practitioner conventions. They are sensible given a hard daily cap, but I found **no primary study** showing they raise pass rates, and none of the third-party pass-rate pieces is controlled evidence.
- **The repo's own evidence** is the more useful guide: low to moderate win rate (25 to 45%), winners 2 to 3x losers, 1h and up, beats the fee wall; high-win-rate small-target systems lose ([high-win-rate-strategies.md](high-win-rate-strategies.md) §6). That shape also fits the 4%/12% structure because it keeps losses small and streaks survivable at 0.5% risk.

**Honest bottom line.** There is no sizing, stopping or filtering rule that makes a no-edge strategy pass reliably. The rules here (0.5% risk, -2% day stop, total open risk 1%) cannot create an edge. They only make a real edge survive long enough to show up, and prevent the rule-driven breaches that end most failed attempts.

---

## Sources

All accessed **2026-11-08**. "Updated" is the article's own last-updated date from the help-center JSON.

**FundingPips official (help center, Fetched via the help center's public JSON endpoint)**
1. 2 Step Flex, updated 2026-11-02. https://help.fundingpips.com/hc/en-us/articles/47835196271249-2-Step-Flex
2. Trading Conduct and Security Standards (forbidden strategies, EA, copy trading, IP/VPN/VPS), updated 2026-08-19. https://help.fundingpips.com/hc/en-us/articles/34505029138449-Trading-Conduct-and-Security-Standards
3. Understanding Trading Mechanics (stop loss, rollover, balance vs equity), updated 2026-08-21. https://help.fundingpips.com/hc/en-us/articles/44559256768529-Understanding-Trading-Mechanics
4. News Trading & Weekend Holding, updated 2026-11-02. https://help.fundingpips.com/hc/en-us/articles/34504137479441-News-Trading-Weekend-Holding
5. 2 Step Standard (for the Flex comparison), updated 2026-11-02. https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard
6. Get Started (models, sizes, eligibility, restricted countries, fee refund), updated 2026-09-24. https://help.fundingpips.com/hc/en-us/articles/44390730743825-Get-Started
7. Master Account Setup (KYC, review, onboarding), updated 2026-08-28. https://help.fundingpips.com/hc/en-us/articles/48636294148497-Master-Account-Setup
8. Reward Methods (payout methods, minimums), updated 2026-09-28. https://help.fundingpips.com/hc/en-us/articles/34504564970385-Reward-Methods
9. Responsible Trading Policy, updated 2026-10-21. https://help.fundingpips.com/hc/en-us/articles/47328410434065-Responsible-Trading-Policy
10. Prime Account (scaling plan, invite only), updated 2026-09-30. https://help.fundingpips.com/hc/en-us/articles/34447308895889-Prime-Account
11. Trade Copier, updated 2026-09-10. https://help.fundingpips.com/hc/en-us/articles/49580068780817-Trade-Copier

**Other**
12. Finance Magnates, "Only 1 in 20 Traders Pass Prop Firm Challenges, Reports The Funded Trader", 2025-03-18 (Unverified: CEO statement relayed on Discord; secondary press; pass-rate figures are not FundingPips'). https://www.financemagnates.com/forex/only-1-in-20-traders-pass-prop-firm-challenges-reports-the-funded-trader/
13. Thorp, "The Kelly Criterion in Blackjack, Sports Betting and the Stock Market" (abstract page only read; Unverified for any specific drawdown claim). https://sites.oxy.edu/lengyel/M330/thorp/paper.htm

**Extract-only (official FundingPips pages that returned 429 to fetching; figures come from search-engine extracts, so check in the app)**
- 2 Step Flex product page, $5K price $35. https://fundingpips.com/2-step-flex
- Launch blog (10%/6% target, 85% split; superseded by [1]). https://fundingpips.com/blog/introducing-fundingpips-2-step-flex-12-drawdown-up-to-95-reward-split
- Terms and Conditions (not read). https://fundingpips.com/terms-and-conditions

**Repo (read locally; not backtested here)**
- `src/strategies/*.ts`, `src/strategies/registry.ts`, `src/lib/signals/scan.ts`, `src/lib/plan/weeklyPlan.ts`, `src/lib/economicCalendar.ts`
- [high-win-rate-strategies.md](high-win-rate-strategies.md), [scalping-strategies.md](scalping-strategies.md), [top-down-analysis.md](top-down-analysis.md), [exchange-fees-india.md](exchange-fees-india.md)

**Not found officially:** the $5K fee on a page I could read; the full Terms and Conditions text; whether the $5 per lot commission is per side or round turn; minimum trade duration; definitions of tick scalping, gap trading and hedging; a Phase 2 starting balance statement (assumed to reset to $5,000); a scaling plan for Flex Master accounts; any official FundingPips pass-rate statistic; whether a self-built signal bridge counts as an allowed personal EA.
