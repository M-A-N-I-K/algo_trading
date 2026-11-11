import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { PLAYBOOK_ACCOUNTS } from "@/lib/playbook/config";
import { useDashboard } from "@/components/trading-journal/DashboardContext";
import { Button, Field, Segmented, SelectInput, TextArea, TextInput, toneClass } from "@/components/kit";

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
  playbookAccountId?: string | null;
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
  const { defaultStrategy } = useDashboard();
  const [time, setTime] = useState("");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [strategy, setStrategy] = useState(defaultStrategy);
  const [qty, setQty] = useState("");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [pnl, setPnl] = useState("");
  const [balBefore, setBalBefore] = useState("");
  const [balAfter, setBalAfter] = useState("");
  const [notes, setNotes] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [tags, setTags] = useState("");
  const [riskPercent, setRiskPercent] = useState("1");
  const [account, setAccount] = useState(""); // "" = not a prop-account trade

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
      setStopLoss(activeTrade.stopLoss != null ? activeTrade.stopLoss.toString() : "");
      setTags((activeTrade.tags || []).join(", "));
      setAccount(activeTrade.playbookAccountId ?? "");
    } else {
      const d = new Date();
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      setTime(localISOTime);
      setSymbol("");
      setSide("LONG");
      setStrategy(defaultStrategy);
      setQty("");
      setEntry("");
      setExit("");
      setPnl("");
      setBalBefore("");
      setBalAfter("");
      setNotes("");
      setStopLoss("");
      setTags("");
      setRiskPercent("1");
      setAccount("");
    }
  }, [activeTrade, isOpen]);

  // Position-size calculator: given entry, stop-loss, account balance, and
  // a target risk %, back-solve the quantity that risks exactly that %.
  const canCalculateSize =
    parseFloat(entry) > 0 &&
    parseFloat(stopLoss) > 0 &&
    parseFloat(entry) !== parseFloat(stopLoss) &&
    parseFloat(balBefore) > 0 &&
    parseFloat(riskPercent) > 0;

  const handleCalculateSize = () => {
    const entryNum = parseFloat(entry);
    const stopNum = parseFloat(stopLoss);
    const balanceNum = parseFloat(balBefore);
    const riskNum = parseFloat(riskPercent);
    if (!canCalculateSize) return;

    const riskAmount = balanceNum * (riskNum / 100);
    const stopDistance = Math.abs(entryNum - stopNum);
    const suggestedQty = riskAmount / stopDistance;
    setQty(suggestedQty.toFixed(6));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entryNum = parseFloat(entry);
    const stopNum = parseFloat(stopLoss);
    const qtyNum = parseFloat(qty);
    const initialRiskAmount =
      !isNaN(stopNum) && stopNum > 0 && !isNaN(entryNum) && !isNaN(qtyNum)
        ? Math.abs(entryNum - stopNum) * qtyNum
        : undefined;

    const body = {
      id: activeTrade?.id || undefined,
      time: time.replace("T", " "),
      symbol: symbol.toUpperCase().trim(),
      side,
      strategy,
      quantity: qtyNum,
      entryPrice: entryNum,
      exitPrice: parseFloat(exit),
      pnl: parseFloat(pnl),
      balanceBefore: parseFloat(balBefore) || undefined,
      balanceAfter: parseFloat(balAfter) || undefined,
      notes,
      stopLoss: !isNaN(stopNum) && stopNum > 0 ? stopNum : undefined,
      initialRiskAmount,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      playbookAccountId: account || null
    };

    await onSave(body);
  };

  const net = parseFloat(pnl);

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto rounded-[12px] border border-rule bg-deck p-6 text-paper sm:max-w-xl md:max-w-2xl md:p-8">
        <DialogHeader className="mb-2">
          <DialogTitle className="font-display text-2xl font-bold tracking-[-0.02em] text-paper">
            {activeTrade ? "Edit trade" : "Log a trade"}
          </DialogTitle>
          <p className="text-sm text-fog">
            Synced CoinDCX trades fill these in for you. Use this for trades on other venues.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-7">
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-3 font-display text-[15px] font-semibold text-paper">The trade</legend>
            <Field label="Closed at" htmlFor="tf-time">
              <TextInput id="tf-time" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} required />
            </Field>
            <Field label="Symbol" htmlFor="tf-symbol">
              <TextInput id="tf-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="ETHUSDT" required />
            </Field>
            <Field label="Direction">
              <Segmented
                label="Direction"
                value={side}
                onChange={setSide}
                options={[
                  { value: "LONG", label: "Long" },
                  { value: "SHORT", label: "Short" },
                ]}
              />
            </Field>
            <Field
              label="Prop account"
              htmlFor="tf-account"
              className="sm:col-span-2"
              hint={account ? "Counts on this account in the Playbook: balance, daily loss and closed trades. Enter quantity in the platform's lots." : "Pick the prop account this trade was on, so the Playbook counts it."}
            >
              <SelectInput id="tf-account" value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">None (not a prop-account trade)</option>
                {PLAYBOOK_ACCOUNTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Strategy" htmlFor="tf-strategy">
              <SelectInput id="tf-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} required>
                {STRATEGY_CATALOG.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <legend className="mb-3 font-display text-[15px] font-semibold text-paper">Prices and size</legend>
            <Field label="Entry price" htmlFor="tf-entry">
              <TextInput id="tf-entry" type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} required />
            </Field>
            <Field label="Stop loss" htmlFor="tf-stop" hint="Needed for R-multiple.">
              <TextInput id="tf-stop" type="number" step="any" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
            </Field>
            <Field label="Exit price" htmlFor="tf-exit">
              <TextInput id="tf-exit" type="number" step="any" value={exit} onChange={(e) => setExit(e.target.value)} required />
            </Field>
            <Field label={account ? "Lots" : "Quantity"} htmlFor="tf-qty">
              <TextInput id="tf-qty" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </Field>
            <div className="flex flex-col justify-end gap-1.5 sm:col-span-2">
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-rule bg-ink/60 p-3">
                <Field label="Risk % of balance" htmlFor="tf-risk" className="w-32">
                  <TextInput id="tf-risk" type="number" step="any" value={riskPercent} onChange={(e) => setRiskPercent(e.target.value)} />
                </Field>
                <Button size="sm" disabled={!canCalculateSize} onClick={handleCalculateSize} className="mb-0.5">
                  <Calculator size={14} /> Size from stop
                </Button>
                <p className="w-full text-xs text-mist">
                  Sets quantity so hitting the stop loses {riskPercent || "?"}% of the balance before the trade.
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <legend className="mb-3 font-display text-[15px] font-semibold text-paper">Result</legend>
            <Field label="Net P&L ($)" htmlFor="tf-pnl" hint="After fees.">
              <TextInput
                id="tf-pnl"
                type="number"
                step="any"
                value={pnl}
                onChange={(e) => setPnl(e.target.value)}
                required
                className={isNaN(net) ? "" : toneClass(net)}
              />
            </Field>
            <Field label="Balance before" htmlFor="tf-bal-before" hint="Optional.">
              <TextInput id="tf-bal-before" type="number" step="any" value={balBefore} onChange={(e) => setBalBefore(e.target.value)} />
            </Field>
            <Field label="Balance after" htmlFor="tf-bal-after" hint="Optional.">
              <TextInput id="tf-bal-after" type="number" step="any" value={balAfter} onChange={(e) => setBalAfter(e.target.value)} />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 font-display text-[15px] font-semibold text-paper">Review</legend>
            <Field label="Tags" htmlFor="tf-tags" hint="Separate with commas, for example: clean-setup, moved-stop.">
              <TextInput id="tf-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="tf-notes">
              <TextArea
                id="tf-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="Why you took it, what the market was doing, and what you'd do differently."
              />
            </Field>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-rule pt-5">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {activeTrade ? "Save changes" : "Save trade"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
