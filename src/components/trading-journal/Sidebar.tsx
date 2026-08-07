import { Sparkles, LineChart, ListTodo, Import, FlaskConical } from "lucide-react";

interface SidebarProps {
  activeTab: "dashboard" | "trades" | "backtest" | "import";
  setActiveTab: (tab: "dashboard" | "trades" | "backtest" | "import") => void;
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  return (
    <aside className="w-64 bg-slate-950/90 border-r border-slate-900 flex flex-col p-6 backdrop-blur-xl fixed left-0 top-0 h-screen z-10">
      <div className="flex items-center gap-3 mb-10 px-2">
        <Sparkles className="text-violet-500 logo-icon animate-pulse" size={24} />
        <span className="brand-text font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-Outfit">
          AuraJournal
        </span>
      </div>
      
      <nav className="flex flex-col gap-1.5 flex-grow">
        <button 
          className={`flex items-center gap-3.5 px-4 py-3 text-sm text-slate-400 rounded-xl font-medium transition-all cursor-pointer border border-transparent text-left hover:text-white hover:bg-slate-900/50 ${activeTab === "dashboard" ? "bg-violet-500/10 border-violet-500/20 text-violet-400 font-semibold shadow-[0_4px_20px_rgba(124,77,255,0.06)]" : ""}`} 
          onClick={() => setActiveTab("dashboard")}
        >
          <LineChart size={16} /> Dashboard
        </button>
        <button 
          className={`flex items-center gap-3.5 px-4 py-3 text-sm text-slate-400 rounded-xl font-medium transition-all cursor-pointer border border-transparent text-left hover:text-white hover:bg-slate-900/50 ${activeTab === "trades" ? "bg-violet-500/10 border-violet-500/20 text-violet-400 font-semibold shadow-[0_4px_20px_rgba(124,77,255,0.06)]" : ""}`} 
          onClick={() => setActiveTab("trades")}
        >
          <ListTodo size={16} /> Trade Log
        </button>
        <button 
          className={`flex items-center gap-3.5 px-4 py-3 text-sm text-slate-400 rounded-xl font-medium transition-all cursor-pointer border border-transparent text-left hover:text-white hover:bg-slate-900/50 ${activeTab === "backtest" ? "bg-violet-500/10 border-violet-500/20 text-violet-400 font-semibold shadow-[0_4px_20px_rgba(124,77,255,0.06)]" : ""}`} 
          onClick={() => setActiveTab("backtest")}
        >
          <FlaskConical size={16} /> Backtesting
        </button>
        <button 
          className={`flex items-center gap-3.5 px-4 py-3 text-sm text-slate-400 rounded-xl font-medium transition-all cursor-pointer border border-transparent text-left hover:text-white hover:bg-slate-900/50 ${activeTab === "import" ? "bg-violet-500/10 border-violet-500/20 text-violet-400 font-semibold shadow-[0_4px_20px_rgba(124,77,255,0.06)]" : ""}`} 
          onClick={() => setActiveTab("import")}
        >
          <ImportIcon size={16} /> Bulk Import
        </button>
      </nav>
      
      <div className="mt-auto border-t border-slate-900 pt-6 flex flex-col gap-4">
        {user && (
          <div className="flex items-center gap-3">
            {user.image ? (
              <img 
                src={user.image} 
                alt={user.name || "User Avatar"} 
                className="w-8 h-8 rounded-full border border-slate-800" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-600/20 text-violet-400 border border-violet-500/20 flex items-center justify-center font-bold text-xs uppercase">
                {user.name ? user.name.slice(0, 2) : "UR"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.name || "Trader"}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email || ""}</p>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            Synced
          </div>
          <button 
            className="text-[11px] font-semibold text-rose-500 hover:text-rose-400 transition-colors"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}

// Capitalized component alias for dynamic Import icon
function ImportIcon({ size }: { size: number }) {
  return <Import size={size} />;
}
