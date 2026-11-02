import type { CoinDcxClient, FuturesFill, LedgerRow } from "./client";

// Pure reconciliation of CoinDCX futures activity into round trips.
//
// - A round trip runs within one CoinDCX position (position_id) from the
//   first fill that opens it until net quantity returns to zero. Scale-ins
//   and partial exits are legs inside it; a fill that flips the position is
//   split into a closing leg and an opening leg of the next round trip.
// - Realized gross P&L and fees come from the exchange ledger, not from our
//   own price math: the ledger is what actually hit the wallet (average-cost
//   basis, INR positions at CoinDCX's own conversion). Fills only decide the
//   grouping, average prices, quantity and risk.
// - Funding settlements are attributed to the round trip whose open window
//   contains them, to the still-open round trip ("open"), or counted as
//   "unattributed" — never dropped.
//
// All money fields on RoundTrip are USDT (converted per ledger row at its
// own price_in_usdt); `netPnlNative` is in the position's margin currency.

export type ExitType = "manual" | "tpsl" | "liquidation";
export type LedgerAttribution = "trade" | "open" | "unattributed";

export interface RoundTrip {
  externalId: string;
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  marginCurrency: string;
  openedAt: Date;
  closedAt: Date;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  fees: number;
  funding: number;
  netPnl: number;
  netPnlNative: number;
  stopLoss: number | null;
  initialRiskAmount: number | null;
  exitType: ExitType;
}

export interface AttributedLedgerRow extends LedgerRow {
  attribution: LedgerAttribution;
  tradeExternalId: string | null;
}

export interface ReconcileResult {
  roundTrips: RoundTrip[];
  ledger: AttributedLedgerRow[];
  /** Funding (USDT) on positions that are still open. */
  openFunding: number;
  /** Ledger amounts (USDT) that could not be tied to any round trip. */
  unattributed: { grossPnl: number; fees: number; funding: number };
}

interface Leg {
  orderId: string;
  quantity: number;
  price: number;
  feePerUnit: number; // from the fill, fallback only
}

interface Draft {
  positionId: string;
  symbol: string;
  marginCurrency: string;
  firstFillId: string;
  side: "LONG" | "SHORT";
  openedAt: number;
  closedAt: number | null;
  entries: Leg[];
  exits: Leg[];
}

interface OrderLedger {
  positionId: string;
  grossNative: number;
  grossUsdt: number;
  feeNative: number;
  feeUsdt: number;
  stages: Set<string>;
}

const isFunding = (row: LedgerRow) => row.stage === "funding";
const isOrderRow = (row: LedgerRow) => !isFunding(row) && row.parentType.endsWith("Order");

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function weightedPrice(legs: Leg[]): number {
  const qty = sum(legs.map((l) => l.quantity));
  return qty > 0 ? sum(legs.map((l) => l.price * l.quantity)) / qty : 0;
}

function exitTypeFor(stages: Iterable<string>): ExitType {
  const all = [...stages];
  if (all.some((s) => s.startsWith("liquid"))) return "liquidation";
  if (all.some((s) => s.includes("tpsl"))) return "tpsl";
  return "manual";
}

export function reconcileFutures(input: {
  fills: FuturesFill[];
  ledger: LedgerRow[];
  stopLossByOrderId?: Map<string, number>;
}): ReconcileResult {
  const stops = input.stopLossByOrderId ?? new Map<string, number>();

  // 1. Per-order ledger totals (an order with several fills has several rows).
  const orderLedger = new Map<string, OrderLedger>();
  for (const row of input.ledger.filter(isOrderRow)) {
    const o = orderLedger.get(row.parentId) ?? {
      positionId: row.positionId,
      grossNative: 0,
      grossUsdt: 0,
      feeNative: 0,
      feeUsdt: 0,
      stages: new Set<string>(),
    };
    o.grossNative += row.amount;
    o.grossUsdt += row.amount * row.priceInUsdt;
    o.feeNative += row.feeAmount;
    o.feeUsdt += row.feeAmount * row.priceInUsdt;
    o.stages.add(row.stage);
    orderLedger.set(row.parentId, o);
  }

  // 2. Walk fills per position, building round-trip drafts.
  const byPosition = new Map<string, FuturesFill[]>();
  for (const fill of input.fills) {
    const positionId =
      orderLedger.get(fill.orderId)?.positionId ?? `book:${fill.symbol}:${fill.marginCurrency}`;
    const arr = byPosition.get(positionId) ?? [];
    arr.push(fill);
    byPosition.set(positionId, arr);
  }

  const closed: Draft[] = [];
  const openByPosition = new Map<string, Draft>();

  for (const [positionId, fills] of byPosition) {
    fills.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    let net = 0; // signed: + long, - short
    let current: Draft | null = null;

    for (const fill of fills) {
      const dir = fill.side === "buy" ? 1 : -1;
      const feePerUnit = fill.quantity > 0 ? fill.feeAmount / fill.quantity : 0;
      let remaining = fill.quantity;

      if (current && Math.sign(net) === -dir) {
        const closeQty = Math.min(remaining, Math.abs(net));
        current.exits.push({ orderId: fill.orderId, quantity: closeQty, price: fill.price, feePerUnit });
        net += dir * closeQty;
        remaining -= closeQty;
        const scale = Math.max(1, sum(current.entries.map((l) => l.quantity)));
        if (Math.abs(net) <= 1e-9 * scale) {
          net = 0;
          current.closedAt = fill.timestamp;
          closed.push(current);
          current = null;
        }
      }

      if (remaining > 1e-12) {
        if (!current) {
          current = {
            positionId,
            symbol: fill.symbol,
            marginCurrency: fill.marginCurrency,
            firstFillId: fill.id,
            side: dir > 0 ? "LONG" : "SHORT",
            openedAt: fill.timestamp,
            closedAt: null,
            entries: [],
            exits: [],
          };
        }
        current.entries.push({ orderId: fill.orderId, quantity: remaining, price: fill.price, feePerUnit });
        net += dir * remaining;
      }
    }

    if (current) openByPosition.set(positionId, current);
  }

  // 3. Allocate each order's ledger P&L and fees across the legs it fed.
  //    P&L goes to closing legs only; fees go to every leg, pro rata by qty.
  const allDrafts = [...closed, ...openByPosition.values()];
  const closingQty = new Map<string, number>();
  const legQty = new Map<string, number>();
  for (const d of allDrafts) {
    for (const l of d.exits) closingQty.set(l.orderId, (closingQty.get(l.orderId) ?? 0) + l.quantity);
    for (const l of [...d.entries, ...d.exits]) legQty.set(l.orderId, (legQty.get(l.orderId) ?? 0) + l.quantity);
  }

  const externalIdOf = (d: Draft) => `rt:${d.positionId}:${d.firstFillId}`;
  const orderOwner = new Map<string, { attribution: LedgerAttribution; tradeExternalId: string | null }>();

  const roundTrips: RoundTrip[] = closed.map((d) => {
    const entryPrice = weightedPrice(d.entries);
    const exitPrice = weightedPrice(d.exits);
    const quantity = sum(d.entries.map((l) => l.quantity));
    const dir = d.side === "LONG" ? 1 : -1;

    let grossUsdt = 0;
    let grossNative = 0;
    for (const leg of d.exits) {
      const o = orderLedger.get(leg.orderId);
      if (o) {
        const share = leg.quantity / (closingQty.get(leg.orderId) as number);
        grossUsdt += o.grossUsdt * share;
        grossNative += o.grossNative * share;
      } else {
        // No ledger row for this order (outside the ledger's history):
        // fall back to price math against the round trip's average entry.
        const pnl = (leg.price - entryPrice) * leg.quantity * dir;
        grossUsdt += pnl;
        grossNative += pnl;
      }
    }

    let feeUsdt = 0;
    let feeNative = 0;
    for (const leg of [...d.entries, ...d.exits]) {
      const o = orderLedger.get(leg.orderId);
      if (o) {
        const share = leg.quantity / (legQty.get(leg.orderId) as number);
        feeUsdt += o.feeUsdt * share;
        feeNative += o.feeNative * share;
      } else {
        feeUsdt += leg.feePerUnit * leg.quantity;
        feeNative += leg.feePerUnit * leg.quantity;
      }
    }

    const firstStop = d.entries.map((l) => stops.get(l.orderId)).find((s) => s != null) ?? null;
    const initialRiskAmount =
      firstStop == null
        ? null
        : sum(d.entries.map((l) => Math.abs(l.price - (stops.get(l.orderId) ?? firstStop)) * l.quantity));

    const stages = d.exits.flatMap((l) => [...(orderLedger.get(l.orderId)?.stages ?? [])]);
    const externalId = externalIdOf(d);
    for (const leg of [...d.entries, ...d.exits]) {
      if (!orderOwner.has(leg.orderId)) orderOwner.set(leg.orderId, { attribution: "trade", tradeExternalId: externalId });
    }

    return {
      externalId,
      positionId: d.positionId,
      symbol: d.symbol,
      side: d.side,
      marginCurrency: d.marginCurrency,
      openedAt: new Date(d.openedAt),
      closedAt: new Date(d.closedAt as number),
      quantity,
      entryPrice,
      exitPrice,
      grossPnl: grossUsdt,
      fees: feeUsdt,
      funding: 0, // filled in step 4
      netPnl: grossUsdt - feeUsdt,
      netPnlNative: grossNative - feeNative,
      stopLoss: firstStop,
      initialRiskAmount,
      exitType: exitTypeFor(stages),
    };
  });

  for (const d of openByPosition.values()) {
    for (const leg of [...d.entries, ...d.exits]) {
      if (!orderOwner.has(leg.orderId)) orderOwner.set(leg.orderId, { attribution: "open", tradeExternalId: null });
    }
  }

  // 4. Funding: attribute each settlement to the round trip open at that time.
  const tripsByPosition = new Map<string, RoundTrip[]>();
  for (const rt of roundTrips) {
    const arr = tripsByPosition.get(rt.positionId) ?? [];
    arr.push(rt);
    tripsByPosition.set(rt.positionId, arr);
  }

  const unattributed = { grossPnl: 0, fees: 0, funding: 0 };
  let openFunding = 0;

  const ledger: AttributedLedgerRow[] = input.ledger.map((row) => {
    const usdt = row.amount * row.priceInUsdt;

    if (isFunding(row)) {
      const rt = (tripsByPosition.get(row.positionId) ?? []).find(
        (t) => row.createdAt >= t.openedAt.getTime() && row.createdAt <= t.closedAt.getTime(),
      );
      if (rt) {
        rt.funding += usdt;
        rt.netPnl += usdt;
        rt.netPnlNative += row.amount;
        return { ...row, attribution: "trade", tradeExternalId: rt.externalId };
      }
      const open = openByPosition.get(row.positionId);
      if (open && row.createdAt >= open.openedAt) {
        openFunding += usdt;
        return { ...row, attribution: "open", tradeExternalId: null };
      }
      unattributed.funding += usdt;
      return { ...row, attribution: "unattributed", tradeExternalId: null };
    }

    const owner = isOrderRow(row) ? orderOwner.get(row.parentId) : undefined;
    if (!owner) {
      // Ledger row with no matching fill (or not an order row at all).
      unattributed.grossPnl += usdt;
      unattributed.fees += row.feeAmount * row.priceInUsdt;
      return { ...row, attribution: "unattributed", tradeExternalId: null };
    }
    // P&L is only allocated through closing legs; an order that realized
    // P&L but never closed anything in our walk surfaces it here instead.
    if (!closingQty.has(row.parentId)) unattributed.grossPnl += usdt;
    return { ...row, ...owner };
  });

  roundTrips.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  return { roundTrips, ledger, openFunding, unattributed };
}

// Fetch everything behind the client seam and reconcile it — no database.
export async function reconcileFromClient(client: CoinDcxClient) {
  const [fills, ledger, stopLossByOrderId] = await Promise.all([
    client.futuresFills(),
    client.futuresLedger(),
    client.futuresStopLosses(),
  ]);
  return { fills, ledger, result: reconcileFutures({ fills, ledger, stopLossByOrderId }) };
}
