# Glossary

Domain terms for the trading journal. Use these names in code, comments and reviews.

## Exchange sync (CoinDCX futures)

**Ledger**: CoinDCX's futures position ledger (`/positions/transactions`). The source of truth for realized P&L, fees and funding. Each order row carries the exchange's own realized P&L for one fill (on an average-cost basis), and each funding row carries one funding settlement. Rows are in the position's margin currency.

**Position**: CoinDCX's `position_id`, a long-lived book per symbol and margin currency. An INR-margined position and a USDT-margined position in the same symbol are separate positions.

**Round trip**: one journal trade synced from the exchange. It runs within one position, from the fill that opens it until net quantity returns to zero. Scale-ins and partial exits are *legs* of the same round trip. A fill that flips the position is split between two round trips. Only closed round trips become trades.

**Gross P&L** (shown as *Price P&L*): realized P&L from price movement, taken from the ledger rather than recomputed from fills.

**Fees**: trading fees on every leg of a round trip, entry and exit.

**Funding**: signed sum of the funding settlements that fell inside a round trip's open window.

**Net P&L**: gross − fees + funding. Stored as `Trade.pnl` (USDT), and the number every journal stat uses: win rate, R-multiple, loss limits.

**Open funding**: funding paid or received on a position that is still open. It is not part of any trade yet and moves into the trade when the round trip closes.

**Unattributed**: ledger amounts that can't be tied to any round trip. They are reported as their own figure, never dropped, so totals still reconcile with CoinDCX.

**Margin currency**: the currency a position is margined and settled in (INR or USDT). Amounts are reported in USDT, converted at each ledger row's own `price_in_usdt`. The native net figure is kept as `netPnlNative`.

**Exit type**: how a round trip ended: `manual`, `tpsl` (take-profit or stop-loss order) or `liquidation`.

## Journal metrics

**P&L bridge**: the dashboard's opening view, which walks from price P&L through fees and funding to net P&L.

**Break-even move**: the average round-trip fee as a percentage of entry size. A trade's price has to move this far just to cover its fees.

**Expectancy**: average net P&L per trade.

**Drawdown**: how far net P&L sits below its previous high.

## Backtesting

**Backtest**: one simulation of a signal source over one candle series (`simulate()` in `src/domain/backtesting`). It produces round trips and an equity curve, with the same money vocabulary as the journal: net P&L = gross − fees + funding.

**Signal source**: the seam between a strategy and the simulation. After each bar closes it decides what to do at the next bar's open: enter, exit, or nothing. It must decide bar *t* from bars 0..*t* only. Two adapters: a Strategy Builder definition (`fromStrategyDefinition`) and a hand-coded strategy (`fromCodedStrategy`).

**Look-ahead**: a signal source using bars after *t* to decide bar *t*. `detectLookAhead` replays a source on truncated history and flags any decision that changes.

**Execution settings**: how orders are filled and sized, separate from what the strategy wants: starting capital, fee rate, slippage, max leverage, position sizing, lot size, minimum R:R, guardrails.

**Round trip** (backtest): same definition as exchange sync, from the entry fill until quantity is back to zero. Partial take-profits are **legs** of it, never separate trades, so win rate and profit factor count round trips.

**Fill rules**: entries, signal exits and time exits fill at the next bar's open. Stops and targets fill intrabar at their level, or at the open when price gaps through. If one bar touches both stop and target, the stop wins. An entry whose fill has already gapped past its stop or target is skipped.

**End-of-data exit**: a position still open when the candles run out, closed at the last close. Counted in the metrics and flagged in the results.

**Guardrails**: limits applied on top of sizing: max risk per trade, max position capital, and max daily loss (no new entries for the rest of that UTC day).

**Backtest metrics**: computed once from the full result: the journal's `summarize()` over round trips, plus return %, mark-to-market max drawdown %, time in market and test period. Trimming trades or the equity curve for display never changes them.

**Legacy run**: a saved backtest from before the simulation engine. It has no stored metrics, counted partial take-profits as trades and kept only its last 100 trades.

**Warm-up**: bars loaded before the backtest range so indicators are already formed on its first bar. The run takes the strategy's longest indicator period or lookback × 3, at least 100 bars. No decisions are taken and no equity is recorded until the last warm-up bar closes, and metrics cover the range only.

**Candle cache**: historical candles live in the `candles` table. For a Binance instrument, a backtest fetches only the spans missing from the cache, in pages of 1,000, and never stores the candle that's still forming. The first run on a long range is slow; later runs read from the cache.

**Data source**: where a backtest's candles came from, stored in its configuration: `binance-spot` (Binance spot history, the crypto pairs), `binance-futures` (Binance USDⓈ-M futures, for markets spot doesn't list, such as gold XAUUSDT; instruments on exchange `BINANCE_FUTURES`), or `demo` (a seeded random walk, for instruments not on Binance). CoinDCX futures prices track these closely but not exactly, so live fills would differ slightly.

**Demo backtest**: a backtest that ran on demo candles. It checks a strategy's mechanics, not its edge, and is labelled as such everywhere it's shown.

**Builder backtest**: a backtest of one saved Strategy Builder version, stored with its configuration, metrics, curves and every round trip (`runStrategyBacktest`). The builder saves unsaved changes as a new version before running, so every result maps to an exact definition.

## Market structure (coded strategies)

**Swing high / swing low**: a fractal: a high (low) with N strictly lower highs (higher lows) on each side. It only exists once the N bars after it have closed.

**Break of structure**: a candle closing beyond the last unbroken swing high (bullish) or swing low (bearish). The latest break sets the trend; an opposite break flips it.

**Protected low / high**: the origin of the leg that made a break of structure: the lowest low between the broken swing high and the break (bullish), or the mirror.

**Extreme order block**: the last opposite-coloured candle at the protected low or high, as opposed to the decisional block just before the break. Its zone runs from the leg's extreme to the candle's body edge. `extreme-order-block` trades only the first return to it, in the trend's direction, after a candle closes back out of it.

## Guides

**Strategy guide**: a beginner's playbook for trading one coded strategy by hand (`src/guides`, shown at `/guides`): terms, chart setup, long and short steps, entry, stop, target, management, when not to trade, mistakes, a worked example, a diagram, a pre-trade checklist and the last backtest's results. Its rules match the strategy's code. Every registered strategy must have one.

## Live Pulse

**Live Pulse**: a live read of one market (`src/domain/market-pulse`, shown on the dashboard and at `/markets`), from Binance USDⓈ-M futures, refreshed every 15s. A market is added by adding it to `PULSE_MARKETS`. It is a description of the market, not a trade signal.

**Bull / bear %**: the share of the last hour's volume from market buy orders (taker buy volume) vs market sell orders, over 1m candles.

**Bias**: "buyers in control" when buyers took 55%+ of the hour and price rose over it; "sellers in control" for the mirror; otherwise "two-way balance".

**Range position**: where the last price sits in the 24h range, 0% at the low and 100% at the high.

**Supply / demand zone (pulse)**: the 15m candle that made the 24h high, from its body top to the high; and the one that made the 24h low, from the low to its body bottom. Not the same as an order block.

**Volatility regime**: the 24h span against the average daily range of the last 14 closed days. Under 0.7× is quiet, over 1.3× is expanding, otherwise normal. Pips are shown only for markets with a pip size (gold, silver, oil).

**Catalysts**: high and medium impact economic events for the market's currencies, from the ForexFactory weekly calendar (an unofficial free feed), from 12h ago onward.
