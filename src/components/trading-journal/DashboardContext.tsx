"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ChecklistItem {
  label: string;
  checked: boolean;
}

export interface Trade {
  id: string;
  time: string;
  balanceBefore: number;
  balanceAfter: number;
  pnl: number;
  currency: string;
  symbol: string;
  exchange: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  strategy: string;
  notes: string;
  stopLoss?: number | null;
  initialRiskAmount?: number | null;
  fees?: number | null;
  tags?: string[];
  checklist?: ChecklistItem[] | null;
}

export interface Notification {
  id: string;
  message: string;
  type: "success" | "error";
}

export interface DashboardSettings {
  startingBalance: number;
  dailyLossLimit: number | null;
  weeklyLossLimit: number | null;
  defaultStrategy: string;
  hiddenKpiCards: string[];
  coindcxBalance: number | null;
  coindcxBalanceSyncedAt: string | null;
}

interface DashboardContextValue {
  trades: Trade[];
  symbols: string[];
  loadTrades: () => Promise<void>;

  startingBalance: number;
  updateStartingBalance: (value: number) => Promise<boolean>;

  dailyLossLimit: number | null;
  weeklyLossLimit: number | null;
  updateLossLimits: (dailyLossLimit: number, weeklyLossLimit: number) => Promise<boolean>;

  defaultStrategy: string;
  updateDefaultStrategy: (value: string) => Promise<boolean>;

  hiddenKpiCards: string[];
  updateHiddenKpiCards: (value: string[]) => Promise<boolean>;

  coindcxBalance: number | null;
  coindcxBalanceSyncedAt: string | null;
  isSyncingBalance: boolean;
  syncCoindcxBalance: () => Promise<boolean>;

  notifications: Notification[];
  addNotification: (message: string, type: "success" | "error") => void;

  isModalOpen: boolean;
  formTrade: Trade | null;
  openTradeForm: (trade?: Trade | null) => void;
  closeTradeForm: () => void;
  handleSaveTrade: (body: any) => Promise<void>;
  handleDeleteTrade: (tradeId: string) => Promise<void>;

  isDrawerOpen: boolean;
  notesTrade: Trade | null;
  openNotes: (trade: Trade) => void;
  closeNotes: () => void;
  handleSaveNotes: (details: { notes: string; tags: string[]; checklist: ChecklistItem[] }) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const TRADES_QUERY_KEY = ["trades"];
const SETTINGS_QUERY_KEY = ["settings"];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} failed (${res.status})`);
  return res.json();
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const queryClient = useQueryClient();

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formTrade, setFormTrade] = useState<Trade | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notesTrade, setNotesTrade] = useState<Trade | null>(null);

  const addNotification = (message: string, type: "success" | "error") => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // React Query caches these in memory for the life of the tab (staleTime
  // set in QueryProvider) — navigating between dashboard pages, or
  // remounting a component that also reads these keys, reuses the cache
  // instead of re-fetching, and mutations below invalidate it explicitly.
  const tradesQuery = useQuery({
    queryKey: TRADES_QUERY_KEY,
    queryFn: () => fetchJson<Trade[]>("/api/trades"),
    enabled: status === "authenticated",
  });

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => fetchJson<DashboardSettings>("/api/settings"),
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (tradesQuery.isError) {
      addNotification("Failed to fetch trade entries: " + (tradesQuery.error as Error).message, "error");
    }
  }, [tradesQuery.isError]);

  useEffect(() => {
    if (settingsQuery.isError) {
      addNotification("Failed to fetch settings: " + (settingsQuery.error as Error).message, "error");
    }
  }, [settingsQuery.isError]);

  const trades = tradesQuery.data ?? [];
  const startingBalance = settingsQuery.data?.startingBalance ?? 100000;
  const dailyLossLimit = settingsQuery.data?.dailyLossLimit ?? null;
  const weeklyLossLimit = settingsQuery.data?.weeklyLossLimit ?? null;
  const defaultStrategy = settingsQuery.data?.defaultStrategy ?? "macd-200ema-sr";
  const hiddenKpiCards = settingsQuery.data?.hiddenKpiCards ?? [];
  const coindcxBalance = settingsQuery.data?.coindcxBalance ?? null;
  const coindcxBalanceSyncedAt = settingsQuery.data?.coindcxBalanceSyncedAt ?? null;
  const symbols = useMemo(() => Array.from(new Set(trades.map(t => t.symbol))), [trades]);

  const loadTrades = async () => {
    await queryClient.invalidateQueries({ queryKey: TRADES_QUERY_KEY });
  };

  const updateSettingsMutation = useMutation({
    mutationFn: (partial: Partial<DashboardSettings>) =>
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      }).then(res => {
        if (!res.ok) return res.json().then((body) => { throw new Error(body.error || "Failed to update settings."); });
        return res.json() as Promise<DashboardSettings>;
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, data);
    },
    onError: (e: Error) => addNotification(e.message, "error"),
  });

  const saveSetting = async (partial: Partial<DashboardSettings>, successMessage: string) => {
    try {
      await updateSettingsMutation.mutateAsync(partial);
      addNotification(successMessage, "success");
      return true;
    } catch {
      return false;
    }
  };

  const updateStartingBalance = (value: number) => saveSetting({ startingBalance: value }, "Starting balance updated!");
  const updateLossLimits = (daily: number, weekly: number) =>
    saveSetting({ dailyLossLimit: daily, weeklyLossLimit: weekly }, "Loss limits updated!");
  const updateDefaultStrategy = (value: string) => saveSetting({ defaultStrategy: value }, "Default strategy updated!");
  const updateHiddenKpiCards = (value: string[]) => saveSetting({ hiddenKpiCards: value }, "Dashboard cards updated!");

  const syncBalanceMutation = useMutation({
    mutationFn: () =>
      fetch("/api/coindcx/sync-balance", { method: "POST" }).then(res => {
        if (!res.ok) return res.json().then((body) => { throw new Error(body.error || "Failed to sync balance."); });
        return res.json() as Promise<{ coindcxBalance: number; coindcxBalanceSyncedAt: string }>;
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, (prev: DashboardSettings | undefined) =>
        prev ? { ...prev, ...data } : prev,
      );
      addNotification(`Balance synced: $${data.coindcxBalance.toFixed(2)}`, "success");
    },
    onError: (e: Error) => addNotification(e.message, "error"),
  });

  const syncCoindcxBalance = async () => {
    try {
      await syncBalanceMutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  };

  const openTradeForm = (trade: Trade | null = null) => {
    setFormTrade(trade);
    setIsModalOpen(true);
  };

  const closeTradeForm = () => {
    setIsModalOpen(false);
    setFormTrade(null);
  };

  const saveTradeMutation = useMutation({
    mutationFn: (body: any) =>
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(res => {
        if (!res.ok) throw new Error("Failed to save trade entry.");
        return res.json();
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TRADES_QUERY_KEY });
      addNotification(variables.id ? "Trade updated!" : "Trade successfully logged!", "success");
      closeTradeForm();
    },
    onError: (e: Error) => addNotification(e.message, "error"),
  });

  const handleSaveTrade = async (body: any) => {
    try {
      await saveTradeMutation.mutateAsync(body);
    } catch {
      // notified via onError
    }
  };

  const deleteTradeMutation = useMutation({
    mutationFn: (tradeId: string) =>
      fetch(`/api/trades/${tradeId}`, { method: "DELETE" }).then(res => {
        if (!res.ok) throw new Error("Failed to delete record.");
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADES_QUERY_KEY });
      addNotification("Trade record deleted.", "success");
    },
    onError: (e: Error) => addNotification(e.message, "error"),
  });

  const handleDeleteTrade = async (tradeId: string) => {
    if (!confirm("Are you sure you want to delete this trade record?")) return;
    try {
      await deleteTradeMutation.mutateAsync(tradeId);
    } catch {
      // notified via onError
    }
  };

  const openNotes = (trade: Trade) => {
    setNotesTrade(trade);
    setIsDrawerOpen(true);
  };

  const closeNotes = () => {
    setIsDrawerOpen(false);
    setNotesTrade(null);
  };

  const saveNotesMutation = useMutation({
    mutationFn: (vars: { tradeId: string; details: { notes: string; tags: string[]; checklist: ChecklistItem[] } }) =>
      fetch(`/api/trades/${vars.tradeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars.details),
      }).then(res => {
        if (!res.ok) throw new Error("Failed to update notes.");
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADES_QUERY_KEY });
      addNotification("Strategy notes saved successfully!", "success");
      closeNotes();
    },
    onError: (e: Error) => addNotification(e.message, "error"),
  });

  const handleSaveNotes = async (details: { notes: string; tags: string[]; checklist: ChecklistItem[] }) => {
    if (!notesTrade) return;
    try {
      await saveNotesMutation.mutateAsync({ tradeId: notesTrade.id, details });
    } catch {
      // notified via onError
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        trades,
        symbols,
        loadTrades,
        startingBalance,
        updateStartingBalance,
        dailyLossLimit,
        weeklyLossLimit,
        updateLossLimits,
        defaultStrategy,
        updateDefaultStrategy,
        hiddenKpiCards,
        updateHiddenKpiCards,
        coindcxBalance,
        coindcxBalanceSyncedAt,
        isSyncingBalance: syncBalanceMutation.isPending,
        syncCoindcxBalance,
        notifications,
        addNotification,
        isModalOpen,
        formTrade,
        openTradeForm,
        closeTradeForm,
        handleSaveTrade,
        handleDeleteTrade,
        isDrawerOpen,
        notesTrade,
        openNotes,
        closeNotes,
        handleSaveNotes,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within a DashboardProvider");
  return ctx;
}
