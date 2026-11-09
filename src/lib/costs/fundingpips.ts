// What a round trip really costs on the FundingPips account, so backtests,
// signals and position sizes charge the same costs the platform does.
//
// Commission is MEASURED from the user's MT5 "Trade History Report"
// (account 21185703, FundingPips-SIM1, 25 positions, 4–9 Nov 2026):
//   XAUUSD, XAGUSD  $5 per lot, charged once on the opening deal (0.05 lot → $0.25,
//                   0.1 → $0.50, 0.25 → $1.25); nothing on the close
//   ETHUSD          0.04% of the opening value, once (1 lot at 2219.39 → $0.89)
//   NDX100, SPX500  none
// Not in the report, taken from FundingPips' published terms: forex $5 per lot
// (same as metals) and BTCUSD 0.04% (same as ETH).
//
// Spread is NOT in the report (MT5 fills don't show the bid/ask). SPREAD below
// is an estimate in price units; replace it with the Spread column from MT5's
// Market Watch. Swap (overnight fees) is not charged here: the backtests don't
// model it, and on the funded account positions are closed daily anyway.

import { lotUnits as playbookLotUnits } from "@/lib/playbook/config";

export const COST_SOURCE =
  "Commission measured from your MT5 report (FundingPips-SIM1, 25 trades, 4–9 Nov 2026); spreads are estimates until replaced with MT5's Market Watch values.";

export type CommissionRule =
  | { kind: "perLot"; usdPerLot: number; measured: boolean }
  | { kind: "percent"; rate: number; measured: boolean }
  | { kind: "none"; measured: boolean };

// App and data-feed names → the platform's symbol.
export function platformSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/USDT$/, "USD");
  if (s === "NAS100" || s === "US100" || s === "USTEC") return "NDX100";
  if (s === "US500") return "SPX500";
  return s;
}

const isMetal = (p: string) => p.startsWith("XAU") || p.startsWith("XAG");
const isCrypto = (p: string) => p === "BTCUSD" || p === "ETHUSD";
const isIndex = (p: string) => p === "NDX100" || p === "SPX500";
const CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]);
const isFx = (p: string) => p.length === 6 && CURRENCIES.has(p.slice(0, 3)) && CURRENCIES.has(p.slice(3));

/** Markets the FundingPips account trades; the cost model covers only these. */
export function coveredByPlatform(symbol: string): boolean {
  const p = platformSymbol(symbol);
  return isMetal(p) || isCrypto(p) || isIndex(p) || isFx(p);
}

export function commissionRule(symbol: string): CommissionRule {
  const p = platformSymbol(symbol);
  if (isMetal(p)) return { kind: "perLot", usdPerLot: 5, measured: true };
  if (p === "ETHUSD") return { kind: "percent", rate: 0.0004, measured: true };
  if (p === "BTCUSD") return { kind: "percent", rate: 0.0004, measured: false };
  if (isIndex(p)) return { kind: "none", measured: true };
  return { kind: "perLot", usdPerLot: 5, measured: false }; // forex
}

// Estimated spread in price units (bid–ask), paid once per round trip.
export const SPREAD: Record<string, number> = {
  XAUUSD: 0.3,
  XAGUSD: 0.03,
  BTCUSD: 25,
  ETHUSD: 2,
  EURUSD: 0.00008,
  GBPUSD: 0.0001,
  AUDUSD: 0.0001,
  NZDUSD: 0.00012,
  USDCAD: 0.00012,
  USDCHF: 0.00012,
  USDJPY: 0.012,
  NDX100: 1.5,
  SPX500: 0.5,
};

/** Units of the base asset in one lot. Index sizes measured from the report's P&L. */
export function lotUnits(symbol: string): number {
  const p = platformSymbol(symbol);
  if (p === "NDX100") return 20; // 0.01 lot lost $14.59 on a 72.93-point move
  if (p === "SPX500") return 50; // 0.01 lot lost $4.52 on a 9.03-point move
  return playbookLotUnits(p);
}

// Pairs quoted in another currency (USD/JPY): a price unit is worth 1/price dollars.
const quoteToUsd = (p: string, price: number) => (p.startsWith("USD") && isFx(p) && price > 0 ? 1 / price : 1);

/** Round-trip cost per unit of the base asset, in dollars. */
export function roundTripCostPerUnitUsd(symbol: string, price: number): { commission: number; spread: number; total: number } {
  const p = platformSymbol(symbol);
  const rule = commissionRule(p);
  const commission =
    rule.kind === "perLot" ? rule.usdPerLot / lotUnits(p) : rule.kind === "percent" ? rule.rate * price * quoteToUsd(p, price) : 0;
  const spread = (SPREAD[p] ?? 0) * quoteToUsd(p, price);
  return { commission, spread, total: commission + spread };
}

/** Dollars a round trip of `lots` costs at `price`. */
export function roundTripCostUsd(symbol: string, lots: number, price: number): number {
  return roundTripCostPerUnitUsd(symbol, price).total * lots * lotUnits(symbol);
}

/**
 * The backtester's feeRate (charged per side, as a fraction of notional in the
 * quote currency) that adds up to the platform's round-trip cost at `price`.
 */
export function feeRatePerSide(symbol: string, price: number): number {
  if (!(price > 0)) return 0;
  const p = platformSymbol(symbol);
  const usdPerUnit = roundTripCostPerUnitUsd(p, price).total;
  const quotePerUnit = usdPerUnit / quoteToUsd(p, price);
  return quotePerUnit / price / 2;
}

/* ---------- re-deriving commission from imported trades ---------- */

export interface CommissionSample {
  symbol: string;
  volume: number; // lots
  openPrice: number;
  commission: number; // negative = paid
}

export interface CommissionFinding {
  symbol: string;
  trades: number;
  lots: number;
  paid: number; // $ total, positive
  usdPerLot: number;
  pctOfValue: number; // paid ÷ opening value
  rule: CommissionRule;
  matches: boolean; // the measured rule reproduces what was paid (within rounding)
}

/** Per symbol: what was paid and whether the rule above reproduces it. */
export function analyseCommission(samples: CommissionSample[]): CommissionFinding[] {
  const by = new Map<string, CommissionSample[]>();
  for (const s of samples) {
    const p = platformSymbol(s.symbol);
    by.set(p, [...(by.get(p) ?? []), s]);
  }
  return [...by.entries()]
    .map(([symbol, rows]) => {
      const lots = rows.reduce((a, r) => a + r.volume, 0);
      const paid = -rows.reduce((a, r) => a + r.commission, 0);
      const value = rows.reduce((a, r) => a + r.volume * lotUnits(symbol) * r.openPrice, 0);
      const rule = commissionRule(symbol);
      const expected = rows.reduce((a, r) => {
        const v = r.volume * lotUnits(symbol) * r.openPrice;
        return a + (rule.kind === "perLot" ? rule.usdPerLot * r.volume : rule.kind === "percent" ? rule.rate * v : 0);
      }, 0);
      return {
        symbol,
        trades: rows.length,
        lots,
        paid,
        usdPerLot: lots > 0 ? paid / lots : 0,
        pctOfValue: value > 0 ? paid / value : 0,
        rule,
        matches: Math.abs(paid - expected) <= 0.01 * rows.length + 1e-9,
      };
    })
    .sort((a, b) => b.paid - a.paid);
}
