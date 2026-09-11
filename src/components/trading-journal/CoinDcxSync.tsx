import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import TraderLoader from "@/components/trading-journal/TraderLoader";

interface SyncStatus {
  type: "success" | "error" | null;
  message: string;
}

interface CoinDcxSyncProps {
  onImportComplete: (count: number) => void;
  addNotification: (message: string, type: "success" | "error") => void;
}

export default function CoinDcxSync({ onImportComplete, addNotification }: CoinDcxSyncProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ type: null, message: "" });

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus({ type: null, message: "" });

    try {
      const res = await fetch("/api/trades/sync", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setSyncStatus({
          type: "success",
          message: `Synced ${data.fetchedFillCount} fill(s), added ${data.importedCount} new trade record(s).`,
        });
        addNotification(`CoinDCX sync complete: ${data.importedCount} new trades.`, "success");
        onImportComplete(data.importedCount);
      } else {
        setSyncStatus({ type: "error", message: `Sync failed: ${data.error}` });
        addNotification(`CoinDCX sync failed: ${data.error}`, "error");
      }
    } catch (err: any) {
      setSyncStatus({ type: "error", message: `Network error during sync: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="glass border-slate-800 p-8 flex flex-col justify-between">
      <div>
        <h3 className="font-Outfit text-lg font-bold text-white mb-1.5">CoinDCX Auto-Sync</h3>
        <p className="text-slate-400 text-xs leading-relaxed mb-6">
          Pull your trade history directly from CoinDCX. Fills are matched FIFO per symbol
          into closed round-trip trades and merged into your journal — safe to run repeatedly,
          already-imported trades are skipped.
        </p>
      </div>

      <div className="border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center min-h-[220px] border-slate-800 bg-slate-900/10">
        {isSyncing ? (
          <TraderLoader
            message="Syncing CoinDCX"
            subMessages={[
              "Fetching trade history...",
              "Matching fills FIFO...",
              "Merging into your journal...",
            ]}
          />
        ) : (
          <>
            <RefreshCw className="text-violet-500 filter drop-shadow-[0_0_8px_rgba(124,77,255,0.4)]" size={44} />
            <button
              type="button"
              onClick={handleSync}
              className="text-slate-200 text-sm font-semibold px-5 py-2.5 rounded-xl border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 transition-all cursor-pointer"
            >
              Sync Now
            </button>
          </>
        )}
      </div>

      {syncStatus.type && (
        <div
          className={`mt-5 p-4 rounded-xl text-sm font-semibold border ${
            syncStatus.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-500 border-rose-500/20"
          }`}
        >
          {syncStatus.message}
        </div>
      )}
    </Card>
  );
}
