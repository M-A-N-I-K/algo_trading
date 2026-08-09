"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";

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
}

export interface Notification {
  id: string;
  message: string;
  type: "success" | "error";
}

interface DashboardContextValue {
  trades: Trade[];
  symbols: string[];
  loadTrades: () => Promise<void>;

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
  handleSaveNotes: (notes: string) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formTrade, setFormTrade] = useState<Trade | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notesTrade, setNotesTrade] = useState<Trade | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      loadTrades();
    }
  }, [status]);

  const loadTrades = async () => {
    try {
      const res = await fetch("/api/trades");
      if (res.ok) {
        const data = await res.json();
        setTrades(data);

        const syms = Array.from(new Set(data.map((t: Trade) => t.symbol))) as string[];
        setSymbols(syms);
      }
    } catch (e: any) {
      addNotification("Failed to fetch trade entries: " + e.message, "error");
    }
  };

  const addNotification = (message: string, type: "success" | "error") => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const openTradeForm = (trade: Trade | null = null) => {
    setFormTrade(trade);
    setIsModalOpen(true);
  };

  const closeTradeForm = () => {
    setIsModalOpen(false);
    setFormTrade(null);
  };

  const handleSaveTrade = async (body: any) => {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        addNotification(body.id ? "Trade updated!" : "Trade successfully logged!", "success");
        closeTradeForm();
        loadTrades();
      } else {
        addNotification("Failed to save trade entry.", "error");
      }
    } catch (e: any) {
      addNotification("Error: " + e.message, "error");
    }
  };

  const handleDeleteTrade = async (tradeId: string) => {
    if (!confirm("Are you sure you want to delete this trade record?")) return;
    try {
      const res = await fetch(`/api/trades/${tradeId}`, { method: "DELETE" });
      if (res.ok) {
        addNotification("Trade record deleted.", "success");
        loadTrades();
      } else {
        addNotification("Failed to delete record.", "error");
      }
    } catch (e: any) {
      addNotification("Error: " + e.message, "error");
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

  const handleSaveNotes = async (notes: string) => {
    if (!notesTrade) return;
    try {
      const res = await fetch(`/api/trades/${notesTrade.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes })
      });
      if (res.ok) {
        addNotification("Strategy notes saved successfully!", "success");
        closeNotes();
        loadTrades();
      } else {
        addNotification("Failed to update notes.", "error");
      }
    } catch (e: any) {
      addNotification("Error updating notes: " + e.message, "error");
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        trades,
        symbols,
        loadTrades,
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
