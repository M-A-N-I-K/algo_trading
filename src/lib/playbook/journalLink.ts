import type { Trade } from "@prisma/client";
import { appError } from "@/lib/errors";
import { accountById, customSetupId, lotUnits, marketForSymbol, PLAYBOOK_ACCOUNTS } from "./config";
import { usdPerUnitMove, type JournalEntry } from "./rules";

// Trades logged on the Trades page can be linked to a prop account
// (Trade.playbookAccountId). The Playbook then counts them in that account's
// balance, daily loss and closed trades, read live from the journal so an
// edit or delete there shows up here too.

/** The account id from a request body: null to unlink, an error if unknown. */
export function parsePlaybookAccountId(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const account = accountById(String(v));
  if (!account) throw appError("INVALID_INPUT", `Unknown prop account. Use one of: ${PLAYBOOK_ACCOUNTS.map((a) => a.id).join(", ")}.`);
  return account.id;
}

/**
 * $ lost at the stop for `lots` platform lots, or null when the market or
 * its contract size isn't known. On a prop account the journal's quantity is
 * the platform's lots (0.1 lot of gold is 10 oz, not 0.1 oz).
 */
export function linkedRisk(symbol: string, entry: number, stop: number | null, lots: number): number | null {
  const m = marketForSymbol(symbol);
  if (!m || stop === null || !(lots > 0)) return null;
  const risk = Math.abs(entry - stop) * usdPerUnitMove(m.symbol, stop) * lots * lotUnits(m.symbol);
  return Number.isFinite(risk) && risk > 0 ? risk : null;
}

/** A linked journal trade as a closed Playbook entry. */
export function journalToEntry(t: Trade): JournalEntry | null {
  if (!t.playbookAccountId) return null;
  const m = marketForSymbol(t.symbol);
  const risk = linkedRisk(t.symbol, t.entryPrice, t.stopLoss, t.quantity) ?? t.initialRiskAmount ?? 0;
  return {
    id: `journal:${t.id}`,
    accountId: t.playbookAccountId,
    setupId: m ? customSetupId(m.symbol) : `journal:${t.symbol}`,
    symbol: m?.symbol ?? t.symbol,
    side: t.side === "SHORT" ? "SHORT" : "LONG",
    grade: null,
    status: "CLOSED",
    entryTime: (t.openedAt ?? t.time).getTime(),
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss ?? t.entryPrice,
    takeProfit: null,
    quantity: m ? t.quantity * lotUnits(m.symbol) : t.quantity,
    lots: t.quantity,
    riskAmount: risk,
    // Not checked against the playbook's rules when it was taken.
    rulesFollowed: false,
    overrideReason: "Logged on the Trades page",
    exitTime: t.time.getTime(),
    exitPrice: t.exitPrice,
    pnl: t.pnl,
    commission: null,
    swap: null,
    rMultiple: risk > 0 ? t.pnl / risk : null,
    exitReason: "manual",
    mistakes: [],
    notes: t.notes,
    source: "journal",
  };
}
