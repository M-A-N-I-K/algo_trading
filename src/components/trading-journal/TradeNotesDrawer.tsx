import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ChecklistItem, Trade } from "@/components/trading-journal/DashboardContext";
import { grossOf, holdMinutesOf, rMultipleOf } from "@/lib/journal/metrics";
import { duration, money, signedNumber, toneClass } from "@/components/viz/shared";
import { Button, Field, Tag, TextArea, TextInput } from "@/components/kit";

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

  const t = selectedTrade;
  const r = t ? rMultipleOf(t) : null;
  const held = t ? holdMinutesOf(t) : null;
  const followed = checklist.filter((c) => c.checked).length;
  const closedAt = t ? new Date(t.time) : null;

  const facts: { label: string; value: string }[] = t
    ? [
        { label: "Entry", value: t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 6 }) },
        { label: "Exit", value: t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 6 }) },
        { label: "Stop", value: t.stopLoss != null ? t.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "Not set" },
        { label: "Size", value: t.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 }) },
        { label: "R-multiple", value: r == null ? "Needs a stop" : signedNumber(r, 2, "R") },
        { label: "Held", value: held == null ? "Unknown" : duration(held) },
        {
          label: "Closed by",
          value: t.exitType === "tpsl" ? "Take-profit or stop" : t.exitType === "liquidation" ? "Liquidation" : t.exitType === "manual" ? "Hand" : "Not recorded",
        },
        { label: "Strategy", value: t.strategy },
      ]
    : [];

  const parts = t
    ? [
        { label: "Price P&L", value: grossOf(t), tone: toneClass(grossOf(t)) },
        { label: "Fees", value: -(t.fees ?? 0), tone: "text-fees-ink" },
        { label: "Funding", value: t.funding ?? 0, tone: "text-funding-ink" },
      ]
    : [];

  return (
    <Sheet open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="flex h-full !w-[560px] !max-w-[94vw] flex-col border-l border-rule bg-deck p-0 text-paper">
        {t && closedAt && (
          <>
            <SheetHeader className="border-b border-rule px-6 pb-5 pt-6">
              <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-[-0.02em] text-paper">
                {t.symbol}
                <Tag tone={t.side === "LONG" ? "gain" : "loss"}>{t.side === "LONG" ? "Long" : "Short"}</Tag>
                {t.marginCurrency === "INR" && <Tag>INR margin</Tag>}
              </SheetTitle>
              <p className="text-sm text-fog">
                Closed {closedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </SheetHeader>

            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <section aria-label="Result">
                <p className={`font-display text-[40px] font-bold leading-none tracking-[-0.04em] ${toneClass(t.pnl)}`}>{money(t.pnl)}</p>
                <p className="mt-1 text-sm text-fog">Net, after fees and funding</p>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-rule pt-4">
                  {parts.map((p) => (
                    <div key={p.label}>
                      <dt className="text-xs text-fog">{p.label}</dt>
                      <dd className={`mt-0.5 text-[15px] ${p.tone}`}>{money(p.value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {facts.map((f) => (
                  <div key={f.label} className="min-w-0">
                    <dt className="text-xs text-fog">{f.label}</dt>
                    <dd className="mt-0.5 truncate text-sm text-paper" title={f.value}>{f.value}</dd>
                  </div>
                ))}
              </dl>

              <section aria-labelledby="checklist-title">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 id="checklist-title" className="font-display text-[15px] font-semibold">Did you follow your rules?</h3>
                  <span className="text-xs text-fog">
                    {followed} of {checklist.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {checklist.map((item, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.checked}
                        onClick={() => toggleChecklistItem(i)}
                        className="flex w-full items-start gap-3 rounded-md border border-rule bg-ink/50 px-3 py-2.5 text-left text-sm transition-colors hover:border-mist/60"
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                            item.checked ? "border-gain bg-gain text-ink" : "border-mist"
                          }`}
                        >
                          {item.checked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className={item.checked ? "text-paper" : "text-fog"}>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <Field label="Tags" htmlFor="nd-tags" hint="Separate with commas. Use them to find patterns in the journal.">
                <TextInput id="nd-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="clean-setup, moved-stop" />
              </Field>

              <Field label="Review" htmlFor="nd-notes">
                <TextArea
                  id="nd-notes"
                  rows={10}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did you see, what did you do, and what would you change?"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-rule px-6 py-4">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" onClick={handleSave}>
                Save review
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
