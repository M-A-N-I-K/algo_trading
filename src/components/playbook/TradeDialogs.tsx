"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, Callout, Field, Segmented, SelectInput, TextArea, TextInput, money, signedNumber, toneClass } from "@/components/kit";
import { lotUnits, MANUAL_CHECKS, MISTAKES, PLAYBOOK_SETUPS, setupById, type PlaybookAccount } from "@/lib/playbook/config";
import { hardFailures, pnlUsd, preTradeChecks, riskBudget, sizePosition, usdPerUnitMove, type Check, type Grade, type JournalEntry, type Side } from "@/lib/playbook/rules";
import { roundTripCostPerUnitUsd } from "@/lib/costs/fundingpips";
import { fmtPrice } from "@/lib/plan/weeklyPlan";
import { cn } from "@/lib/utils";

// Prefixes: each account's view and signals sit under [...KEY, accountId], so
// invalidating a prefix refreshes every account.
export const PLAYBOOK_KEY = ["playbook"] as const;
export const PLAYBOOK_SIGNALS_KEY = ["playbook-signals"] as const;

const dialogClass = "max-h-[92vh] max-w-[95vw] overflow-y-auto rounded-[12px] border border-rule bg-deck p-5 text-paper sm:max-w-xl md:max-w-2xl md:p-7";
const titleClass = "font-display text-xl font-semibold tracking-[-0.02em] text-paper";

// datetime-local wants local wall time without a zone.
const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (s: string) => (s ? new Date(s).getTime() : Date.now());
const n = (s: string) => (s.trim() === "" ? NaN : Number(s));

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json?.message || `Request failed (${res.status})`), { details: json?.details });
  return json;
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: PLAYBOOK_KEY }), qc.invalidateQueries({ queryKey: PLAYBOOK_SIGNALS_KEY })]);
}

const ICON = {
  pass: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-gain-ink" aria-label="Passed" />,
  warn: <CircleAlert size={16} className="mt-0.5 shrink-0 text-fees-ink" aria-label="Warning" />,
  fail: <CircleX size={16} className="mt-0.5 shrink-0 text-loss-ink" aria-label="Breaks a rule" />,
};

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2 text-[13px] leading-snug">
          {ICON[c.status]}
          <span>
            <span className="text-paper">{c.label}</span>
            <span className="text-fog"> · {c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- plan and log a trade ---------- */

export interface PlanDefaults {
  setupId?: string;
  side?: Side;
  grade?: Grade | null;
  entry?: number;
  stop?: number | null;
  target?: number | null;
  signalEntry?: number | null;
}

export function PlanTradeDialog({ open, onClose, defaults, entries, account, stoppedElsewhere }: { open: boolean; onClose: () => void; defaults: PlanDefaults; entries: JournalEntry[]; account: PlaybookAccount; stoppedElsewhere: string[] }) {
  // Remount the form whenever it opens with new defaults.
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={dialogClass}>
        {open && <PlanTradeForm key={`${account.id}:${JSON.stringify(defaults)}`} defaults={defaults} entries={entries} account={account} stoppedElsewhere={stoppedElsewhere} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PlanTradeForm({ defaults, entries, account, stoppedElsewhere, onDone }: { defaults: PlanDefaults; entries: JournalEntry[]; account: PlaybookAccount; stoppedElsewhere: string[]; onDone: () => void }) {
  const refresh = useRefresh();
  const [setupId, setSetupId] = useState(defaults.setupId ?? PLAYBOOK_SETUPS[0].id);
  const [side, setSide] = useState<Side>(defaults.side ?? "LONG");
  const [grade, setGrade] = useState<"A" | "B" | "none">(defaults.grade ?? "none");
  const [entry, setEntry] = useState(defaults.entry !== undefined ? String(defaults.entry) : "");
  const [stop, setStop] = useState(defaults.stop != null ? String(defaults.stop) : "");
  const [target, setTarget] = useState(defaults.target != null ? String(defaults.target) : "");
  const [time, setTime] = useState(toLocalInput(Date.now()));
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState("");

  const setup = setupById(setupId)!;
  const g: Grade | null = grade === "none" ? null : grade;
  const budget = riskBudget(setup.symbol, g, account);
  const e = n(entry), s = n(stop), t = n(target);
  // Commission (measured from the MT5 report) and spread for the round trip, per unit.
  const costPerUnit = Number.isFinite(e) && e > 0 ? roundTripCostPerUnitUsd(setup.symbol, e).total : 0;
  const suggested = Number.isFinite(e) && Number.isFinite(s) ? sizePosition(setup.symbol, e, s, budget.amount, costPerUnit) : null;
  const [lotsText, setLotsText] = useState<string | null>(null); // null = follow the suggestion
  const lots = lotsText === null ? (suggested?.lots ?? NaN) : n(lotsText);
  // $ lost if the stop is hit, commission and spread included.
  const riskAmount =
    Number.isFinite(lots) && Number.isFinite(e) && Number.isFinite(s)
      ? lots * lotUnits(setup.symbol) * (Math.abs(e - s) * usdPerUnitMove(setup.symbol, s) + costPerUnit)
      : 0;

  const checks = useMemo(() => {
    if (!Number.isFinite(e) || !Number.isFinite(s)) return [];
    const auto = preTradeChecks(
      { setupId, side, grade: g, entry: e, stop: s, target: Number.isFinite(t) ? t : null, riskAmount, signalEntry: defaults.signalEntry ?? null, time: fromLocalInput(time) },
      entries,
      account,
      stoppedElsewhere,
    );
    const manual: Check[] = MANUAL_CHECKS.map((m) => ({ id: m.id, label: m.label, status: ticked.has(m.id) ? "pass" : "fail", detail: ticked.has(m.id) ? "Ticked" : "Not ticked yet", hard: true }));
    return [...auto, ...manual];
  }, [setupId, side, g, e, s, t, riskAmount, defaults.signalEntry, time, entries, account, stoppedElsewhere, ticked]);
  const broken = hardFailures(checks);

  const save = useMutation({
    mutationFn: () =>
      send("/api/playbook/trades", "POST", {
        accountId: account.id,
        setupId,
        side,
        grade: g,
        entryPrice: e,
        stopLoss: s,
        takeProfit: Number.isFinite(t) ? t : null,
        lots,
        riskAmount,
        signalEntry: defaults.signalEntry ?? null,
        entryTime: fromLocalInput(time),
        manualChecks: [...ticked],
        overrideReason: broken.length ? override : "",
        notes,
      }),
    onSuccess: async () => {
      await refresh();
      onDone();
    },
  });

  const ready = Number.isFinite(e) && Number.isFinite(s) && Number.isFinite(lots) && lots > 0;
  const autoChecks = checks.filter((c) => !MANUAL_CHECKS.some((m) => m.id === c.id));

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className={titleClass}>Plan a trade · {account.name}</DialogTitle>
        <p className="text-[13px] text-fog">Every rule is checked as you type. A trade that breaks one can still be logged with a reason, and it&apos;s marked as a rule break.</p>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Setup" htmlFor="pb-setup" className="sm:col-span-2">
          <SelectInput id="pb-setup" value={setupId} onChange={(ev) => { setSetupId(ev.target.value); setLotsText(null); }}>
            {PLAYBOOK_SETUPS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.platformSymbol} · {x.strategyName} · {x.interval}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Direction">
          <Segmented label="Direction" value={side} onChange={setSide} options={[{ value: "LONG", label: "Long" }, { value: "SHORT", label: "Short" }]} />
        </Field>
        <Field label="Grade" hint="From the signal, or Weekly plan: A is a long below last week's midpoint or a short above it.">
          <Segmented label="Grade" value={grade} onChange={setGrade} options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "none", label: "None" }]} />
        </Field>
        <Field label="Entry" htmlFor="pb-entry">
          <TextInput id="pb-entry" inputMode="decimal" value={entry} onChange={(ev) => setEntry(ev.target.value)} />
        </Field>
        <Field label="Stop loss" htmlFor="pb-stop">
          <TextInput id="pb-stop" inputMode="decimal" value={stop} onChange={(ev) => setStop(ev.target.value)} />
        </Field>
        <Field label="Target" htmlFor="pb-target" hint="Optional">
          <TextInput id="pb-target" inputMode="decimal" value={target} onChange={(ev) => setTarget(ev.target.value)} />
        </Field>
        <Field
          label="Lots"
          htmlFor="pb-lots"
          hint={
            budget.skip
              ? `${budget.skip}: the plan sizes it at nothing.`
              : suggested
              ? `Plan: ${budget.riskPct}% = ${money(budget.amount, { sign: false })}. ${suggested.lots} lot risks ${money(suggested.riskAtLots, { sign: false })}, of which ${money(suggested.costAtLots, { sign: false })} is commission and spread${suggested.belowMinLot ? ", more than the plan: the stop is too tight for the smallest lot" : ""}. 1 lot = ${lotUnits(setup.symbol).toLocaleString()} ${setup.symbol.startsWith("XA") ? "oz" : setup.symbol.startsWith("BTC") || setup.symbol.startsWith("ETH") ? "coin" : "units"}.`
              : "Enter entry and stop to size it."
          }
        >
          <TextInput id="pb-lots" inputMode="decimal" value={lotsText ?? (suggested ? String(suggested.lots) : "")} onChange={(ev) => setLotsText(ev.target.value)} />
        </Field>
        <Field label="Entry time" htmlFor="pb-time">
          <TextInput id="pb-time" type="datetime-local" value={time} onChange={(ev) => setTime(ev.target.value)} />
        </Field>
        <div className="flex flex-col justify-end">
          <p className="text-[13px] text-fog">At risk</p>
          <p className="font-display text-xl font-semibold tabular-nums text-paper">{money(riskAmount, { sign: false })}</p>
        </div>
      </div>

      {autoChecks.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-paper">Rules</h3>
          <CheckList checks={autoChecks} />
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-medium text-paper">Before you enter</h3>
        <div className="flex flex-col gap-2">
          {MANUAL_CHECKS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-paper">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--gain)]"
                checked={ticked.has(m.id)}
                onChange={(ev) => setTicked((prev) => { const next = new Set(prev); if (ev.target.checked) next.add(m.id); else next.delete(m.id); return next; })}
              />
              {m.label}
            </label>
          ))}
        </div>
      </section>

      <Field label="Notes" htmlFor="pb-notes" hint="Why this trade, in a sentence. Read it again when you review.">
        <TextArea id="pb-notes" className="min-h-16" value={notes} onChange={(ev) => setNotes(ev.target.value)} />
      </Field>

      {ready && broken.length > 0 && (
        <Callout tone="critical" title={`Breaks ${broken.length} rule${broken.length > 1 ? "s" : ""}: ${broken.map((b) => b.label.toLowerCase()).join(", ")}`}>
          <p className="mb-2">The best move is not to take it. If you already did, log it so the journal stays honest: it will count against your rule-following numbers.</p>
          <TextInput aria-label="Reason for taking it anyway" placeholder="Why you took it anyway" value={override} onChange={(ev) => setOverride(ev.target.value)} />
        </Callout>
      )}

      {save.error && <Callout tone="critical">{save.error.message}</Callout>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          variant={broken.length ? "danger" : "primary"}
          disabled={!ready || save.isPending || (broken.length > 0 && override.trim() === "")}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : broken.length ? "Log as rule break" : "Log trade"}
        </Button>
      </div>
    </div>
  );
}

/* ---------- close or edit a trade ---------- */

export function CloseTradeDialog({ trade, onClose }: { trade: JournalEntry | null; onClose: () => void }) {
  return (
    <Dialog open={trade !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={dialogClass}>{trade && <CloseTradeForm key={trade.id} trade={trade} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function CloseTradeForm({ trade, onDone }: { trade: JournalEntry; onDone: () => void }) {
  const refresh = useRefresh();
  const closing = trade.status === "OPEN";
  const setup = setupById(trade.setupId);
  const [exitPrice, setExitPrice] = useState(trade.exitPrice != null ? String(trade.exitPrice) : "");
  const [pnlText, setPnlText] = useState<string | null>(trade.pnl != null ? String(trade.pnl) : null);
  const [time, setTime] = useState(toLocalInput(trade.exitTime ?? Date.now()));
  const [reason, setReason] = useState<"stop" | "target" | "breakeven" | "manual">((trade.exitReason as "stop") ?? "target");
  const [mistakes, setMistakes] = useState<Set<string>>(new Set(trade.mistakes));
  const [notes, setNotes] = useState(trade.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const x = n(exitPrice);
  const estimate = Number.isFinite(x) ? pnlUsd(trade.symbol, trade.side, trade.quantity, trade.entryPrice, x) : NaN;
  const pnl = pnlText === null ? estimate : n(pnlText);
  const r = Number.isFinite(pnl) && trade.riskAmount > 0 ? pnl / trade.riskAmount : NaN;

  const save = useMutation({
    mutationFn: () =>
      send(`/api/playbook/trades/${trade.id}`, "PATCH", {
        ...(closing ? { exitPrice: x, pnl, exitTime: fromLocalInput(time), exitReason: reason } : {}),
        mistakes: [...mistakes],
        notes,
      }),
    onSuccess: async () => { await refresh(); onDone(); },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playbook/trades/${trade.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete the trade.");
    },
    onSuccess: async () => { await refresh(); onDone(); },
  });

  const price = (v: number) => fmtPrice(v, trade.symbol);
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className={titleClass}>
          {closing ? "Close" : "Review"} {trade.side.toLowerCase()} {setup?.platformSymbol ?? trade.symbol}
        </DialogTitle>
        <p className="text-[13px] text-fog">
          {setup?.strategyName} {setup?.interval} · entry {price(trade.entryPrice)} · stop {price(trade.stopLoss)}
          {trade.takeProfit !== null && <> · target {price(trade.takeProfit)}</>} · {money(trade.riskAmount, { sign: false })} at risk
        </p>
      </DialogHeader>

      {closing && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exit price" htmlFor="pb-exit">
            <TextInput id="pb-exit" inputMode="decimal" value={exitPrice} onChange={(ev) => setExitPrice(ev.target.value)} />
          </Field>
          <Field label="Exit time" htmlFor="pb-exit-time">
            <TextInput id="pb-exit-time" type="datetime-local" value={time} onChange={(ev) => setTime(ev.target.value)} />
          </Field>
          <Field label="P&L from your platform ($)" htmlFor="pb-pnl" hint={Number.isFinite(estimate) ? `From prices: ${money(estimate)}. Use the platform's figure: it includes spread, commission and swap.` : "Spread, commission and swap included."}>
            <TextInput id="pb-pnl" inputMode="decimal" value={pnlText ?? (Number.isFinite(estimate) ? estimate.toFixed(2) : "")} onChange={(ev) => setPnlText(ev.target.value)} />
          </Field>
          <div className="flex flex-col justify-end">
            <p className="text-[13px] text-fog">Result</p>
            <p className={cn("font-display text-xl font-semibold tabular-nums", Number.isFinite(r) ? toneClass(r) : "text-fog")}>{Number.isFinite(r) ? signedNumber(r, 2, "R") : "—"}</p>
          </div>
          <Field label="How it closed" className="sm:col-span-2">
            <Segmented
              label="How it closed"
              value={reason}
              onChange={setReason}
              options={[{ value: "target", label: "Target" }, { value: "stop", label: "Stop" }, { value: "breakeven", label: "Breakeven" }, { value: "manual", label: "By hand" }]}
            />
          </Field>
        </div>
      )}

      <section>
        <h3 className="mb-1 text-sm font-medium text-paper">Mistakes</h3>
        <p className="mb-2 text-[13px] text-fog">Be honest: the scorecard adds up what each one costs you.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MISTAKES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2.5 text-[13px] text-paper">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--loss)]"
                checked={mistakes.has(m.id)}
                onChange={(ev) => setMistakes((prev) => { const next = new Set(prev); if (ev.target.checked) next.add(m.id); else next.delete(m.id); return next; })}
              />
              {m.label}
            </label>
          ))}
        </div>
      </section>

      <Field label="Notes" htmlFor="pb-close-notes">
        <TextArea id="pb-close-notes" className="min-h-16" value={notes} onChange={(ev) => setNotes(ev.target.value)} />
      </Field>

      {(save.error || remove.error) && <Callout tone="critical">{(save.error ?? remove.error)!.message}</Callout>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-[13px] text-fog">
            Delete this trade?
            <Button size="sm" variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>Delete</Button>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending || (closing && (!Number.isFinite(x) || !Number.isFinite(pnl)))} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : closing ? "Close trade" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
