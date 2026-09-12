import { Wallet, CheckCircle, Scale, TrendingUp, Target, Award, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SymbolPnl {
  symbol: string;
  pnl: number;
}

interface KPICardsProps {
  netPnl: number;
  growthPct: number;
  winRate: number;
  winsCount: number;
  lossesCount: number;
  profitFactor: number;
  avgRr: number;
  avgWin: number;
  avgLoss: number;
  avgRMultiple?: number | null;
  rMultipleTradeCount?: number;
  bestSymbol?: SymbolPnl | null;
  worstSymbol?: SymbolPnl | null;
  totalFees?: number;
  feesTradeCount?: number;
}

export default function KPICards({
  netPnl,
  growthPct,
  winRate,
  winsCount,
  lossesCount,
  profitFactor,
  avgRr,
  avgWin,
  avgLoss,
  avgRMultiple,
  rMultipleTradeCount = 0,
  bestSymbol,
  worstSymbol,
  totalFees = 0,
  feesTradeCount = 0,
}: KPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
      
      {/* Net Profit Card */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Net Profit</span>
            <h3 className={`font-Outfit text-3xl font-bold mt-1.5 mb-1 ${netPnl >= 0 ? "text-emerald-400 [text-shadow:0_0_10px_rgba(16,185,129,0.15)]" : "text-rose-500 [text-shadow:0_0_10px_rgba(244,63,94,0.15)]"}`}>
              {netPnl >= 0 ? "+" : ""}${netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <span className="text-xs text-slate-400">{growthPct >= 0 ? "+" : ""}{growthPct.toFixed(2)}% Account growth</span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center pnl-bg text-violet-500 bg-violet-500/10">
            <Wallet size={20} />
          </div>
        </CardContent>
      </Card>

      {/* Win Rate Card */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Win Rate</span>
            <h3 className="font-Outfit text-3xl font-bold text-emerald-400 mt-1.5 mb-1">
              {winRate.toFixed(1)}%
            </h3>
            <span className="text-xs text-slate-400">{winsCount} Wins - {lossesCount} Losses</span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center win-bg text-emerald-400 bg-emerald-500/10">
            <CheckCircle size={20} />
          </div>
        </CardContent>
      </Card>

      {/* Profit Factor Card */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Profit Factor</span>
            <h3 className="font-Outfit text-3xl font-bold text-amber-400 mt-1.5 mb-1">
              {profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)}
            </h3>
            <span className="text-xs text-slate-400">Gross Profit / Gross Loss</span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center factor-bg text-amber-400 bg-amber-500/10">
            <Scale size={20} />
          </div>
        </CardContent>
      </Card>

      {/* Average R:R Card */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Average R:R</span>
            <h3 className="font-Outfit text-3xl font-bold text-indigo-400 mt-1.5 mb-1">
              {avgRr === Infinity ? "∞" : avgRr.toFixed(2)}
            </h3>
            <span className="text-xs text-slate-400">W: ${avgWin.toFixed(0)} / L: -${avgLoss.toFixed(0)}</span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center rr-bg text-indigo-400 bg-indigo-500/10">
            <TrendingUp size={20} />
          </div>
        </CardContent>
      </Card>

      {/* Avg R-Multiple Card (from journaled stop-loss / risk data) */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Avg R-Multiple</span>
            <h3 className={`font-Outfit text-3xl font-bold mt-1.5 mb-1 ${avgRMultiple == null ? "text-slate-500" : avgRMultiple >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
              {avgRMultiple == null ? "—" : `${avgRMultiple >= 0 ? "+" : ""}${avgRMultiple.toFixed(2)}R`}
            </h3>
            <span className="text-xs text-slate-400">
              {rMultipleTradeCount > 0 ? `From ${rMultipleTradeCount} trades with a stop-loss logged` : "Log a stop-loss to enable"}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-fuchsia-500/10 text-fuchsia-400">
            <Target size={20} />
          </div>
        </CardContent>
      </Card>

      {/* Best/Worst Symbol Card */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Best Symbol</span>
            <h3 className="font-Outfit text-3xl font-bold text-emerald-400 mt-1.5 mb-1">
              {bestSymbol ? bestSymbol.symbol : "—"}
            </h3>
            <span className="text-xs text-slate-400">
              {bestSymbol ? `+$${bestSymbol.pnl.toFixed(2)}` : "No trades yet"}
              {worstSymbol && worstSymbol.symbol !== bestSymbol?.symbol && (
                <>
                  {" "}
                  &middot; Worst: {worstSymbol.symbol}{" "}
                  <span className="text-rose-500">
                    {worstSymbol.pnl >= 0 ? "+" : ""}${worstSymbol.pnl.toFixed(2)}
                  </span>
                </>
              )}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-400">
            <Award size={20} />
          </div>
        </CardContent>
      </Card>

      {/* Total Fees Paid Card (exchange trading fees, already netted into pnl) */}
      <Card className="glass hover:translate-y-[-5px] hover:border-violet-500/25 transition-all duration-300">
        <CardContent className="flex justify-between items-center p-6">
          <div>
            <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Fees Paid</span>
            <h3 className="font-Outfit text-3xl font-bold text-rose-500 mt-1.5 mb-1">
              -${totalFees.toFixed(2)}
            </h3>
            <span className="text-xs text-slate-400">
              {feesTradeCount > 0 ? `Across ${feesTradeCount} trades with fee data` : "No fee data yet"}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-500/10 text-orange-400">
            <Receipt size={20} />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
