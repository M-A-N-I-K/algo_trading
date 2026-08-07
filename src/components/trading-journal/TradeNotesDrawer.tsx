import { useEffect, useState } from "react";
import { Feather } from "lucide-react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from "@/components/ui/sheet";
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

interface TradeNotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrade: Trade | null;
  onSaveNotes: (notes: string) => Promise<void>;
}

export default function TradeNotesDrawer({
  isOpen,
  onClose,
  selectedTrade,
  onSaveNotes,
}: TradeNotesDrawerProps) {
  const [notes, setNotes] = useState("");

  // Sync editor notes on trade selection
  useEffect(() => {
    if (selectedTrade) {
      setNotes(selectedTrade.notes || "");
    } else {
      setNotes("");
    }
  }, [selectedTrade, isOpen]);

  const handleSave = async () => {
    await onSaveNotes(notes);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="w-[580px] sm:max-w-[580px] bg-slate-950 border-l border-slate-800 text-slate-200 p-8 flex flex-col h-full">
        <SheetHeader className="mb-6">
          <SheetTitle className="font-Outfit text-xl font-bold text-white">
            Trade Details & Strategy Thinking
          </SheetTitle>
        </SheetHeader>

        {selectedTrade && (
          <div className="flex flex-col gap-6 flex-grow overflow-y-auto pr-1">
            
            {/* Stats Grid Card */}
            <Card className="glass border-slate-800">
              <CardContent className="grid grid-cols-2 gap-4 p-5">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Symbol</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{selectedTrade.symbol}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Side</span>
                  <span className="mt-0.5 block">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${selectedTrade.side === 'LONG' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                      {selectedTrade.side}
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Realized PnL</span>
                  <span className={`text-sm font-bold mt-0.5 block ${selectedTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {selectedTrade.pnl >= 0 ? '+' : ''}${selectedTrade.pnl.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Quantity</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{selectedTrade.quantity}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Entry Price</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">${selectedTrade.entryPrice.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Exit Price</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">${selectedTrade.exitPrice.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Date & Time</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{selectedTrade.time}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Strategy Setup</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{selectedTrade.strategy}</span>
                </div>
              </CardContent>
            </Card>

            {/* Note Editor Area */}
            <div className="flex flex-col gap-2 flex-grow">
              <label className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-1">
                <Feather className="text-violet-500" size={16} />
                My Thinking & Review
              </label>
              <textarea 
                rows={12} 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write your review of this trade setup here..."
                className="w-full flex-grow bg-slate-900 border border-slate-800 text-slate-200 p-4 rounded-2xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600 resize-none font-medium leading-relaxed"
              ></textarea>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3 mt-auto">
              <button 
                type="button" 
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                onClick={onClose}
              >
                Close
              </button>
              <button 
                type="button" 
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all"
                onClick={handleSave}
              >
                Save Changes
              </button>
            </div>

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
