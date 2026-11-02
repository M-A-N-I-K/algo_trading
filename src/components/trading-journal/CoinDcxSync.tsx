"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Callout, Panel, Stat, money, toneClass } from "@/components/kit";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

interface SyncResult {
  fetchedFillCount: number;
  ledgerRowCount: number;
  roundTripCount: number;
  importedCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedLegacyCount: number;
  keptLegacyCount: number;
  openFunding: number;
  unattributed: { grossPnl: number; fees: number; funding: number };
}

interface CoinDcxSyncProps {
  onImportComplete: (count: number) => void;
  addNotification: (message: string, type: "success" | "error") => void;
}

const STEPS = ["Reading fills and the position ledger", "Grouping fills into round trips", "Saving to your journal"];

export default function CoinDcxSync({ onImportComplete, addNotification }: CoinDcxSyncProps) {
  const { coindcxBalance, coindcxBalanceSyncedAt, isSyncingBalance, syncCoindcxBalance } = useDashboard();
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The sync request failed.");
        addNotification("CoinDCX sync failed.", "error");
        return;
      }
      setResult(data as SyncResult);
      setLastRun(new Date());
      addNotification(`Synced: ${data.importedCount} new, ${data.updatedCount} refreshed.`, "success");
      onImportComplete(data.importedCount);
    } catch (err) {
      setError(`Could not reach the server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const unattributedTotal = result ? result.unattributed.grossPnl - result.unattributed.fees + result.unattributed.funding : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title="Futures trades"
        note="Reads your CoinDCX futures fills and the position ledger, groups them into round trips, and splits each into price P&L, fees and funding. Safe to run again: your notes, tags and checklists are never overwritten."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw size={15} className={isSyncing ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
            {isSyncing ? "Syncing…" : "Sync trades"}
          </Button>
          {lastRun && !isSyncing && (
            <span className="text-sm text-fog">Last run at {lastRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>

        {isSyncing && (
          <ol className="mt-5 space-y-1.5 text-sm text-fog" aria-live="polite">
            {STEPS.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-mist" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ol>
        )}

        {error && (
          <Callout tone="critical" title="Sync failed" className="mt-5">
            {error}
          </Callout>
        )}

        {result && !isSyncing && (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-5 sm:grid-cols-4">
              <Stat label="Round trips" value={result.roundTripCount} note={`From ${result.fetchedFillCount} fills`} />
              <Stat label="New" value={result.importedCount} />
              <Stat label="Refreshed" value={result.updatedCount} note="Exchange figures changed" />
              <Stat label="Unchanged" value={result.unchangedCount} />
            </div>

            {(result.removedLegacyCount > 0 || result.keptLegacyCount > 0) && (
              <Callout tone="info" title="Older per-fill records">
                {result.removedLegacyCount > 0 && `${result.removedLegacyCount} replaced by round trips. `}
                {result.keptLegacyCount > 0 &&
                  `${result.keptLegacyCount} kept because they have notes, tags or a checklist. Review them in the journal and delete them when you have moved the notes over.`}
              </Callout>
            )}

            {Math.abs(result.openFunding) >= 0.005 && (
              <Callout tone="info" title="Funding on open positions">
                <span className={toneClass(result.openFunding)}>{money(result.openFunding)}</span> so far. It moves into the trade
                when the position closes.
              </Callout>
            )}

            {Math.abs(unattributedTotal) >= 0.005 && (
              <Callout tone="warning" title="Ledger amounts not tied to a trade">
                {money(unattributedTotal)} in total: price P&L {money(result.unattributed.grossPnl)}, fees{" "}
                {money(-result.unattributed.fees)}, funding {money(result.unattributed.funding)}. They are counted separately so your
                totals still match CoinDCX.
              </Callout>
            )}
          </div>
        )}
      </Panel>

      <Panel className="self-start" title="Futures balance" note="Used as the reference for automatic loss limits.">
        <Stat
          size="lg"
          label="USDT wallet"
          value={coindcxBalance != null ? money(coindcxBalance, { sign: false }) : "Not synced"}
          note={coindcxBalanceSyncedAt ? `Updated ${new Date(coindcxBalanceSyncedAt).toLocaleString()}` : undefined}
        />
        <Button className="mt-5" onClick={syncCoindcxBalance} disabled={isSyncingBalance}>
          <RefreshCw size={14} className={isSyncingBalance ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
          {isSyncingBalance ? "Updating…" : "Update balance"}
        </Button>
      </Panel>
    </div>
  );
}
