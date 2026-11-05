"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { Plus, CheckCircle, AlertTriangle, Menu } from "lucide-react";
import Sidebar from "@/components/trading-journal/Sidebar";
import TradeFormModal from "@/components/trading-journal/TradeFormModal";
import TradeNotesDrawer from "@/components/trading-journal/TradeNotesDrawer";
import TraderLoader from "@/components/trading-journal/TraderLoader";
import { DashboardProvider, useDashboard } from "@/components/trading-journal/DashboardContext";
import QueryProvider from "@/components/layout/QueryProvider";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Where your P&L comes from, and where it leaks." },
  "/trades": { title: "Journal", subtitle: "Every closed trade, with its notes, tags and checklist." },
  "/review": { title: "Trade review", subtitle: "An honest look at your trades: what's losing you money and what to change." },
  "/strategies": { title: "Strategies", subtitle: "Build and version rule-based strategies." },
  "/backtest": { title: "Backtests", subtitle: "Run a strategy against historical candles." },
  "/insights": { title: "Backtest insights", subtitle: "Compare every backtest run side by side." },
  "/signals": { title: "Signals", subtitle: "Live signals from the strategies that have been making money on gold, silver, BTC and ETH." },
  "/markets": { title: "Markets", subtitle: "Live bias, zones, volatility and upcoming events for crypto and commodities." },
  "/guides": { title: "Guides", subtitle: "Step-by-step playbooks for trading each strategy by hand." },
  "/risk": { title: "Position size", subtitle: "Size a trade from your stop, lot size and costs." },
  "/import": { title: "Sync", subtitle: "Pull closed trades, fees and funding from CoinDCX." },
  "/settings": { title: "Settings", subtitle: "Account size, loss limits and dashboard preferences." },
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
      <div className="flex h-screen w-full items-center justify-center bg-ink">
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
      <div className="flex min-h-screen w-full items-center justify-center bg-ink px-4 text-paper">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em]">AuraJournal</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fog">
            See what your trading actually earns once fees and funding are taken out.
          </p>
          <button
            onClick={() => signIn("google")}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-md bg-paper px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
          >
            <i className="fab fa-google" aria-hidden="true"></i>
            Sign in with Google
          </button>
          <p className="mt-4 text-xs text-mist">Your trades are stored privately under your account.</p>
        </div>
      </div>
    );
  }

  // Nested pages (e.g. /guides/smc) use their section's title.
  const section = Object.keys(PAGE_META)
    .filter((p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const meta = PAGE_META[pathname] ?? (section ? PAGE_META[section] : PAGE_META["/"]);

  return (
    <div className="flex min-h-screen w-full bg-ink text-paper">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/80 md:hidden"
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
      <div className="fixed left-0 right-0 top-0 z-20 flex items-center gap-3 border-b border-rule bg-ink px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-md p-1 text-fog hover:text-paper"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <span className="font-display text-base font-bold tracking-[-0.02em]">{meta.title}</span>
      </div>

      <main className="w-full min-w-0 flex-grow px-4 pb-16 pt-20 sm:px-6 md:pl-[17rem] md:pr-10 md:pt-10">
        <div className="mx-auto max-w-[1320px]">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.03em] text-paper">
                {meta.title}
              </h1>
              <p className="mt-1 text-[15px] text-fog">{meta.subtitle}</p>
            </div>
            <button
              className="flex items-center justify-center gap-2 rounded-md border border-rule bg-deck px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-deck-2"
              onClick={() => openTradeForm(null)}
            >
              <Plus size={16} /> Log a trade
            </button>
          </header>

          {children}
        </div>
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

      <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6" aria-live="polite">
        {notifications.map(n => (
          <div
            key={n.id}
            className="flex items-center gap-3 rounded-md border border-rule bg-deck-2 px-4 py-3 text-sm text-paper shadow-lg shadow-black/30 sm:max-w-sm"
          >
            {n.type === "success" ? (
              <CheckCircle size={16} className="shrink-0 text-gain-ink" />
            ) : (
              <AlertTriangle size={16} className="shrink-0 text-loss-ink" />
            )}
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
