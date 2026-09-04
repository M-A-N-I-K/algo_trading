"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { Plus, CheckCircle, AlertTriangle, Sparkles, Menu } from "lucide-react";
import Sidebar from "@/components/trading-journal/Sidebar";
import TradeFormModal from "@/components/trading-journal/TradeFormModal";
import TradeNotesDrawer from "@/components/trading-journal/TradeNotesDrawer";
import TraderLoader from "@/components/trading-journal/TraderLoader";
import { DashboardProvider, useDashboard } from "@/components/trading-journal/DashboardContext";
import QueryProvider from "@/components/layout/QueryProvider";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Analytics Dashboard",
    subtitle: "Real-time performance metrics and trade distributions.",
  },
  "/market": {
    title: "Market Data",
    subtitle: "Browse historical and demo candlestick data across instruments and timeframes.",
  },
  "/strategies": {
    title: "Strategies",
    subtitle: "Build and version systematic trading strategies.",
  },
  "/risk": {
    title: "Risk Calculator",
    subtitle: "Per-trade position sizing with instrument lot size, tick size, and cost modeling.",
  },
  "/backtest": {
    title: "Backtests",
    subtitle: "Run simulations to test technical models against historical market candle datasets.",
  },
  "/trades": {
    title: "Trade Journal",
    subtitle: "Audit and inspect your complete historical execution logs.",
  },
  "/import": {
    title: "Bulk Import",
    subtitle: "Bulk upload your CSV execution lists to merge setups.",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Manage your account and application preferences.",
  },
};

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the mobile sidebar automatically whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const {
    notifications,
    isModalOpen,
    formTrade,
    openTradeForm,
    closeTradeForm,
    handleSaveTrade,
    isDrawerOpen,
    notesTrade,
    closeNotes,
    handleSaveNotes,
  } = useDashboard();

  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <TraderLoader
          message="Syncing Authentications"
          subMessages={[
            "Checking local session keys...",
            "Decrypting browser states...",
            "Connecting securely to servers...",
          ]}
        />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 font-sans antialiased text-slate-200 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(124,77,255,0.08)_0%,transparent_50%)]"></div>

        <div className="glass border border-slate-800 p-10 rounded-3xl w-full max-w-[440px] text-center flex flex-col items-center gap-6 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Sparkles className="text-white animate-pulse" size={32} />
          </div>

          <div>
            <h1 className="font-Outfit text-2xl font-bold tracking-tight text-white">AuraJournal</h1>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              Connect your trading log to securely track setups, strategies, and performance metrics.
            </p>
          </div>

          <button
            onClick={() => signIn("google")}
            className="w-full flex items-center justify-center gap-3.5 bg-white text-slate-950 hover:bg-slate-100 px-6 py-3.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-black/10 cursor-pointer"
          >
            <i className="fab fa-google text-base"></i>
            Sign in with Google
          </button>

          <div className="text-[11px] text-slate-500 font-medium border-t border-slate-900/50 w-full pt-4 mt-2">
            User isolated credentials and database storage.
          </div>
        </div>
      </div>
    );
  }

  const meta = PAGE_META[pathname] ?? PAGE_META["/"];

  return (
    <div className="flex min-h-screen w-full bg-slate-950 font-sans antialiased text-slate-200">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        user={session?.user || null}
        onLogout={() => signOut()}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-4 border-b border-slate-900 bg-slate-950/95 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="text-slate-300 hover:text-white transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="text-violet-500" size={18} />
          <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-Outfit">
            AuraJournal
          </span>
        </div>
        <div className="w-[22px]" />
      </div>

      <main className="flex-grow px-4 sm:px-6 md:pl-72 md:pr-10 pt-20 md:pt-10 pb-10 min-w-0 w-full md:w-[calc(100%-16rem)]">
        <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-8 md:mb-10">
          <div>
            <h1 className="font-Outfit text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {meta.title}
            </h1>
            <p className="text-slate-400 text-sm mt-1">{meta.subtitle}</p>
          </div>
          <div>
            <button
              className="w-full sm:w-auto justify-center bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 duration-300 cursor-pointer"
              onClick={() => openTradeForm(null)}
            >
              <Plus size={18} /> New Trade
            </button>
          </div>
        </header>

        {children}
      </main>

      <TradeFormModal
        isOpen={isModalOpen}
        onClose={closeTradeForm}
        activeTrade={formTrade}
        onSave={handleSaveTrade}
      />

      <TradeNotesDrawer
        isOpen={isDrawerOpen}
        onClose={closeNotes}
        selectedTrade={notesTrade}
        onSaveNotes={handleSaveNotes}
      />

      <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-8 sm:right-8 z-50 flex flex-col gap-3">
        {notifications.map(n => (
          <div key={n.id} className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border font-semibold text-sm shadow-xl animate-fade-in sm:max-w-sm ${
            n.type === "success"
              ? "bg-emerald-950/95 border-emerald-500/20 text-emerald-400"
              : "bg-rose-950/95 border-rose-500/20 text-rose-400"
          }`}>
            {n.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{n.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <DashboardProvider>
        <DashboardShell>{children}</DashboardShell>
      </DashboardProvider>
    </QueryProvider>
  );
}
