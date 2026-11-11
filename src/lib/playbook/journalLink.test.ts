import { describe, expect, it } from "vitest";
import type { Trade } from "@prisma/client";
import { marketForSymbol } from "./config";
import { journalToEntry, linkedRisk, parsePlaybookAccountId } from "./journalLink";
import { accountStatus } from "./rules";
import { PLAYBOOK_ACCOUNTS } from "./config";

const trade = (over: Partial<Trade>): Trade => ({
  id: "t1", time: new Date(Date.UTC(2026, 10, 11, 15, 36)), balanceBefore: null, balanceAfter: null, pnl: -31.1, currency: "USD",
  symbol: "BTCUSD", exchange: "UNKNOWN", side: "SHORT", quantity: 0.05, entryPrice: 73374.39, exitPrice: 74090.28, strategy: "smc",
  notes: "", stopLoss: 74090.28, initialRiskAmount: null, fees: null, openedAt: null, grossPnl: null, funding: null, marginCurrency: null,
  netPnlNative: null, exitType: null, tags: [], checklist: null, externalId: null, playbookAccountId: "flex-10k", userId: "u", createdAt: new Date(),
  ...over,
});

describe("journal trades linked to a prop account", () => {
  it("finds the market however the symbol is typed", () => {
    expect(marketForSymbol("btcusd")?.symbol).toBe("BTCUSDT");
    expect(marketForSymbol("XAUUSD")?.symbol).toBe("XAUUSDT");
    expect(marketForSymbol("US100")?.platformSymbol).toBe("NDX100");
    expect(marketForSymbol("EUR/USD")?.symbol).toBe("EURUSD");
    expect(marketForSymbol("DOGEUSD")).toBeUndefined();
  });
  it("reads quantity as platform lots for risk", () => {
    // 0.1 lot of gold is 10 oz: a $10 stop risks $100.
    expect(linkedRisk("XAUUSD", 4000, 3990, 0.1)).toBeCloseTo(100);
    expect(linkedRisk("BTCUSD", 73374.39, 74090.28, 0.05)).toBeCloseTo(35.79, 2);
    expect(linkedRisk("BTCUSD", 100, null, 1)).toBeNull();
  });
  it("validates the account", () => {
    expect(parsePlaybookAccountId("")).toBeNull();
    expect(parsePlaybookAccountId("flex-10k")).toBe("flex-10k");
    expect(() => parsePlaybookAccountId("nope")).toThrow();
  });
  it("counts in the account's balance and today's P&L", () => {
    const e = journalToEntry(trade({}))!;
    expect(e).toMatchObject({ accountId: "flex-10k", setupId: "custom:BTCUSDT", status: "CLOSED", pnl: -31.1, rulesFollowed: false, source: "journal" });
    expect(e.rMultiple).toBeCloseTo(-31.1 / 35.79, 2);
    const account = { ...PLAYBOOK_ACCOUNTS[0], priorPnl: 0 };
    const s = accountStatus([e], Date.UTC(2026, 10, 11, 16), account);
    expect(s.balance).toBeCloseTo(account.size - 31.1);
    expect(s.todayPnl).toBeCloseTo(-31.1);
    expect(journalToEntry(trade({ playbookAccountId: null }))).toBeNull();
  });
});
