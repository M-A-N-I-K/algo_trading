import { useEffect, useState } from "react";
import { Feather, CheckSquare, Square, Tag as TagIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";

interface ChecklistItem {
  label: string;
  checked: boolean;
}

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
  stopLoss?: number | null;
  initialRiskAmount?: number | null;
  tags?: string[];
  checklist?: ChecklistItem[] | null;
}

interface TradeNotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrade: Trade | null;
  onSaveNotes: (details: { notes: string; tags: string[]; checklist: ChecklistItem[] }) => Promise<void>;
}

// Rule-adherence checklists sourced directly from each strategy's actual
// entry rules, so reviewing a trade also checks it against the rules the
// strategy was coded to follow.
const STRATEGY_CHECKLISTS: Record<string, string[]> = {
  "macd-200ema-sr": [
    "Price was on the correct side of the 200 EMA before entry",
    "MACD crossover was confirmed on a closed candle",
    "Crossover happened within the trigger window of a support/resistance hit",
  ],
  "supply-demand": [
    "Zone formed from a consolidation base + explosive impulse candle",
    "Price closed back into the zone with a rejection/engulfing candle",
    "Trade was taken with the prevailing structural trend",
  ],
  "ema-rsi-bollinger": [
    "RSI condition confirmed before entry",
    "Price was interacting with the Bollinger Band",
    "EMA trend alignment confirmed",
  ],
  "macd-sma-atr": [
    "Price was on the correct side of the trend SMA",
    "MACD histogram crossover confirmed",
    "ATR was expanding, not flat/choppy",
  ],
  "trend-following": [
    "Dual EMA alignment confirmed",
    "Entered with the trend, not against it",
  ],
  "smc": [
    "Liquidity sweep of a prior swing high/low confirmed",
    "Change of character (CHoCH) confirmed after the sweep",
    "FVG was present and unmitigated",
    "Entry taken on a retest of the FVG",
  ],
  "vwap": [
    "Candle fully closed through VWAP before reacting (not just a wick)",
    "Long rejection wick present at VWAP",
    "VWAP was sloped, not flat, at the time of the setup",
    "Traded with VWAP's slope direction",
  ],
  "order-block": [
    "Zone was drawn body-to-wick per the rule, not just any candle",
    "Break of structure was confirmed before drawing the zone",
    "A full candle close confirmed the reject or retest reaction",
    "Stop was placed at the zone edge (or midpoint if the zone was oversized)",
  ],
  "4h-range": [
    "First 4-hour NY range had fully closed before marking it",
    "Breakout candle fully CLOSED outside the range (not just a wick)",
    "Re-entry candle fully closed back inside the range",
    "Stop placed at the exact extreme of the breakout excursion",
  ],
};

const DEFAULT_CHECKLIST = [
  "Setup matched my plan, not FOMO",
  "Risk was sized before entry, not after",
  "I would take this exact setup again",
];

export default function TradeNotesDrawer({
  isOpen,
  onClose,
  selectedTrade,
  onSaveNotes,
}: TradeNotesDrawerProps) {
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  // Sync editor state on trade selection
  useEffect(() => {
    if (selectedTrade) {
      setNotes(selectedTrade.notes || "");
      setTagsInput((selectedTrade.tags || []).join(", "));

      const defaults = STRATEGY_CHECKLISTS[selectedTrade.strategy] || DEFAULT_CHECKLIST;
      if (selectedTrade.checklist && selectedTrade.checklist.length > 0) {
        setChecklist(selectedTrade.checklist);
      } else {
        setChecklist(defaults.map((label) => ({ label, checked: false })));
      }
    } else {
      setNotes("");
      setTagsInput("");
      setChecklist([]);
    }
  }, [selectedTrade, isOpen]);

  const toggleChecklistItem = (index: number) => {
    setChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleSave = async () => {
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    await onSaveNotes({ notes, tags, checklist });
  };

  const rMultiple =
    selectedTrade?.initialRiskAmount && selectedTrade.initialRiskAmount > 0
      ? selectedTrade.pnl / selectedTrade.initialRiskAmount
      : null;

  return (
    <Sheet open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="!w-[580px] !max-w-[92vw] bg-slate-950 border-l border-slate-800 text-slate-200 p-5 sm:p-8 flex flex-col h-full">
        <SheetHeader className="mb-6">
          <SheetTitle className="font-Outfit text-xl font-bold text-white">
            Trade Details & Strategy Thinking
          </SheetTitle>
        </SheetHeader>

        {selectedTrade && (
          <div className="flex flex-col gap-6 flex-grow overflow-y-auto pr-1">

            {/* Stats Grid Card */}
            <Card className="glass border-slate-800">
              <CardContent className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:px-5">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Symbol</span>
                  <span className="text-sm font-bold text-white mt-0.5 block truncate">{selectedTrade.symbol}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Side</span>
                  <span className="mt-0.5 block">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${selectedTrade.side === 'LONG' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                      {selectedTrade.side}
                    </span>
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Realized PnL</span>
                  <span className={`text-sm font-bold mt-0.5 block truncate ${selectedTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {selectedTrade.pnl >= 0 ? '+' : ''}${selectedTrade.pnl.toFixed(2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Quantity</span>
                  <span className="text-sm font-bold text-white mt-0.5 block truncate">{selectedTrade.quantity}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Entry Price</span>
                  <span className="text-sm font-bold text-white mt-0.5 block truncate">${selectedTrade.entryPrice.toFixed(4)}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Exit Price</span>
                  <span className="text-sm font-bold text-white mt-0.5 block truncate">${selectedTrade.exitPrice.toFixed(4)}</span>
                </div>
                <div className="col-span-2 min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Date & Time</span>
                  <span className="text-sm font-bold text-white mt-0.5 block break-words">{selectedTrade.time}</span>
                </div>
                <div className="col-span-2 min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Strategy Setup</span>
                  <span className="text-sm font-bold text-white mt-0.5 block break-words">{selectedTrade.strategy}</span>
                </div>
                {selectedTrade.stopLoss != null && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Stop Loss</span>
                    <span className="text-sm font-bold text-white mt-0.5 block truncate">${selectedTrade.stopLoss.toFixed(4)}</span>
                  </div>
                )}
                {rMultiple !== null && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">R-Multiple</span>
                    <span className={`text-sm font-bold mt-0.5 block truncate ${rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {rMultiple >= 0 ? '+' : ''}{rMultiple.toFixed(2)}R
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tags */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-1">
                <TagIcon className="text-violet-500" size={16} />
                Tags
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="clean-setup, fomo-entry, moved-stop, high-conviction"
                className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
              />
            </div>

            {/* Rule-adherence checklist */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-1">
                <CheckSquare className="text-violet-500" size={16} />
                Rule Checklist
              </label>
              <div className="flex flex-col gap-2">
                {checklist.map((item, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => toggleChecklistItem(i)}
                    className="flex items-center gap-3 text-left bg-slate-900 border border-slate-800 hover:border-slate-700 px-4 py-2.5 rounded-xl text-sm transition-all"
                  >
                    {item.checked ? (
                      <CheckSquare className="text-emerald-400 shrink-0" size={16} />
                    ) : (
                      <Square className="text-slate-500 shrink-0" size={16} />
                    )}
                    <span className={item.checked ? "text-slate-200" : "text-slate-400"}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

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
