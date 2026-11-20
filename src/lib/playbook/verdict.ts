import { MAX_TRADES_PER_DAY, type PlaybookAccount } from "./config";
import type { AccountStatus } from "./rules";

export type VerdictTone = "gain" | "loss" | "fees";
export interface DayVerdict {
  word: "Clear" | "Careful" | "Full" | "Done" | "Locked" | "Stopped" | "Target";
  line: string;
  tone: VerdictTone;
}

export interface AccountDay {
  account: PlaybookAccount;
  status: AccountStatus;
}

const usd = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;

/** Trades entered today on every account: the 6-a-day cap is shared. */
export const tradesAcross = (all: readonly AccountDay[]) => all.reduce((n, a) => n + a.status.tradesToday, 0);

/**
 * Whether one account can take a trade now, worst reason first. Judged with
 * that account's own rules and the day's totals across every account, so it
 * reads the same whichever account is on screen.
 */
export function dayVerdict(me: AccountDay, all: readonly AccountDay[]): DayVerdict {
  const { account: a, status: s } = me;
  const k = a.rules;
  const dayTrades = tradesAcross(all);
  const stoppedElsewhere = all.filter((x) => x.account.id !== a.id && x.status.dailyStopHit).map((x) => x.account.shortName);
  if (s.targetReached) return { word: "Target", line: "Target reached. Close what's open and stop this phase.", tone: "gain" };
  if (s.dailyStopHit)
    return {
      word: "Stopped",
      line: s.lossesToday >= k.maxLossesPerDay ? `Stopped for today: ${s.lossesToday} of ${k.maxLossesPerDay} losses taken.` : `Stopped for today: down ${usd(s.todayPnl)}.`,
      tone: "loss",
    };
  if (s.profitLockHit) return { word: "Locked", line: `Done for today: up ${usd(s.todayPnl)}, past the ${usd(s.profitLock)} lock.`, tone: "gain" };
  if (dayTrades >= MAX_TRADES_PER_DAY) return { word: "Done", line: `Done for today: ${dayTrades} trades across both accounts.`, tone: "fees" };
  if (s.openCount >= k.maxOpen) return { word: "Full", line: `Every slot is in use (${s.openCount} of ${k.maxOpen}). Manage what's open.`, tone: "fees" };
  if (stoppedElsewhere.length) return { word: "Careful", line: `Clear, but ${stoppedElsewhere.join(" and ")} is stopped. Best setup only.`, tone: "fees" };
  return { word: "Clear", line: "Clear to trade.", tone: "gain" };
}
