import { useEffect, useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";

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

interface TradeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrade: Trade | null;
  onSave: (body: any) => Promise<void>;
}

export default function TradeFormModal({
  isOpen,
  onClose,
  activeTrade,
  onSave,
}: TradeFormModalProps) {
  const [time, setTime] = useState("");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [strategy, setStrategy] = useState("macd-200ema-sr");
  const [qty, setQty] = useState("");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [pnl, setPnl] = useState("");
  const [balBefore, setBalBefore] = useState("");
  const [balAfter, setBalAfter] = useState("");
  const [notes, setNotes] = useState("");

  // Synchronize form states on activeTrade change
  useEffect(() => {
    if (activeTrade) {
      try {
        const d = new Date(activeTrade.time);
        if (!isNaN(d.getTime())) {
          // Adjust timezone offset to local time so the input shows the correct local time
          const tzOffset = d.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
          setTime(localISOTime);
        } else {
          setTime("");
        }
      } catch (e) {
        setTime("");
      }
      setSymbol(activeTrade.symbol);
      setSide(activeTrade.side);
      setStrategy(activeTrade.strategy);
      setQty(activeTrade.quantity.toString());
      setEntry(activeTrade.entryPrice.toString());
      setExit(activeTrade.exitPrice.toString());
      setPnl(activeTrade.pnl.toString());
      setBalBefore(activeTrade.balanceBefore ? activeTrade.balanceBefore.toString() : "");
      setBalAfter(activeTrade.balanceAfter ? activeTrade.balanceAfter.toString() : "");
      setNotes(activeTrade.notes || "");
    } else {
      const d = new Date();
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      setTime(localISOTime);
      setSymbol("");
      setSide("LONG");
      setStrategy("macd-200ema-sr");
      setQty("");
      setEntry("");
      setExit("");
      setPnl("");
      setBalBefore("");
      setBalAfter("");
      setNotes("");
    }
  }, [activeTrade, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      id: activeTrade?.id || undefined,
      time: time.replace("T", " "),
      symbol: symbol.toUpperCase().trim(),
      side,
      strategy,
      quantity: parseFloat(qty),
      entryPrice: parseFloat(entry),
      exitPrice: parseFloat(exit),
      pnl: parseFloat(pnl),
      balanceBefore: parseFloat(balBefore) || undefined,
      balanceAfter: parseFloat(balAfter) || undefined,
      notes
    };

    await onSave(body);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:max-w-2xl lg:max-w-3xl bg-slate-950 border border-slate-800 text-slate-200 p-6 md:p-8 rounded-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader className="mb-6">
          <DialogTitle className="font-Outfit text-2xl font-bold text-white tracking-tight">
            {activeTrade ? "Edit Trade Setup" : "New Trade Entry"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Date & Time</label>
              <input 
                type="datetime-local" 
                value={time} 
                onChange={(e) => setTime(e.target.value)} 
                required 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Symbol</label>
              <input 
                type="text" 
                value={symbol} 
                onChange={(e) => setSymbol(e.target.value)} 
                placeholder="BTCUSDT" 
                required 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Side</label>
              <select 
                value={side} 
                onChange={(e: any) => setSide(e.target.value)} 
                required
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Strategy</label>
              <select 
                value={strategy} 
                onChange={(e) => setStrategy(e.target.value)} 
                required
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
              >
                <option value="macd-200ema-sr">MACD + 200 EMA + S/R</option>
                <option value="supply-demand">Supply & Demand Zones</option>
                <option value="ema-rsi-bollinger">EMA + RSI + Bollinger</option>
                <option value="macd-sma-atr">MACD + SMA + ATR</option>
                <option value="trend-following">Dual EMA Trend Follow</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Quantity</label>
              <input 
                type="number" 
                step="any" 
                value={qty} 
                onChange={(e) => setQty(e.target.value)} 
                placeholder="1.0" 
                required 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Entry Price</label>
              <input 
                type="number" 
                step="any" 
                value={entry} 
                onChange={(e) => setEntry(e.target.value)} 
                placeholder="68500.00" 
                required 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Exit Price</label>
              <input 
                type="number" 
                step="any" 
                value={exit} 
                onChange={(e) => setExit(e.target.value)} 
                placeholder="69200.00" 
                required 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Realized PnL ($)</label>
              <input 
                type="number" 
                step="any" 
                value={pnl} 
                onChange={(e) => setPnl(e.target.value)} 
                placeholder="700.00" 
                required 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Balance Before</label>
              <input 
                type="number" 
                step="any" 
                value={balBefore} 
                onChange={(e) => setBalBefore(e.target.value)} 
                placeholder="100000" 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Balance After</label>
              <input 
                type="number" 
                step="any" 
                value={balAfter} 
                onChange={(e) => setBalAfter(e.target.value)} 
                placeholder="100700" 
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Market Thinking & Strategy Notes</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              placeholder="Describe the market structure, support/resistance levels, MACD state, and the psychological reasoning behind this trade setup..." 
              rows={5}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600 resize-none"
            ></textarea>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button 
              type="button" 
              className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer"
              onClick={onClose}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 duration-300 cursor-pointer"
            >
              Save Journal Entry
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
