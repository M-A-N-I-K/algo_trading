import { describe, expect, it } from "vitest";
import { createInMemoryCoinDcxClient, type FuturesFill, type LedgerRow } from "./client";
import { reconcileFromClient } from "./reconcile";

const POS = "pos-eth-usdt";
let seq = 0;

function fill(p: Partial<FuturesFill> & Pick<FuturesFill, "orderId" | "side" | "quantity" | "price" | "timestamp">): FuturesFill {
  return { id: `f${++seq}`, symbol: "ETHUSDT", feeAmount: 0, marginCurrency: "USDT", ...p };
}

function orderRow(p: Partial<LedgerRow> & Pick<LedgerRow, "parentId" | "createdAt">): LedgerRow {
  return {
    id: `l${++seq}`,
    stage: "default",
    parentType: "Derivatives::Futures::Order",
    positionId: POS,
    symbol: "ETHUSDT",
    amount: 0,
    feeAmount: 0,
    priceInUsdt: 1,
    marginCurrency: "USDT",
    ...p,
  };
}

function fundingRow(p: Partial<LedgerRow> & Pick<LedgerRow, "amount" | "createdAt">): LedgerRow {
  return orderRow({
    parentId: `snap${++seq}`,
    stage: "funding",
    parentType: "Derivatives::Futures::FundingSnapshot",
    ...p,
  });
}

async function reconcile(data: Parameters<typeof createInMemoryCoinDcxClient>[0]) {
  return (await reconcileFromClient(createInMemoryCoinDcxClient(data))).result;
}

describe("reconcileFutures", () => {
  it("groups scale-ins and partial exits into one round trip using ledger P&L", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "o1", side: "buy", quantity: 1, price: 100, timestamp: 1 }),
        fill({ orderId: "o2", side: "buy", quantity: 1, price: 110, timestamp: 2 }),
        fill({ orderId: "o3", side: "sell", quantity: 1, price: 120, timestamp: 3 }),
        fill({ orderId: "o4", side: "sell", quantity: 1, price: 130, timestamp: 4 }),
      ],
      ledger: [
        orderRow({ parentId: "o1", feeAmount: 0.1, createdAt: 1 }),
        orderRow({ parentId: "o2", feeAmount: 0.1, createdAt: 2 }),
        // Exchange realizes on average cost (105): 15 and 25 — not FIFO's 20/20.
        orderRow({ parentId: "o3", stage: "tpsl_exit", amount: 15, feeAmount: 0.1, createdAt: 3 }),
        orderRow({ parentId: "o4", amount: 25, feeAmount: 0.1, createdAt: 4 }),
      ],
    });

    expect(result.roundTrips).toHaveLength(1);
    const [rt] = result.roundTrips;
    expect(rt).toMatchObject({ side: "LONG", quantity: 2, entryPrice: 105, exitPrice: 125, exitType: "tpsl" });
    expect(rt.grossPnl).toBeCloseTo(40);
    expect(rt.fees).toBeCloseTo(0.4);
    expect(rt.netPnl).toBeCloseTo(39.6);
    expect(rt.externalId).toMatch(new RegExp(`^rt:${POS}:f\\d+$`));
  });

  it("splits a flipping fill into a close and a new opposite round trip", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "a", side: "buy", quantity: 1, price: 100, timestamp: 1 }),
        fill({ orderId: "b", side: "sell", quantity: 3, price: 90, timestamp: 2 }),
        fill({ orderId: "c", side: "buy", quantity: 2, price: 80, timestamp: 3 }),
      ],
      ledger: [
        orderRow({ parentId: "a", feeAmount: 1, createdAt: 1 }),
        orderRow({ parentId: "b", amount: -10, feeAmount: 3, createdAt: 2 }),
        orderRow({ parentId: "c", amount: 20, feeAmount: 2, createdAt: 3 }),
      ],
    });

    expect(result.roundTrips.map((t) => [t.side, t.quantity, t.entryPrice, t.exitPrice])).toEqual([
      ["LONG", 1, 100, 90],
      ["SHORT", 2, 90, 80],
    ]);
    const [long, short] = result.roundTrips;
    // Order b's P&L all belongs to its closing leg; its fee is split 1:2 by qty.
    expect(long.grossPnl).toBeCloseTo(-10);
    expect(long.fees).toBeCloseTo(1 + 1);
    expect(short.grossPnl).toBeCloseTo(20);
    expect(short.fees).toBeCloseTo(2 + 2);
  });

  it("attributes funding to the round trip open at the time, to open positions, or as unattributed", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "o1", side: "sell", quantity: 1, price: 100, timestamp: 10 }),
        fill({ orderId: "o2", side: "buy", quantity: 1, price: 90, timestamp: 20 }),
        fill({ orderId: "o3", side: "buy", quantity: 1, price: 95, timestamp: 30 }), // still open
      ],
      ledger: [
        orderRow({ parentId: "o1", createdAt: 10 }),
        orderRow({ parentId: "o2", amount: 10, createdAt: 20 }),
        orderRow({ parentId: "o3", feeAmount: 0.5, createdAt: 30 }),
        fundingRow({ amount: 0.3, createdAt: 15 }),
        fundingRow({ amount: -0.2, createdAt: 35 }),
        fundingRow({ amount: -1, createdAt: 5 }), // before anything was open
      ],
    });

    const [rt] = result.roundTrips;
    expect(rt.funding).toBeCloseTo(0.3);
    expect(rt.netPnl).toBeCloseTo(10.3);
    expect(result.openFunding).toBeCloseTo(-0.2);
    expect(result.unattributed.funding).toBeCloseTo(-1);
    expect(result.ledger.filter((r) => r.attribution === "open").map((r) => r.parentId)).toContain("o3");
    expect(result.ledger.find((r) => r.amount === 0.3)?.tradeExternalId).toBe(rt.externalId);
  });

  it("reports INR-margined positions in USDT at each ledger row's own rate, keeping native net", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "i1", side: "buy", quantity: 2, price: 10, timestamp: 1, marginCurrency: "INR", symbol: "AVAXUSDT" }),
        fill({ orderId: "i2", side: "sell", quantity: 2, price: 9, timestamp: 2, marginCurrency: "INR", symbol: "AVAXUSDT" }),
      ],
      ledger: [
        orderRow({ parentId: "i1", positionId: "pos-avax-inr", marginCurrency: "INR", feeAmount: 10, priceInUsdt: 0.01, createdAt: 1 }),
        orderRow({ parentId: "i2", positionId: "pos-avax-inr", marginCurrency: "INR", stage: "liquidate", amount: -200, feeAmount: 10, priceInUsdt: 0.01, createdAt: 2 }),
      ],
    });

    const [rt] = result.roundTrips;
    expect(rt).toMatchObject({ marginCurrency: "INR", exitType: "liquidation", positionId: "pos-avax-inr" });
    expect(rt.grossPnl).toBeCloseTo(-2);
    expect(rt.fees).toBeCloseTo(0.2);
    expect(rt.netPnl).toBeCloseTo(-2.2);
    expect(rt.netPnlNative).toBeCloseTo(-220);
  });

  it("computes initial risk across scale-in legs from each order's stop", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "e1", side: "buy", quantity: 1, price: 100, timestamp: 1 }),
        fill({ orderId: "e2", side: "buy", quantity: 1, price: 104, timestamp: 2 }), // no stop: uses first stop
        fill({ orderId: "x", side: "sell", quantity: 2, price: 110, timestamp: 3 }),
      ],
      stopLosses: { e1: 95 },
    });

    const [rt] = result.roundTrips;
    expect(rt.stopLoss).toBe(95);
    expect(rt.initialRiskAmount).toBeCloseTo(5 + 9);
  });

  it("uses a stop added to the position after entry when the entry order had none", async () => {
    const stop = (p: { orderId: string; side: "buy" | "sell"; stopPrice: number; createdAt: number; symbol?: string }) => ({
      symbol: "ETHUSDT",
      ...p,
    });
    const result = await reconcile({
      fills: [
        fill({ orderId: "a1", side: "buy", quantity: 2, price: 100, timestamp: 10 }),
        fill({ orderId: "a2", side: "sell", quantity: 2, price: 110, timestamp: 50 }),
      ],
      positionStops: [
        stop({ orderId: "before", side: "sell", stopPrice: 90, createdAt: 5 }), // before the trade opened
        stop({ orderId: "other", side: "sell", stopPrice: 91, createdAt: 15, symbol: "BTCUSDT" }),
        stop({ orderId: "wrongSide", side: "buy", stopPrice: 92, createdAt: 16 }),
        stop({ orderId: "added", side: "sell", stopPrice: 96, createdAt: 20 }),
        stop({ orderId: "later", side: "sell", stopPrice: 97, createdAt: 30 }),
      ],
    });

    const [rt] = result.roundTrips;
    expect(rt.stopLoss).toBe(96);
    expect(rt.initialRiskAmount).toBeCloseTo(8);
  });

  it("ignores an added stop that's already at breakeven or in profit", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "s1", side: "sell", quantity: 1, price: 100, timestamp: 10 }),
        fill({ orderId: "s2", side: "buy", quantity: 1, price: 95, timestamp: 50 }),
      ],
      positionStops: [{ orderId: "trail", symbol: "ETHUSDT", side: "buy", stopPrice: 99, createdAt: 20 }],
    });

    expect(result.roundTrips[0].stopLoss).toBeNull();
  });

  it("prefers the entry order's own stop over a stop order on the position", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "b1", side: "buy", quantity: 1, price: 100, timestamp: 10 }),
        fill({ orderId: "b2", side: "sell", quantity: 1, price: 110, timestamp: 50 }),
      ],
      stopLosses: { b1: 94 },
      positionStops: [{ orderId: "moved", symbol: "ETHUSDT", side: "sell", stopPrice: 98, createdAt: 11 }],
    });

    expect(result.roundTrips[0].stopLoss).toBe(94);
  });

  it("falls back to fill prices and fees when an order has no ledger row", async () => {
    const result = await reconcile({
      fills: [
        fill({ orderId: "n1", side: "buy", quantity: 2, price: 100, timestamp: 1, feeAmount: 0.2 }),
        fill({ orderId: "n2", side: "sell", quantity: 2, price: 105, timestamp: 2, feeAmount: 0.2 }),
      ],
    });

    const [rt] = result.roundTrips;
    expect(rt.positionId).toBe("book:ETHUSDT:USDT");
    expect(rt.grossPnl).toBeCloseTo(10);
    expect(rt.fees).toBeCloseTo(0.4);
    expect(rt.netPnl).toBeCloseTo(9.6);
  });

  it("surfaces ledger rows with no matching fill as unattributed instead of dropping them", async () => {
    const result = await reconcile({
      ledger: [orderRow({ parentId: "ghost", amount: 4, feeAmount: 0.5, createdAt: 1 })],
    });

    expect(result.roundTrips).toHaveLength(0);
    expect(result.unattributed).toMatchObject({ grossPnl: 4, fees: 0.5 });
    expect(result.ledger[0].attribution).toBe("unattributed");
  });
});
