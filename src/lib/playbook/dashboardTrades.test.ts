import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
import type { PlaybookTrade } from "@prisma/client";
import { grossOf, pnlBreakdown } from "@/lib/journal/metrics";
import { isPlaybookRow, playbookToDashboardTrade } from "./dashboardTrades";

const row = (over: Partial<PlaybookTrade> = {}): PlaybookTrade => ({
  id: "abc", userId: "u", accountId: "flex-10k", setupId: "ema833-zones:NAS100:5m", symbol: "NAS100", side: "SHORT", grade: "A", status: "CLOSED",
  entryTime: new Date("2026-11-12T14:00:00Z"), entryPrice: 21000, stopLoss: 21020, takeProfit: 20960, quantity: 1.25, lots: 1.25, riskAmount: 25,
  rulesFollowed: true, overrideReason: "", exitTime: new Date("2026-11-12T15:10:00Z"), exitPrice: 20960, pnl: 48.5, commission: -1.5, swap: 0,
  rMultiple: 1.94, exitReason: "target", mistakes: [], notes: "", createdAt: new Date(), updatedAt: new Date(),
  ...over,
} as PlaybookTrade);

describe("playbookToDashboardTrade", () => {
  it("maps a closed Playbook trade onto the dashboard's money vocabulary", () => {
    const t = playbookToDashboardTrade(row())!;
    expect(t).toMatchObject({ id: "playbook:abc", time: "2026-11-12T15:10:00.000Z", openedAt: "2026-11-12T14:00:00.000Z", side: "SHORT", fees: 1.5, funding: 0, initialRiskAmount: 25, exitType: "tpsl", playbookAccountId: "flex-10k" });
    expect(grossOf(t)).toBeCloseTo(50);
    expect(pnlBreakdown([t])).toMatchObject({ gross: 50, fees: 1.5, net: 48.5 });
    expect(isPlaybookRow(t.id)).toBe(true);
  });

  it("skips open trades and marks hand closes as manual", () => {
    expect(playbookToDashboardTrade(row({ status: "OPEN", pnl: null, exitTime: null }))).toBeNull();
    expect(playbookToDashboardTrade(row({ exitReason: "manual", commission: null, swap: null }))).toMatchObject({ exitType: "manual", fees: null, grossPnl: 48.5 });
  });
});
