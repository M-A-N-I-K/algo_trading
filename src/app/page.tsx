"use client";

import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { Plus, CheckCircle, AlertTriangle, Sparkles } from "lucide-react";
import Sidebar from "@/components/trading-journal/Sidebar";
import KPICards from "@/components/trading-journal/KPICards";
import AnalyticsCharts from "@/components/trading-journal/AnalyticsCharts";
import TradesTable from "@/components/trading-journal/TradesTable";
import TradeFormModal from "@/components/trading-journal/TradeFormModal";
import TradeNotesDrawer from "@/components/trading-journal/TradeNotesDrawer";
import CSVImporter from "@/components/trading-journal/CSVImporter";
import BacktestTab from "@/components/trading-journal/BacktestTab";
import TraderLoader from "@/components/trading-journal/TraderLoader";

interface Trade {
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

interface Notification {
  id: string;
  message: string;
  type: "success" | "error";
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  
  // Tabs State
  const [activeTab, setActiveTab] = useState<"dashboard" | "trades" | "backtest" | "import">("dashboard");
  
  // Data State
  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  
  // Filter States
  const [filterSymbol, setFilterSymbol] = useState("ALL");
  const [filterStrategy, setFilterStrategy] = useState("ALL");
  const [filterOutcome, setFilterOutcome] = useState("ALL");
  
  // Modal / Drawer States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [formTrade, setFormTrade] = useState<Trade | null>(null);
  const [notesTrade, setNotesTrade] = useState<Trade | null>(null);
  
  // Notifications State
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load Data when authenticated
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
        
        // Extract unique symbols for filtering
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

  // Session loading screen
  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <TraderLoader 
          message="Syncing Authentications" 
          subMessages={[
            "Checking local session keys...",
            "Decrypting browser states...",
            "Connecting securely to servers..."
          ]} 
        />
      </div>
    );
  }

  // Unauthenticated Sign-in screen
  if (status === "unauthenticated") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 font-sans antialiased text-slate-200 relative overflow-hidden">
        {/* Background gradients */}
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

  // KPI Calculations
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRr = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  
  const chronTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const startBal = chronTrades.length > 0 ? chronTrades[0].balanceBefore || 100000 : 100000;
  const growthPct = startBal > 0 ? (netPnl / startBal) * 100 : 0;

  // Filter Action logic
  const filteredTrades = trades.filter(t => {
    const matchSym = filterSymbol === "ALL" || t.symbol === filterSymbol;
    const matchStrat = filterStrategy === "ALL" || t.strategy === filterStrategy;
    let matchOutcome = true;
    if (filterOutcome === "WIN") matchOutcome = t.pnl > 0;
    if (filterOutcome === "LOSS") matchOutcome = t.pnl <= 0;
    return matchSym && matchStrat && matchOutcome;
  });

  // Save Trade handler
  const handleSaveTrade = async (body: any) => {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        addNotification(body.id ? "Trade updated!" : "Trade successfully logged!", "success");
        setIsModalOpen(false);
        setFormTrade(null);
        loadTrades();
      } else {
        addNotification("Failed to save trade entry.", "error");
      }
    } catch (e: any) {
      addNotification("Error: " + e.message, "error");
    }
  };

  // Delete Trade handler
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

  // Save Notes handler
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
        setIsDrawerOpen(false);
        setNotesTrade(null);
        loadTrades();
      } else {
        addNotification("Failed to update notes.", "error");
      }
    } catch (e: any) {
      addNotification("Error updating notes: " + e.message, "error");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-950 font-sans antialiased text-slate-200">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={session?.user || null}
        onLogout={() => signOut()}
      />

      {/* Main Content Area */}
      <main className="flex-grow pl-72 pr-10 py-10 min-w-0 w-[calc(100%-16rem)]">
        
        {/* Top Header */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="font-Outfit text-3xl font-extrabold text-white tracking-tight">
              {activeTab === "dashboard" && "Analytics Dashboard"}
              {activeTab === "trades" && "Trade Log"}
              {activeTab === "backtest" && "Strategy Backtesting"}
              {activeTab === "import" && "Bulk Import"}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {activeTab === "dashboard" && "Real-time performance metrics and trade distributions."}
              {activeTab === "trades" && "Audit and inspect your complete historical execution logs."}
              {activeTab === "backtest" && "Run simulations to test technical models against historical market candle datasets."}
              {activeTab === "import" && "Bulk upload your CSV execution lists to merge setups."}
            </p>
          </div>
          <div>
            <button 
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 duration-300 cursor-pointer"
              onClick={() => { setFormTrade(null); setIsModalOpen(true); }}
            >
              <Plus size={18} /> New Trade
            </button>
          </div>
        </header>

        {/* Tab Components */}
        {activeTab === "dashboard" && (
          <div>
            <KPICards 
              netPnl={netPnl}
              growthPct={growthPct}
              winRate={winRate}
              winsCount={wins.length}
              lossesCount={losses.length}
              profitFactor={profitFactor}
              avgRr={avgRr}
              avgWin={avgWin}
              avgLoss={avgLoss}
            />

            <AnalyticsCharts trades={trades} />

            {/* Recent Activity Table */}
            <div className="glass border-slate-800 p-6 rounded-2xl mb-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-Outfit text-lg font-bold text-white">Recent Activity</h3>
                <button 
                  className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  onClick={() => setActiveTab("trades")}
                >
                  View Log
                </button>
              </div>
              <TradesTable 
                filteredTrades={trades.slice(0, 5)}
                symbols={symbols}
                onEdit={(t) => { setFormTrade(t); setIsModalOpen(true); }}
                onDelete={handleDeleteTrade}
                onInspect={(t) => { setNotesTrade(t); setIsDrawerOpen(true); }}
                isFullLog={false}
              />
            </div>
          </div>
        )}

        {activeTab === "trades" && (
          <TradesTable 
            filteredTrades={filteredTrades}
            symbols={symbols}
            filterSymbol={filterSymbol}
            setFilterSymbol={setFilterSymbol}
            filterStrategy={filterStrategy}
            setFilterStrategy={setFilterStrategy}
            filterOutcome={filterOutcome}
            setFilterOutcome={setFilterOutcome}
            onEdit={(t) => { setFormTrade(t); setIsModalOpen(true); }}
            onDelete={handleDeleteTrade}
            onInspect={(t) => { setNotesTrade(t); setIsDrawerOpen(true); }}
            isFullLog={true}
          />
        )}

        {activeTab === "import" && (
          <CSVImporter 
            onImportComplete={() => loadTrades()}
            addNotification={addNotification}
          />
        )}

        {activeTab === "backtest" && (
          <BacktestTab addNotification={addNotification} />
        )}

      </main>

      {/* Edit/Add Modal dialog form */}
      <TradeFormModal 
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setFormTrade(null); }}
        activeTrade={formTrade}
        onSave={handleSaveTrade}
      />

      {/* Note view/edit sheet drawer */}
      <TradeNotesDrawer 
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setNotesTrade(null); }}
        selectedTrade={notesTrade}
        onSaveNotes={handleSaveNotes}
      />

      {/* Notifications list toasts */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-3">
        {notifications.map(n => (
          <div key={n.id} className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border font-semibold text-sm shadow-xl animate-fade-in ${
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
