import { Trash2, Edit3, Filter } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

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

interface TradesTableProps {
  filteredTrades: Trade[];
  symbols: string[];
  filterSymbol?: string;
  setFilterSymbol?: (s: string) => void;
  filterStrategy?: string;
  setFilterStrategy?: (s: string) => void;
  filterOutcome?: string;
  setFilterOutcome?: (o: string) => void;
  onEdit: (t: Trade) => void;
  onDelete: (id: string) => void;
  onInspect: (t: Trade) => void;
  isFullLog?: boolean;
}

export default function TradesTable({
  filteredTrades,
  symbols,
  filterSymbol = "ALL",
  setFilterSymbol,
  filterStrategy = "ALL",
  setFilterStrategy,
  filterOutcome = "ALL",
  setFilterOutcome,
  onEdit,
  onDelete,
  onInspect,
  isFullLog = false,
}: TradesTableProps) {

  const handleResetFilters = () => {
    if (setFilterSymbol) setFilterSymbol("ALL");
    if (setFilterStrategy) setFilterStrategy("ALL");
    if (setFilterOutcome) setFilterOutcome("ALL");
  };

  return (
    <div>
      {/* Optional Filters Bar */}
      {isFullLog && setFilterSymbol && setFilterStrategy && setFilterOutcome && (
        <Card className="glass mb-6 border-slate-800">
          <CardContent className="flex flex-col md:flex-row gap-5 p-6">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Symbol</label>
              <select 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
                value={filterSymbol} 
                onChange={(e) => setFilterSymbol(e.target.value)}
              >
                <option value="ALL">All Symbols</option>
                {symbols.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Strategy</label>
              <select 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
                value={filterStrategy} 
                onChange={(e) => setFilterStrategy(e.target.value)}
              >
                <option value="ALL">All Strategies</option>
                <option value="macd-200ema-sr">MACD + 200 EMA + S/R</option>
                <option value="supply-demand">Supply & Demand Zones</option>
                <option value="ema-rsi-bollinger">EMA + RSI + Bollinger</option>
                <option value="macd-sma-atr">MACD + SMA + ATR</option>
                <option value="trend-following">Dual EMA Trend Follow</option>
              </select>
            </div>

            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Outcome</label>
              <select 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
                value={filterOutcome} 
                onChange={(e) => setFilterOutcome(e.target.value)}
              >
                <option value="ALL">All Outcomes</option>
                <option value="WIN">Winning Trades</option>
                <option value="LOSS">Losing Trades</option>
              </select>
            </div>

            <button 
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all self-end"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          </CardContent>
        </Card>
      )}

      {/* Table Data */}
      <Card className="glass border-slate-800 overflow-hidden">
        <div className={`overflow-x-auto w-full ${isFullLog ? "max-h-[600px] overflow-y-auto" : ""}`}>
          <Table className="w-full">
            <TableHeader className="bg-slate-900/50">
              <TableRow className="hover:bg-transparent border-slate-800">
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Time</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Symbol</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Side</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Quantity</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Entry Price</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Exit Price</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Realized PnL</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Strategy</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrades.map(t => (
                <TableRow 
                  key={t.id} 
                  className="hover:bg-slate-800/10 cursor-pointer border-slate-800/40 transition-colors"
                  onClick={() => onInspect(t)}
                >
                  <TableCell className="text-slate-300 font-medium py-4 text-xs">{t.time}</TableCell>
                  <TableCell className="text-white font-bold py-4 text-sm">{t.symbol}</TableCell>
                  <TableCell className="py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold border ${t.side === 'LONG' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                      {t.side}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{t.quantity}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">${t.entryPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">${t.exitPrice.toFixed(2)}</TableCell>
                  <TableCell className={`py-4 font-bold text-sm ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-[11px] bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md text-slate-400">
                      {t.strategy}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => onEdit(t)} 
                        className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 p-2 rounded-xl transition-all"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        onClick={() => onDelete(t.id)} 
                        className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-rose-500 p-2 rounded-xl transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredTrades.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500 font-medium py-12">
                    No matching trade records.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
