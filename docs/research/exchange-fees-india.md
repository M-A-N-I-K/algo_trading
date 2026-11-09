# Where to trade intraday crypto futures from India to pay the least in fees

Researched 2026-11-07. Scope: an India-resident retail trader running intraday and scalping strategies on crypto perpetuals (plus gold, forex and indices) through an algo app. Today the app trades on CoinDCX futures and its backtests assume **0.059% per side** (`src/lib/signals/scan.ts`, read from the user's own CoinDCX fills).

**Fees change often.** Every figure below is as of **7 Nov 2026**. Every URL was accessed on **2026-11-07**. Source labels:

- **Fetched:** I read the official page directly.
- **Extract:** the official page blocks automated fetches (HTTP 403), so the figure comes from a search engine's extract of that official page. Check it in the app before relying on it.
- **Unverified:** found only in secondary sources.

---

## TL;DR

- **Indian venues all charge almost the same at base tier: 0.02% maker and 0.05% taker, plus 18% GST**, which works out to 0.0236% / 0.059% per side. That covers CoinDCX, Delta Exchange India, Mudrex, Pi42 and ZebPay. Moving between them saves nothing on headline fees. A taker/taker round trip costs **0.118% (₹118 per ₹1 lakh notional)** on any of them.
- **The cheapest legal option for a scalper is Delta Exchange India's Scalper Offer.** The closing fee is waived on futures closed within 30 minutes (BTCUSD and ETHUSD) or 15 minutes (other futures). That halves the round trip to **0.059% (₹59) taker-in**, or **0.0236% (₹23.60) maker-in**. It is a promotion "effective from 25 Sep 2026" with **no end date and can be withdrawn without notice**, so don't build a strategy that only works with it.
- **Binance USDⓈ-M is about 15–24% cheaper on paper**: 0.02% / 0.05% with no GST shown on its official pages, and 0.018% / 0.045% when fees are paid in BNB. Taker/taker comes to **0.09–0.10% (₹90–100)**. Binance is FIU-registered (Aug 2024), so access is legal. The saving is **₹1,800–2,800 a month at 100 round trips**. Against that:
  - there is no direct INR rail, so you fund via USDT/P2P, which brings 1% TDS on the USDT legs;
  - the TDS and tax treatment of USDT-settled futures is unclear;
  - Binance is fighting a reported ₹722 crore GST demand, so GST could be added to its fees later.
- **Tax matters more than fees.** Indian INR-margined venues (Delta, CoinDCX INR-M, Pi42, Mudrex) say their futures are **not VDAs**: no 1% TDS, taxed at slab rate, losses can be set off. If USDT-settled futures (Binance, Bybit, and possibly CoinDCX USDT-M) are treated as VDA transfers, profits are taxed at **30% with no loss set-off**. That costs far more than any fee difference. These are the venues' own claims, not CBDT rulings.
- **Bybit (0.0649% taker with GST) costs more than the Indian venues. OKX is not available**: India is on its restricted-locations list.
- **Recommendation:** stay on an Indian INR-margined venue. **Delta Exchange India** is cheapest for sub-30-minute scalps while the offer lasts. **CoinDCX or Mudrex** are fine otherwise, since their fees are the same. Keep **0.059% per side** as the taker assumption. Add a **maker leg at 0.0236%**. Only model Delta's free exit as an upside scenario. If you move to Binance, use **0.045% taker / 0.018% maker** (BNB) and stress-test at 0.059%.

---

## 1. The venues at a glance (base tier, perpetual futures)

| Venue | Futures maker / taker (base) | GST 18% on top? | Effective per side, maker / taker | Spot (base) | Source status |
|---|---|---|---|---|---|
| **CoinDCX** INR-margined futures | 0.02% / 0.05% | Yes | 0.0236% / 0.059% | INR spot 0.50%, C2C 0.17% (extract) | Fetched ([support](https://support.coindcx.com/articles/fees-taxes/what-are-the-trading-fees-for-futures/6a6220ae1916c514c708a7a7)) |
| **CoinDCX** USDT-margined futures | 0.02% / 0.05% at entry level ("based on your VIP Level") | Yes | 0.0236% / 0.059% | (same) | Extract ([VIP page](https://coindcx.com/vip)); taker matches the user's own fills |
| **Delta Exchange India** | 0.02% / 0.05% of notional | Yes | 0.0236% / 0.059% | Spot exists; 1% TDS applies | Fetched ([fees article](https://www.delta.exchange/support/solutions/articles/80001177864-fees-on-options-and-futures-trading), [GST](https://www.delta.exchange/support/solutions/articles/80001132759-will-i-be-charged-gst-on-the-fee-paid-)) |
| **Delta**, Scalper Offer | Opening leg as above, **closing leg 0%** if closed within 30 min (BTCUSD, ETHUSD) or 15 min (others) | Yes (on the opening fee) | Round trip = one side only | n/a | Fetched ([offer](https://www.delta.exchange/support/solutions/articles/80001172745-scalper-offer)) |
| **Mudrex** (USDT- and INR-margined) | 0.02% / 0.05% (Non-Alpha, < ₹5 Cr/30d) | Yes | 0.0236% / 0.059% | 0.45% INR spot (Non-Alpha) | Fetched ([fee page](https://mudrex.com/fee)) |
| **Pi42** | VIP 0: 0.0200% / 0.0500% | Yes | 0.0236% / 0.059% | n/a (futures-only) | Extract ([fee structure](https://pi42.com/fee-structure), 403) |
| **ZebPay** futures | VIP 0: 0.020% / 0.050% | Not stated in extract; assumed yes | 0.0236% / 0.059% (assumed) | 0.45% | Extract ([pricing](https://zebpay.com/in/features/pricing)) |
| **Giottus** futures | Launched 20 Aug 2025 with fees waived to 30 Sep 2025; **no current schedule found** | ? | ? | n/a | Unverified (press only) |
| **Binance** USDⓈ-M | 0.02% / 0.05% (Regular User) | **Not shown** on official pages (see §3) | 0.02% / 0.05%; **0.018% / 0.045% with BNB (−10%)** | 0.10% / 0.10%, 0.075% with BNB (−25%) | Fetched ([futures FAQ](https://www.binance.com/en/support/faq/binance-futures-fee-structure-fee-calculations-360033544231)); spot from [BNB FAQ](https://www.binance.com/en/support/faq/how-to-use-bnb-to-pay-for-fees-and-earn-25-discount-115000583311) (extract) |
| **Bybit** USDT perpetual | 0.0200% / 0.0550% (VIP 0) | **Yes**, on derivatives fees for India-KYC users | 0.0236% / 0.0649% | 0.10% / 0.10% (+GST) | Fetched ([fee structure](https://www.bybit.com/en/help-center/article/Trading-Fee-Structure), [India GST/TDS FAQ](https://www.bybit.com/en/help-center/article/FAQ-Goods-and-Services-Tax-GST-in-India)) |
| **OKX** | n/a: **India is a restricted location** | n/a | n/a | n/a | Extract ([risk & compliance disclosure](https://www.okx.com/en-us/help/risk-compliance-disclosure)) |

Notes:

- **Binance's FAQ** calls its 0.02% / 0.05% figures examples ("hypothetical fee rates") and points to the live fee table, which didn't render for the fetcher. The BNB discount only applies when BNB sits in the USDⓈ-M futures wallet.
- **Delta's global site** (not the India one) lists 0.04% maker / 0.06% taker. That schedule doesn't apply to India accounts.
- **Older CoinDCX blog posts** quote 0.025% / 0.075%. These look superseded: the user's fills show 0.05% taker.

### VIP tiers don't help at this account size

100 round trips a month at ₹1 lakh notional is **₹2 crore of turnover a month** (₹1 lakh × 2 sides × 100). That is below every venue's first discount tier:

- Mudrex Alpha 1 needs ₹5 Cr a month ([Mudrex](https://mudrex.com/fee)).
- ZebPay VIP 1 needs roughly 2M USDT (about ₹17.6 Cr), per its pricing extract.
- Binance VIP 1 is also far above this.

Plan on base-tier fees.

---

## 2. Other charges: funding, deposits, withdrawals, conversion

| Venue | Funding interval | GST on funding? | INR deposit / withdrawal | Crypto withdrawal | INR↔USD handling |
|---|---|---|---|---|---|
| CoinDCX | Crypto perps every 8 h (contract pages, e.g. [B-SOL_USDT](https://coindcx.com/futures/B-SOL_USDT)); Global Futures every 1 h ([support](https://support.coindcx.com/articles/global-futures/what-is-the-funding-interval-for-all-markets/6a59d41e0efd16914ff06478)) | Not stated | IMPS deposit free ([support](https://support.coindcx.com/articles/inr-deposits/is-there-any-fee-for-inr-deposit/6381a7ec6a0f965f943ccd83), extract) | Per coin | INR-M futures settle at a **fixed 1 USDT = ₹102** "used internally for settlement" ([support](https://support.coindcx.com/articles/usdtinr-conversion-price-revised/what-is-the-current-usdt-to-inr-conversion-rate/6a6223cb4a527bb6a205825c), fetched) |
| Delta India | Every 8 h at 05:30, 13:30 and 21:30 IST from 8 Sep 2025; some contracts use 1, 2 or 4 h ([support](https://www.delta.exchange/support/solutions/articles/80001183756-update-on-funding-exchange-schedule-for-perpetual-contracts), extract) | Not stated | "Zero Deposit/Withdrawal Fees" ([fees page](https://www.delta.exchange/fees), fetched) | INR only | **Fixed 1 USD = ₹85**; balances held in INR, "no INR/USD conversion ever takes place" ([guide](https://guides.delta.exchange/delta-exchange-india-user-guide/account-setup/usd-inr-rate), extract; [user guide](https://guides.delta.exchange/delta-exchange-india-user-guide), fetched) |
| Mudrex | Every 8 h ([fees blog](https://mudrex.com/blog/mudrex-fees-charges-gst-and-tds/)) | **No** | 0% / 0% ([fee page](https://mudrex.com/fee)) | 2% (min $0.5), GST included | USDT→INR conversion carries 1% TDS ([blog](https://mudrex.com/blog/mudrex-fees-charges-gst-and-tds/)) |
| Pi42 | Every 4 or 8 h (extract) | ? | ? | ? | USDT deposits converted to INR carry fee + GST + 1% TDS (extract) |
| Binance | Default every 8 h at 00:00, 08:00 and 16:00 UTC; can move to 4 h or 1 h when funding hits its cap ([FAQ](https://www.binance.com/en/support/faq/360033525031), fetched) | n/a | **No INR bank rail found** on official pages; USDT usually comes via P2P (unverified) | Network fee per coin | Buying or selling USDT for INR is a VDA transfer, so 1% TDS applies |
| Bybit | Default every 8 h; dynamic switch to 1 h at the cap ([help](https://www.bybit.com/en/help-center/article/Funding-fee-calculation), extract) | **No** (FAQ excludes funding fees) | Fiat deposit/withdrawal fees attract GST ([FAQ](https://www.bybit.com/en/help-center/article/FAQ-Goods-and-Services-Tax-GST-in-India)) | Attracts GST | Spot/convert legs carry 1% TDS |

The fixed rates (CoinDCX ₹102, Delta ₹85) apply on both deposit and withdrawal, so they are not a per-trade cost. They do change what a rupee buys:

- At ₹102, ₹1 lakh becomes about 980 USDT of margin.
- At ₹85, ₹1 lakh becomes about 1,176 USD.

Any P&L comes back at the same rate. Fees are a percentage of notional, so the percentage costs in §5 are the same either way.

---

## 3. Legal and regulatory status for Indian residents

FIU-IND does not publish a live list. The latest official count I found is **54 VDA service providers registered as of 9 Mar 2026**, from a March 2026 parliamentary answer that I only saw reported in secondary sources (unverified). A parliamentary annexure ([eparlib AU112](https://eparlib.sansad.in/bitstream/123456789/2972630/1/AU112.pdf), seen as an extract; the server refused direct connection) lists **Neblio Technologies (CoinDCX)** and **RPFAS Technologies (Mudrex)** as registered.

| Venue | FIU-IND status | Futures legally accessible? | Notes |
|---|---|---|---|
| CoinDCX | Registered (Neblio Technologies; listed in parliamentary annexure) | Yes | Security incident on 19 Jul 2025: about $44M taken from an internal operational account. CoinDCX says it covered the loss from its own treasury and customer funds were untouched ([incident report](https://coindcx.com/blog/announcements/incident-report-july-19-2025/)). |
| Delta Exchange India | Registered reporting entity, Excelium Technologies Pvt Ltd, **REID VA00041101** ([support](https://www.delta.exchange/support/solutions?articleId=80001177929), fetched) | Yes | No securities or derivatives regulator oversees crypto futures in India. FIU registration is AML only. |
| Mudrex | Registered (RPFAS Technologies; parliamentary annexure) | Yes | |
| Pi42, ZebPay, Giottus | Not confirmed from a primary source | Offered | Check the FIU number in each app's footer before depositing. |
| **Binance** | **Registered as a reporting entity with FIU-IND**; announced 15 Aug 2024 ([Binance blog](https://www.binance.com/en/blog/regulation/binance-achieves-its-19th-global-regulatory-milestone-with-registration-in-india-3022489348045738409), fetched). The ~$2.25M FIU penalty is reported only on Binance Square and in press (unverified). | Binance says the site and app are "fully available for Indian users". The post **does not mention futures specifically**. | DGGI show-cause notice for about ₹722 crore GST on fees from Jul 2017 to Mar 2024 (unverified, press). Binance's Indian terms make tax **the user's responsibility** ([terms](https://www.binance.com/en-IN/terms), extract). |
| **Bybit** | Registered with FIU-IND as a reporting entity in Jan 2025; full access restored ([Bybit press, 8 Sep 2025](https://www.bybit.com/en/press/post/bybit-resumes-full-access-for-indian-users-reinforces-commitment-to-compliance-and-crypto-inclusion-blt7042bbc940598172), fetched) | Yes: "Spot, Derivatives, Options, and Copy Trading" | FIU fined Bybit ₹9.27 crore on 31 Jan 2025 (press, unverified). Bybit CFDs and trading bots are unavailable in India. |
| **OKX** | **Not registered.** It exited India in April 2024 (press). India appears on its **Restricted Locations** list. | **No** | |
| KuCoin | Says it is FIU-registered ([KuCoin Q&A](https://www.kucoin.com/support/30399751079449), extract) | Not confirmed | Deducts TDS for India-KYC users ([TDS guide](https://www.kucoin.com/support/30538829815833), extract). |

**Forex and CFD caution for the gold, FX and index side.** RBI's Alert List names unauthorised forex electronic trading platforms. Residents trading forex on unauthorised ETPs or for non-permitted purposes are "liable for legal action under the FEMA". Permitted electronic forex trading is limited to RBI-authorised ETPs and recognised exchanges (NSE, BSE, MSE) ([RBI alert list page](https://rbi.org.in/scripts/bs_viewcontent.aspx?Id=4235), extract). The backtest's forex and index costs (0.01% per side, "typical ECN broker" and "index CFD") assume offshore CFD pricing. **Offshore CFD brokers are not a legal option for residents.** Tokenised gold and stock perps on Indian crypto venues are a different product again: VDA-adjacent, with untested tax treatment.

---

## 4. Indian tax rules that matter for intraday

**Legal framework, as of today.** The **Income-tax Act, 2025 replaced the 1961 Act from 1 Apr 2026** ([PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2221416&reg=3&lang=1), extract). The VDA rules carried over:

- **30% flat tax on VDA transfer income** (old s.115BBH). No deduction except cost of acquisition. **No set-off of VDA losses against any income, including other VDA gains, and no carry-forward** ([s.115BBH](https://www.incometaxindia.gov.in/w/section-115bbh), extract; [set-off guide](https://www.incometaxindia.gov.in/documents/20117/42998/Set-off-and-carry-forward-of-losses_2026-05-27_12-13-23_131dc8_en.pdf/6713bef0-2a75-75f8-a539-2b2aa9a128d7), extract). Secondary sources place the 30% rate at s.194(1) of the 2025 Act (unverified section number).
- **1% TDS** on consideration for transferring a VDA (old **s.194S**, now **s.393(1), Table Sl. 8(vi)**). Thresholds per year: ₹50,000 if the payer is a "specified person" (an individual or HUF with no business income, or turnover within the audit limits), otherwise ₹10,000 ([s.393](https://wm.incometaxindia.gov.in/w/section-393-5), extract; [TDS on VDA](https://wm.incometaxindia.gov.in/w/tds-on-payment-for-the-transfer-of-virtual-digital-assets-vdas-), extract). Bybit's FAQ cites the same mapping.
- **VDA definition** (old s.2(47A), now s.509 of the 2025 Act): cryptographic tokens that represent value, NFTs and notified assets ([s.2](https://wm.incometaxindia.gov.in/w/section-2-65), extract). Budget 2026 added penalties for crypto *reporting entities* that fail to file statements ([Budget speech](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/feb/doc202621775901.pdf), extract). It did not change the 30% rate or the 1% TDS.

**Do the 1% TDS and 30% tax apply to futures? Here is what each venue says:**

| Venue | TDS on futures? | Tax treatment the venue claims | Source |
|---|---|---|---|
| CoinDCX | "TDS is not applicable on trading in Global Futures… applicable only on Spot trading & Insta trading. Futures trading does not attract TDS." Support says the same for INR-M futures (extract). An **older CoinDCX blog** says crypto-settled futures may count as VDA transfers, taxed at 30% with no set-off. | Mixed | [Support](https://support.coindcx.com/articles/fees-taxes/is-tds-applicable-on-global-futures-trading/6a59d441440a197f3d1c4abc) (fetched); [blog](https://coindcx.com/blog/crypto-futures-trading/crypto-futures-trading-tax-in-india) (extract) |
| Delta India | "the 1% TDS and 30% flat tax on profits is not applicable" because balances stay in INR. Both apply if you buy spot. | F&O "does not qualify as trading VDA… taxed as per your income tax slab"; losses can be offset | [User guide](https://guides.delta.exchange/delta-exchange-india-user-guide), [support](https://www.delta.exchange/support/solutions/articles/80001132761-is-there-30-vda-tax-applicable-on-trading-profits-) (fetched) |
| Mudrex | No TDS on futures in its fee table; "Taxation for INR and USDT futures remains unchanged". TDS applies on spot sells and USDT→INR conversion. | Not stated | [Fee page](https://mudrex.com/fee), [blog](https://mudrex.com/blog/mudrex-fees-charges-gst-and-tds/) (fetched) |
| Pi42 | Says INR-margin futures are outside 1% TDS and the 30% VDA tax | Slab rate (vendor claim) | [Blog](https://pi42.com/blog/crypto-taxes/) (extract) |
| Bybit | TDS table covers spot, convert and margin. **Derivatives are not listed**, but Bybit "reserves the right to apply TDS to applicable scenarios that may not be explicitly listed" | Not stated | [India FAQ](https://www.bybit.com/en/help-center/article/FAQ-Goods-and-Services-Tax-GST-in-India) (fetched) |
| Binance | No official India TDS page found. A Binance Square post said Binance would deduct 1% TDS after its relaunch (unverified). Terms put tax compliance on the user. | Not stated | [Terms](https://www.binance.com/en-IN/terms) (extract) |

**What this means in practice:**

- **No CBDT circular I found classifies crypto perpetual futures either way.** "Not a VDA, slab rate, losses set off" is each venue's own reading, strongest for INR-margined, INR-settled contracts. USDT-margined and USDT-settled contracts (Binance, Bybit, CoinDCX USDT-M) are closer to the VDA definition, because USDT is itself a VDA.
- **If the 30%/no-set-off rule applied to an intraday futures book**, every losing trade would be "dead" and every winning trade taxed at 30%. For a strategy with many small wins and losses, that can wipe out net returns far more than a 0.02% fee difference.
- **On offshore venues the TDS duty doesn't disappear.** Under s.194S/393 the duty sits with the **payer** (the buyer of the VDA). If the exchange doesn't deduct, the Indian user who buys USDT (for example on P2P) is expected to deduct and deposit it themselves (Form 26QE for specified persons). Each INR→USDT and USDT→INR round trip to fund an offshore account can therefore trigger TDS and 30% tax on any USDT/INR gain. These form details come from tax-practitioner guides only (unverified).
- **Get a CA's written opinion** before scaling up, especially before moving to an offshore USDT-settled venue.

---

## 5. Worked comparison: ₹1,00,000 notional, one round trip

**Formulas**

```
per-side cost %   = fee_rate × (1 + GST)              GST = 0.18 where charged, else 0
round-trip cost % = entry_side % + exit_side %
round-trip ₹      = notional × round-trip cost %       notional = ₹1,00,000
break-even move   = round-trip cost %                  (price must move this far in your favour
                                                        just to pay fees; slippage and funding extra)
```

Leverage doesn't change the cost as a percentage of notional. As a percentage of *margin*, it multiplies it: 0.118% of notional at 10× is 1.18% of margin.

| Venue (base tier) | (a) Taker in + taker out | (b) Maker in + maker out | (c) Maker in + taker out (limit entry, stop exit) |
|---|---|---|---|
| CoinDCX (USDT-M or INR-M), Delta (no offer), Mudrex, Pi42, ZebPay | 0.05%×1.18×2 = **0.118% = ₹118.00** | 0.02%×1.18×2 = **0.0472% = ₹47.20** | 0.0236% + 0.059% = **0.0826% = ₹82.60** |
| **Delta with Scalper Offer** (exit inside the window) | 0.059% + 0 = **0.059% = ₹59.00** | 0.0236% + 0 = **0.0236% = ₹23.60** | 0.0236% + 0 = **0.0236% = ₹23.60** |
| Bybit (India, +GST) | 0.055%×1.18×2 = **0.1298% = ₹129.80** | **0.0472% = ₹47.20** | 0.0236% + 0.0649% = **0.0885% = ₹88.50** |
| Binance USDⓈ-M, no GST | 0.05%×2 = **0.100% = ₹100.00** | 0.02%×2 = **0.040% = ₹40.00** | **0.070% = ₹70.00** |
| Binance USDⓈ-M, BNB (−10%), no GST | 0.045%×2 = **0.090% = ₹90.00** | 0.018%×2 = **0.036% = ₹36.00** | **0.063% = ₹63.00** |
| *Binance if 18% GST were ever added (with BNB)* | *0.1062% = ₹106.20* | *0.0425% = ₹42.48* | *0.0743% = ₹74.34* |
| *NSE index futures via a ₹20 discount broker (₹1 lakh notional, for scale)* | *₹103.75 = 0.104% (order type doesn't matter)* | | |
| *MCX gold futures via a ₹20 discount broker (₹1 lakh notional)* | *₹64.39 = 0.064%* | | |

The break-even move per trade equals the round-trip %:

- **0.118%** on Indian venues with market orders. On BTC at $100,000 that is a $118 move just to pay fees.
- **0.10% / 0.09%** on Binance (without / with BNB).
- **0.059%** on Delta with the Scalper Offer.
- **0.047%** on Indian venues with limit orders on both legs.

### Monthly cost at 100 round trips (₹1 lakh notional each, ₹2 Cr turnover)

| Venue | Taker / taker | Maker / maker | Maker in / taker out | Saving vs CoinDCX taker/taker |
|---|---|---|---|---|
| CoinDCX / Delta (no offer) / Mudrex / Pi42 / ZebPay | ₹11,800 | ₹4,720 | ₹8,260 | n/a |
| **Delta with Scalper Offer** | **₹5,900** | **₹2,360** | **₹2,360** | **₹5,900 a month** |
| Bybit | ₹12,980 | ₹4,720 | ₹8,850 | −₹1,180 (costs more) |
| Binance (USDT fees) | ₹10,000 | ₹4,000 | ₹7,000 | ₹1,800 |
| Binance (BNB fees) | ₹9,000 | ₹3,600 | ₹6,300 | ₹2,800 |
| NSE index futures (Zerodha-type) | ₹10,375 | n/a | n/a | n/a |
| MCX gold futures (Zerodha-type) | ₹6,439 | n/a | n/a | n/a |

**Switching from market to limit orders on the same venue saves ₹7,080 a month, more than any change of venue.** On CoinDCX that is ₹11,800 down to ₹4,720. Binance with BNB saves ₹2,800. The maker numbers assume every limit order fills. Missed fills and adverse selection make real maker savings smaller.

How the NSE and MCX rows were built, from [Zerodha charges](https://zerodha.com/charges) (fetched):

| Charge | NSE equity/index futures | MCX non-agri futures |
|---|---|---|
| Brokerage | 0.03% or ₹20 per order, whichever is lower | same |
| STT / CTT (sell side) | **0.05%** | 0.01% |
| Exchange transaction charge (both sides) | 0.00183% | 0.0021% |
| SEBI fee | ₹10 per crore | ₹10 per crore |
| Stamp duty (buy side) | 0.002% | 0.002% |
| GST | 18% on brokerage + exchange charges + SEBI fee | same |

Futures STT rose from 0.02% to **0.05% from 1 Apr 2026** (Finance Act 2026; [NSE circular](https://nsearchives.nseindia.com/content/circulars/FATAX73524.pdf), extract).

At ₹1 lakh notional the fixed ₹20 brokerage dominates. Real lots are much larger, and at ₹10 lakh notional the NSE round trip falls to about **0.06%**, mostly STT. MCX gold at the same size is about **0.02%**, which is cheaper than any crypto venue.

Tax on exchange-traded F&O is normally non-speculative business income, taxed at slab rates with loss set-off. I didn't verify this against a primary source for this note; treat it as unverified.

---

## 6. API access for the algo app

| Venue | Official API | Futures trading via API | Notes |
|---|---|---|---|
| CoinDCX | [docs.coindcx.com](https://docs.coindcx.com/) (fetched) | Yes: futures orders, positions, leverage, margin, TP/SL, wallets, futures WebSockets | Base `https://api.coindcx.com`. The docs only publish spot rate limits. The app already uses this. |
| Delta India | [docs.delta.exchange](https://docs.delta.exchange/) (fetched) | Yes: orders, bracket orders, batch (50 per contract), WebSocket private channels | Base `https://api.india.delta.exchange` (`api.delta.exchange` is Global and won't work). Quota: 20,000 units per 5 min; an order costs 5. Testnet: `cdn-ind.testnet.deltaex.org`. |
| Mudrex | [docs.trade.mudrex.com](https://docs.trade.mudrex.com/docs) (extract) | Yes: `/fapi/v1` on trade.mudrex.com, USDT- or INR-margined | INR↔USDT transfers aren't available via API. CCXT supports it. |
| Pi42, ZebPay | Not checked | n/a | n/a |
| Binance | [USDⓈ-M API](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info) (fetched) | Yes | Base `https://fapi.binance.com`. IP-based weight limits; the backtest data already comes from Binance. |
| Bybit | [V5 API](https://bybit-exchange.github.io/docs/v5/intro) (fetched) | Yes (linear USDT perps) | Host `api.bybit.com`. The matching engine moves to AWS Tokyo on 12 Nov 2026. Trading *bots* are unavailable in India, but that refers to Bybit's in-app bots, not the API. |

---

## 7. Recommendation

**1. Which venue minimises fees, legally.** For sub-30-minute BTC and ETH scalps (sub-15-minute on other pairs): **Delta Exchange India with the Scalper Offer switched on.** Taker/taker drops from 0.118% to 0.059%, about ₹5,900 a month saved at 100 trades. Beyond that, fees are the same on Delta, CoinDCX, Mudrex and Pi42. Pick on liquidity, slippage and API quality, not on the fee sheet.

**2. Order type matters more than venue.** Limit entries cut costs more than any venue change: 0.0826% for maker-in/taker-out and 0.0472% for maker/maker, against 0.118% for taker/taker. This is the biggest lever the app controls, and it works on CoinDCX without moving.

**3. Binance is cheaper on fees but brings tax and other risks.** The gain is ₹1,800–2,800 a month at this size. The risks:

- Funding goes INR → USDT → Binance, with no INR rail found, so every leg is a VDA transfer with 1% TDS and possible 30% tax on USDT/INR moves.
- USDT-settled futures P&L could be argued to be VDA income: 30%, no loss set-off.
- You have to self-comply on TDS.
- The GST demand outstanding against Binance could put 18% on its fees, which would make it no cheaper.
- Its depth and tighter spreads are a real advantage for market orders on less liquid coins. That saving isn't in the tables above.

At a $350 account the fee saving doesn't justify the tax uncertainty. Don't switch without a CA's opinion.

**4. Bybit and OKX.** Bybit costs *more* than the Indian venues for takers (0.0649% per side with GST). OKX isn't available to Indian residents.

**5. What to change in the backtest** (`MARKET_COSTS` in `src/lib/signals/scan.ts`):

| If you trade on | Taker per side | Maker per side | Comment |
|---|---|---|---|
| CoinDCX / Mudrex / Pi42 / Delta (offer off) | **0.059%** (keep) | **0.0236%** | Add a maker-entry option; the code has a single fee rate |
| Delta with Scalper Offer | 0.059% entry, **0% exit if held under 30 min (BTC, ETH) or 15 min (others)** | 0.0236% entry | Run it as a scenario only. It's a promo with no end date. Strategies must also pass at 0.059% on both sides. |
| Binance (BNB fees) | **0.045%** | **0.018%** | Stress-test at 0.059% (the GST case) |
| Bybit (India) | **0.0649%** | 0.0236% | n/a |
| NSE index / MCX gold futures | about 0.03% (index) / 0.01% (gold) per side at ₹10 lakh lots | n/a | The current forex/index assumption (0.01%, offshore CFD/ECN) isn't a legal venue for residents. Use exchange-traded costs. |

**6. Honest bottom line.** No legal venue gets crypto round-trip costs much below about 0.05% without maker fills or a promotion. The earlier research note found most 5m and 15m edges smaller than that (see `scalping-strategies.md`). The cheapest venue helps, but it won't turn a strategy with a pre-fee profit factor of about 1.0 into a profitable one.

---

## Sources (all accessed 2026-11-07)

**Exchange fee schedules and help centres**
- CoinDCX, futures trading fees (fetched). https://support.coindcx.com/articles/fees-taxes/what-are-the-trading-fees-for-futures/6a6220ae1916c514c708a7a7
- CoinDCX, VIP page (403; extract). https://coindcx.com/vip
- CoinDCX, TDS on Global Futures (fetched). https://support.coindcx.com/articles/fees-taxes/is-tds-applicable-on-global-futures-trading/6a59d441440a197f3d1c4abc
- CoinDCX, USDT–INR conversion rate (fetched). https://support.coindcx.com/articles/usdtinr-conversion-price-revised/what-is-the-current-usdt-to-inr-conversion-rate/6a6223cb4a527bb6a205825c
- CoinDCX, funding interval (extract). https://support.coindcx.com/articles/global-futures/what-is-the-funding-interval-for-all-markets/6a59d41e0efd16914ff06478
- CoinDCX, incident report 19 Jul 2025 (extract). https://coindcx.com/blog/announcements/incident-report-july-19-2025/
- CoinDCX, futures tax blog (extract). https://coindcx.com/blog/crypto-futures-trading/crypto-futures-trading-tax-in-india
- Delta Exchange India, fees on options and futures (fetched). https://www.delta.exchange/support/solutions/articles/80001177864-fees-on-options-and-futures-trading
- Delta Exchange India, fees page (fetched). https://www.delta.exchange/fees
- Delta Exchange India, GST on fees (fetched). https://www.delta.exchange/support/solutions/articles/80001132759-will-i-be-charged-gst-on-the-fee-paid-
- Delta Exchange India, Scalper Offer (fetched). https://www.delta.exchange/support/solutions/articles/80001172745-scalper-offer
- Delta Exchange India, 30% VDA tax on F&O (fetched). https://www.delta.exchange/support/solutions/articles/80001132761-is-there-30-vda-tax-applicable-on-trading-profits-
- Delta Exchange India, user guide (fetched). https://guides.delta.exchange/delta-exchange-india-user-guide
- Delta Exchange India, USD-INR rate (extract). https://guides.delta.exchange/delta-exchange-india-user-guide/account-setup/usd-inr-rate
- Delta Exchange India, funding schedule (extract). https://www.delta.exchange/support/solutions/articles/80001183756-update-on-funding-exchange-schedule-for-perpetual-contracts
- Delta Exchange India, regulation and REID (fetched). https://www.delta.exchange/support/solutions?articleId=80001177929
- Mudrex, fee page (fetched). https://mudrex.com/fee
- Mudrex, fees, GST and TDS blog (fetched). https://mudrex.com/blog/mudrex-fees-charges-gst-and-tds/
- Pi42, fee structure (403; extract). https://pi42.com/fee-structure
- Pi42, crypto taxes blog (extract). https://pi42.com/blog/crypto-taxes/
- ZebPay, pricing (extract). https://zebpay.com/in/features/pricing
- Binance, futures fee structure (fetched). https://www.binance.com/en/support/faq/binance-futures-fee-structure-fee-calculations-360033544231
- Binance, BNB 25% spot discount (extract). https://www.binance.com/en/support/faq/how-to-use-bnb-to-pay-for-fees-and-earn-25-discount-115000583311
- Binance, funding rates (fetched). https://www.binance.com/en/support/faq/360033525031
- Binance, India FIU registration, 15 Aug 2024 (fetched). https://www.binance.com/en/blog/regulation/binance-achieves-its-19th-global-regulatory-milestone-with-registration-in-india-3022489348045738409
- Binance, India terms (extract). https://www.binance.com/en-IN/terms
- Bybit, trading fee structure (fetched). https://www.bybit.com/en/help-center/article/Trading-Fee-Structure
- Bybit, GST and TDS in India FAQ, updated 2026-10-19 (fetched). https://www.bybit.com/en/help-center/article/FAQ-Goods-and-Services-Tax-GST-in-India
- Bybit, funding fee calculation (extract). https://www.bybit.com/en/help-center/article/Funding-fee-calculation
- Bybit, India full access press release, 8 Sep 2025 (fetched). https://www.bybit.com/en/press/post/bybit-resumes-full-access-for-indian-users-reinforces-commitment-to-compliance-and-crypto-inclusion-blt7042bbc940598172
- OKX, risk and compliance disclosure (extract). https://www.okx.com/en-us/help/risk-compliance-disclosure
- KuCoin, FIU registration Q&A and India TDS guide (extract). https://www.kucoin.com/support/30399751079449 · https://www.kucoin.com/support/30538829815833
- Zerodha, charges (fetched). https://zerodha.com/charges

**API docs**
- CoinDCX (fetched). https://docs.coindcx.com/
- Delta Exchange India (fetched). https://docs.delta.exchange/
- Mudrex (extract). https://docs.trade.mudrex.com/docs
- Binance USDⓈ-M (fetched). https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info
- Bybit V5 (fetched). https://bybit-exchange.github.io/docs/v5/intro

**Government**
- PIB, Income-tax Act 2025 in force from 1 Apr 2026 (extract). https://www.pib.gov.in/PressReleasePage.aspx?PRID=2221416&reg=3&lang=1
- Income Tax Dept, s.115BBH (extract). https://www.incometaxindia.gov.in/w/section-115bbh
- Income Tax Dept, set-off and carry-forward of losses (extract). https://www.incometaxindia.gov.in/documents/20117/42998/Set-off-and-carry-forward-of-losses_2026-05-27_12-13-23_131dc8_en.pdf/6713bef0-2a75-75f8-a539-2b2aa9a128d7
- Income Tax Dept, s.393 of the Income-tax Act 2025 (extract). https://wm.incometaxindia.gov.in/w/section-393-5
- Income Tax Dept, TDS on transfer of VDAs (extract). https://wm.incometaxindia.gov.in/w/tds-on-payment-for-the-transfer-of-virtual-digital-assets-vdas-
- Income Tax Dept, s.194S (extract). https://www.incometaxindia.gov.in/w/section-194s-4
- Budget 2026-27 speech (extract). https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/feb/doc202621775901.pdf
- NSE, STT revision circular under Finance Act 2026 (extract). https://nsearchives.nseindia.com/content/circulars/FATAX73524.pdf
- Lok Sabha, annexure of FIU-registered VDA SPs (extract; direct connection refused). https://eparlib.sansad.in/bitstream/123456789/2972630/1/AU112.pdf
- RBI, Alert List of unauthorised forex ETPs (extract). https://rbi.org.in/scripts/bs_viewcontent.aspx?Id=4235

**Secondary only (unverified)**
- 54 VDA SPs registered as of 9 Mar 2026: parliamentary answer as reported by aggregators.
- Binance ~$2.25M FIU penalty and ₹722 cr DGGI GST demand. https://inc42.com/buzz/crypto-exchange-binance-gets-inr-722-cr-gst-demand-notice/
- Bybit ₹9.27 cr FIU penalty. https://inc42.com/buzz/fiu-slaps-inr-9-3-cr-penalty-on-crypto-platform-bybit
- OKX India exit, Apr 2024. https://www.medianama.com/2024/03/223-crypto-exchange-okx-shuts-down-services-in-india/
- Giottus futures launch and fee waiver. https://www.onmanorama.com/news/business/2025/08/25/giottus-perpetual-futures-launch.html
- Buyer self-deduction of TDS on offshore/P2P purchases (Form 26QE): tax-practitioner guides, e.g. https://www.koinx.com/in/tax-guides/tds-on-crypto-trades-on-foreign-exchanges-and-dexs
