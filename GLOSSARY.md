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
