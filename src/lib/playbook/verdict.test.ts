import { describe, expect, it } from "vitest";
import { PLAYBOOK_ACCOUNTS } from "./config";
import type { AccountStatus } from "./rules";
import { dayVerdict, tradesAcross, type AccountDay } from "./verdict";

const flex = PLAYBOOK_ACCOUNTS.find((a) => a.id === "flex-10k")!;
const pro = PLAYBOOK_ACCOUNTS.find((a) => a.id === "pro-5k")!;

const status = (o: Partial<AccountStatus>): AccountStatus => ({
  size: 10000, balance: 10000, priorPnl: 0, closedPnl: 0, floor: 8800, roomToFloor: 1200, today: "2026-11-20", todayPnl: 0, dayOpenBalance: 10000,
  ownDailyStop: 200, firmDailyLimit: 400, openCount: 0, openRisk: 0, worstCaseToday: 0, targetBalance: 11000, toTarget: 1000, lossesToday: 0,
  dailyStopHit: false, tradesToday: 0, profitLock: 100, profitLockHit: false, targetReached: false, ...o,
});

describe("dayVerdict", () => {
  // 20 Nov: Flex stopped after 2 losses (+$33 on the day), Pro clean after 1 trade.
  const day: AccountDay[] = [
    { account: flex, status: status({ todayPnl: 33.46, lossesToday: 2, dailyStopHit: true, tradesToday: 3 }) },
    { account: pro, status: status({ size: 5000, todayPnl: 33.1, tradesToday: 1, profitLock: 50 }) },
  ];

  it("reads the same whichever account is on screen", () => {
    // The tabs once judged the other account with the open account's rules and trade count.
    expect(dayVerdict(day[1], day)).toEqual(dayVerdict(day[1], [...day].reverse()));
    expect(dayVerdict(day[1], day).word).toBe("Careful");
    expect(dayVerdict(day[0], day).line).toBe("Stopped for today: 2 of 2 losses taken.");
  });

  it("uses each account's own loss limit", () => {
    const one = { account: pro, status: status({ lossesToday: 1, dailyStopHit: true }) };
    expect(dayVerdict(one, [one]).line).toBe("Stopped for today: 1 of 1 losses taken.");
  });

  it("counts the 6-trade cap across every account", () => {
    const busy: AccountDay[] = [
      { account: flex, status: status({ tradesToday: 4 }) },
      { account: pro, status: status({ tradesToday: 2 }) },
    ];
    expect(tradesAcross(busy)).toBe(6);
    expect(dayVerdict(busy[1], busy).word).toBe("Done");
  });

  it("puts the stop ahead of the profit lock, and the lock ahead of the cap", () => {
    expect(dayVerdict({ account: flex, status: status({ dailyStopHit: true, profitLockHit: true }) }, []).word).toBe("Stopped");
    expect(dayVerdict({ account: flex, status: status({ profitLockHit: true, todayPnl: 120, tradesToday: 6 }) }, []).word).toBe("Locked");
  });
});
