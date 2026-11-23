import { describe, expect, it } from "vitest";
import { firstDeposit, positionsFromDeals } from "./accountFiles";
import { dealFromApi, infoFromApi, positionFromApi, type ApiDeal } from "./metaapi";

const deals: ApiDeal[] = [
  { id: "1", type: "DEAL_TYPE_BALANCE", time: "2026-11-01T08:00:00.000Z", profit: 10000 },
  { id: "2", type: "DEAL_TYPE_BUY", entryType: "DEAL_ENTRY_IN", symbol: "XAUUSD", time: "2026-11-20T13:31:05.120Z", volume: 0.1, price: 2650.5, commission: -0.7, swap: 0, profit: 0, positionId: "900", reason: "DEAL_REASON_CLIENT", stopLoss: 2645.5, takeProfit: 2660.5 },
  { id: "3", type: "DEAL_TYPE_SELL", entryType: "DEAL_ENTRY_OUT", symbol: "XAUUSD", time: "2026-11-20T14:02:00.000Z", volume: 0.1, price: 2660.5, commission: -0.7, swap: 0, profit: 100, positionId: "900", reason: "DEAL_REASON_TP", stopLoss: 2645.5, takeProfit: 2660.5 },
];

describe("MetaApi mappers", () => {
  it("maps deals to the export's shape, in UTC", () => {
    const d = dealFromApi(deals[1])!;
    expect(d).toMatchObject({ ticket: "2", positionId: "900", type: "buy", entry: "in", symbol: "XAUUSD", volume: 0.1, price: 2650.5, stopLoss: 2645.5, takeProfit: 2660.5, commission: -0.7, reason: "client" });
    expect(d.time.toISOString()).toBe("2026-11-20T13:31:05.120Z");
    expect(dealFromApi(deals[0])).toMatchObject({ type: "balance", entry: "", positionId: "" });
    expect(dealFromApi({ id: "4", type: "DEAL_TYPE_COMMISSION_DAILY", time: "2026-11-20T00:00:00Z", profit: -1 })!.type).toBe("commission");
    expect(dealFromApi({ id: "5", type: "DEAL_TYPE_BUY", time: "nope", profit: 0 })).toBeNull();
  });

  it("builds closed positions the same way as the MT5 app's export", () => {
    const mapped = deals.map(dealFromApi).filter((d) => d !== null);
    const [p] = positionsFromDeals(mapped, []);
    expect(p).toMatchObject({ positionId: "900", side: "LONG", status: "CLOSED", openPrice: 2650.5, closePrice: 2660.5, stopLoss: 2645.5, takeProfit: 2660.5, commission: -1.4, profit: 100, netPnl: 98.6, exitReason: "target" });
    expect(firstDeposit(mapped)).toBe(10000);
  });

  it("maps open positions with only the unrealised P&L", () => {
    const p = positionFromApi({ id: "901", type: "POSITION_TYPE_SELL", symbol: "NAS100", time: "2026-11-21T15:00:00Z", openPrice: 21000, currentPrice: 20990, stopLoss: 21050, volume: 1, swap: -2, profit: 30, unrealizedProfit: 10 })!;
    expect(p).toMatchObject({ positionId: "901", side: "SHORT", openPrice: 21000, stopLoss: 21050, takeProfit: null, swap: -2, profit: 10, currentPrice: 20990 });
  });

  it("maps account info", () => {
    const i = infoFromApi({ login: 12345678, server: "Broker-Live", broker: "Broker Ltd", currency: "USD", balance: 10250.5, equity: 10260, type: "ACCOUNT_TRADE_MODE_DEMO" }, 1_700_000_000_000);
    expect(i).toEqual({ login: "12345678", server: "Broker-Live", company: "Broker Ltd", name: "", currency: "USD", mode: "demo", balance: 10250.5, equity: 10260, writtenAt: 1_700_000_000_000 });
  });
});
