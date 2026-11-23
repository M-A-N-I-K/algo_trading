import { describe, expect, it } from "vitest";
import type { Mt5Position } from "@/lib/mt5/report";
import { planSync, syncedFields, type LoggedTrade } from "./mt5Sync";

const T = Date.UTC(2026, 10, 17, 8, 0, 0);
const pos = (o: Partial<Mt5Position> = {}): Mt5Position => ({
  positionId: "100", symbol: "XAUUSD", side: "LONG", volume: 0.1, status: "CLOSED", openTime: new Date(T), openPrice: 4000, stopLoss: 3990, takeProfit: 4030,
  closeTime: new Date(T + 3_600_000), closePrice: 4015, commission: -0.6, swap: -1, profit: 15, netPnl: 13.4, exitReason: "manual", ...o,
});
const logged = (o: Partial<LoggedTrade> = {}): LoggedTrade => ({ id: "t1", symbol: "XAUUSDT", side: "LONG", entryTime: T + 40_000, lots: 0.1, mt5Login: null, mt5PositionId: null, ...o });

describe("planSync", () => {
  it("links a trade logged by hand within a few minutes, and creates the rest", () => {
    const steps = planSync("1", [pos(), pos({ positionId: "101", openTime: new Date(T + 3_600_000) })], [logged()], []);
    expect(steps.map((s) => s.kind)).toEqual(["link", "create"]);
    expect(steps[0]).toMatchObject({ tradeId: "t1", symbol: "XAUUSDT" });
  });

  it("picks the logged trade with the same lots when several are close", () => {
    const steps = planSync("1", [pos({ volume: 1 })], [logged({ id: "small", lots: 0.01 }), logged({ id: "big", lots: 1, entryTime: T + 90_000 })], []);
    expect(steps[0]).toMatchObject({ kind: "link", tradeId: "big" });
  });

  it("updates a synced position, skips Trades-page duplicates and unknown markets", () => {
    const steps = planSync(
      "1",
      [pos(), pos({ positionId: "102", closeTime: new Date(T + 7_200_000) }), pos({ positionId: "103", symbol: "WEIRD" })],
      [logged({ id: "s", mt5Login: "1", mt5PositionId: "100" })],
      [{ symbol: "XAUUSD", side: "LONG", exitTime: T + 7_200_000 + 30_000, lots: 0.1 }],
    );
    expect(steps.map((s) => s.kind)).toEqual(["update", "skip", "skip"]);
  });

  it("doesn't link a different side or a trade far apart in time", () => {
    const steps = planSync("1", [pos()], [logged({ side: "SHORT" }), logged({ id: "late", entryTime: T + 10 * 60_000 })], []);
    expect(steps[0].kind).toBe("create");
  });
});

describe("syncedFields", () => {
  it("takes fills and P&L from MT5 and measures R from the stop", () => {
    const f = syncedFields(pos(), "XAUUSDT");
    // 0.1 lot of gold = 10 oz; $10 to the stop → $100 risk.
    expect(f).toMatchObject({ status: "CLOSED", entryPrice: 4000, stopLoss: 3990, lots: 0.1, quantity: 10, riskAmount: 100, pnl: 13.4, exitReason: "manual" });
    expect("rMultiple" in f && f.rMultiple).toBeCloseTo(0.134);
  });

  it("keeps your logged stop and exit reason, and calls a stop near entry breakeven", () => {
    const kept = syncedFields(pos({ stopLoss: 3999 }), "XAUUSDT", { entryPrice: 4001, stopLoss: 3980, takeProfit: null, riskAmount: 0, exitReason: "target" });
    expect(kept).toMatchObject({ stopLoss: 3980, riskAmount: 200, exitReason: "target" });
    const be = syncedFields(pos({ exitReason: "stop", netPnl: -1.2 }), "XAUUSDT");
    expect(be).toMatchObject({ exitReason: "breakeven" });
  });

  it("an open position carries its floating P&L; no stop means no risk", () => {
    const f = syncedFields(pos({ status: "OPEN", stopLoss: null, closeTime: null, closePrice: null, netPnl: 3.5 }), "XAUUSDT");
    expect(f).toMatchObject({ status: "OPEN", floatingPnl: 3.5, stopLoss: 4000, riskAmount: 0 });
  });
});
