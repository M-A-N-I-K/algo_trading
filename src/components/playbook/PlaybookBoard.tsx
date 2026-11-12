"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button, Callout, EmptyState, Field, Panel, Stat, Tag, TextInput, money, signedNumber, tableClass, tdClass, thClass, toneClass } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import { OTHER_SETUP_RISK_SCALE, PLAYBOOK_ACCOUNTS, PLAYBOOK_SETUPS, setupById, type PlaybookAccount } from "@/lib/playbook/config";
import { MID_AVG_R, STRONG_AVG_R, type JournalEntry, type RankedSignal, type SetupVerdict, type Tier } from "@/lib/playbook/rules";
import type { PlaybookView } from "@/lib/playbook/store";
import { fmtPrice } from "@/lib/plan/weeklyPlan";
import { cn } from "@/lib/utils";
import { CloseTradeDialog, EditTradeDialog, PLAYBOOK_KEY, PLAYBOOK_SIGNALS_KEY, PlanTradeDialog, type PlanDefaults } from "./TradeDialogs";
import { registerSpecs, type SymbolSpec } from "@/lib/mt5/specs";

interface SignalsResponse {
  asOf: number;
  signals: RankedSignal[];
  specs?: Record<string, SymbolSpec>;
  errors: string[];
}

const when = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const usd = (v: number) => money(v, { sign: false });
const r = (v: number) => signedNumber(v, 2, "R");
const marketOf = (e: { setupId: string; symbol: string }) => setupById(e.setupId)?.platformSymbol ?? e.symbol;

function Meter({ value, max, tone }: { value: number; max: number; tone: "gain" | "loss" | "fees" | "signal" }) {
  const w = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100;
  const bg = { gain: "bg-gain", loss: "bg-loss", fees: "bg-fees", signal: "bg-signal" }[tone];
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-deck-2" aria-hidden="true">
      <div className={cn("h-full rounded-full", bg)} style={{ width: `${w}%` }} />
    </div>
  );
}

function SideTag({ side }: { side: "LONG" | "SHORT" }) {
  return <Tag tone={side === "LONG" ? "gain" : "loss"}>{side === "LONG" ? "Long" : "Short"}</Tag>;
}
// S and A+ stand out; C is greyed, since it's a skip.
const TIER_CLASS: Record<Tier, string> = {
  S: "border-gain/60 bg-gain/15 text-gain-ink",
  "A+": "border-signal/60 bg-signal/15 text-signal",
  A: "border-signal/30 bg-signal/5 text-signal",
  B: "border-rule bg-deck-2 text-paper",
  C: "border-rule bg-transparent text-mist line-through",
};
function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={cn("inline-flex h-7 min-w-9 items-center justify-center rounded-[6px] border px-2 font-display text-sm font-semibold tabular-nums", TIER_CLASS[tier])} aria-label={`Tier ${tier}`}>
      {tier}
    </span>
  );
}

function TierLegend() {
  return (
    <details className="rounded-[8px] border border-rule bg-ink/30 px-3 py-2 text-[13px] text-fog">
      <summary className="cursor-pointer text-paper">How the tiers work</summary>
      <ul className="mt-2 flex flex-col gap-1">
        <li><TierBadge tier="S" /> A-grade on a strong setup (backtest {STRONG_AVG_R}R+ a trade). Full risk.</li>
        <li><TierBadge tier="A+" /> A-grade on a mid setup ({MID_AVG_R}–{STRONG_AVG_R}R). Full risk.</li>
        <li><TierBadge tier="A" /> A-grade on a weaker setup (under {MID_AVG_R}R). Full risk.</li>
        <li><TierBadge tier="B" /> B-grade or ungraded. B risk, and only if a slot is still free after the A tiers.</li>
        <li><TierBadge tier="C" /> Skip: this account doesn&apos;t take it (Pro skips B, nobody takes B-grade forex) or entering now is chasing.</li>
      </ul>
      <p className="mt-2">A-grade trades made profit factor 2.10 in the backtest against 1.44 for B-grade. The tier picks which signal gets your slot; the size stays the account&apos;s tested A or B risk.</p>
    </details>
  );
}

function GradeTag({ grade }: { grade: "A" | "B" | null | undefined }) {
  return grade ? <Tag tone={grade === "A" ? "signal" : "neutral"}>{grade}-grade</Tag> : <Tag>No grade</Tag>;
}

/* ---------- account ---------- */

// Sets the balance to what the platform shows, so the floor, daily limit and
// target use the real number. Closed balance: open trades aren't included.
function BalanceEditor({ accountId, current, onDone }: { accountId: string; current: number; onDone: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(current.toFixed(2));
  const save = useMutation({
    mutationFn: () => fetchJson<PlaybookView>("/api/playbook", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, balance: Number(value) }) }),
    onSuccess: async (view) => {
      qc.setQueryData([...PLAYBOOK_KEY, accountId], view);
      // Other accounts' views show this one in the switcher.
      await qc.invalidateQueries({ queryKey: PLAYBOOK_KEY, predicate: (q) => q.queryKey[1] !== accountId });
      await qc.invalidateQueries({ queryKey: PLAYBOOK_SIGNALS_KEY });
      onDone();
    },
  });
  const n = Number(value);
  return (
    <form
      className="mt-5 flex flex-col gap-3 rounded-[10px] border border-rule bg-ink/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Balance on your platform ($)" htmlFor="pb-balance" hint="The closed balance FundingPips shows, without open trades. Trades you log here are added on top from now on.">
        <TextInput id="pb-balance" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="sm:max-w-48" />
      </Field>
      {save.error && <p className="text-[13px] text-loss-ink">{save.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!(n > 0) || save.isPending}>{save.isPending ? "Saving…" : "Save balance"}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function AccountSwitcher({ view, onSelect }: { view: PlaybookView; onSelect: (id: string) => void }) {
  return (
    <div role="tablist" aria-label="Prop account" className="grid gap-3 sm:grid-cols-2">
      {view.accounts.map(({ account, status }) => {
        const active = account.id === view.account.id;
        const since = status.balance - status.size;
        return (
          <button
            key={account.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(account.id)}
            className={cn(
              "flex min-w-0 flex-col gap-1.5 rounded-[10px] border p-4 text-left transition-colors",
              active ? "border-signal bg-deck" : "border-rule bg-ink/40 hover:border-mist",
            )}
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display text-[15px] font-semibold text-paper">{account.name}</span>
              {status.targetReached ? <Tag tone="gain">Target reached</Tag> : status.dailyStopHit ? <Tag tone="loss">Stopped today</Tag> : status.openCount > 0 ? <Tag tone="signal">{status.openCount} open</Tag> : null}
            </span>
            <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] tabular-nums">
              <span className="text-paper">{usd(status.balance)}</span>
              <span className={toneClass(since)}>{money(since)} total</span>
              <span className={toneClass(status.todayPnl)}>{money(status.todayPnl)} today</span>
            </span>
            <span className="text-xs text-mist">
              {account.setups.length} setups · {account.rules.riskPctA}% ({usd((account.size * account.rules.riskPctA) / 100)}) a trade · stop at {money(-status.ownDailyStop)} a day · floor {usd(status.floor)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AccountPanel({ view }: { view: PlaybookView }) {
  const s = view.status;
  const [editing, setEditing] = useState(false);
  const room = s.roomToFloor;
  const floorSpan = s.size - s.floor;
  const todayLeft = s.ownDailyStop + s.todayPnl;
  const sinceStart = s.balance - s.size;
  return (
    <Panel
      title={view.account.name}
      note={`$${s.size.toLocaleString()} account. Equity may never touch ${usd(s.floor)} (${view.account.maxLossPct}% below the start, it never moves) or lose ${view.account.dailyLossPct}% in a day.`}
      aside={!editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Match platform balance</Button>}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-5">
        <div>
          <Stat
            label="Balance"
            value={usd(s.balance)}
            note={`${money(sinceStart)} since the start${s.priorPnl !== 0 ? ` (${money(s.priorPnl)} before the playbook)` : ""}`}
            tone={toneClass(sinceStart) === "text-fog" ? undefined : toneClass(sinceStart)}
          />
        </div>
        <div>
          <Stat label="Room to the floor" value={usd(room)} note="If every open trade hits its stop" tone={room < floorSpan * 0.4 ? "text-loss-ink" : undefined} />
          <Meter value={room} max={floorSpan + Math.max(0, s.balance - s.size)} tone={room < floorSpan * 0.4 ? "loss" : "gain"} />
        </div>
        <div>
          <Stat label="Today" value={money(s.todayPnl)} note={`Your stop ${money(-s.ownDailyStop)} · firm ${money(-s.firmDailyLimit)}`} tone={toneClass(s.todayPnl) === "text-fog" ? undefined : toneClass(s.todayPnl)} />
          <Meter value={todayLeft} max={s.ownDailyStop} tone={todayLeft < s.ownDailyStop * 0.5 ? "loss" : "gain"} />
        </div>
        <div>
          <Stat label="Open trades" value={`${s.openCount} of ${view.rules.maxOpen}`} note={`${usd(s.openRisk)} at risk`} />
          <Meter value={s.openCount} max={view.rules.maxOpen} tone={s.openCount >= view.rules.maxOpen ? "fees" : "signal"} />
        </div>
        <div>
          <Stat label="To the target" value={s.targetReached ? "Reached" : usd(s.toTarget)} note={`Target ${usd(s.targetBalance)} (+${view.account.targetPct}%)`} tone={s.targetReached ? "text-gain-ink" : undefined} />
          <Meter value={s.balance - s.size} max={s.targetBalance - s.size} tone="gain" />
        </div>
      </div>
      {editing && <BalanceEditor accountId={view.account.id} current={s.balance} onDone={() => setEditing(false)} />}
      {s.dailyStopHit && (
        <Callout tone="critical" title="Daily stop hit" className="mt-5">
          {s.lossesToday >= view.rules.maxLossesPerDay ? `${s.lossesToday} losing trades today` : `You're down ${usd(-s.todayPnl)} today`}. No more trades on any account until the firm&apos;s day resets at 00:00 platform time.
        </Callout>
      )}
      {!s.dailyStopHit && view.stoppedElsewhere.length > 0 && (
        <Callout tone="critical" title="Stopped on another account" className="mt-5">
          {view.stoppedElsewhere.join(" and ")} hit the daily stop today. A bad day on one account is a reason to stop on all of them until the reset.
        </Callout>
      )}
      {s.targetReached && (
        <Callout tone="good" title="Target reached" className="mt-5">
          Close any open trades and stop trading this phase: more trades can only risk the pass.
        </Callout>
      )}
    </Panel>
  );
}

/* ---------- signals ---------- */

function SignalCard({ item, rank, onPlan }: { item: RankedSignal; rank: number; onPlan: (d: PlanDefaults) => void }) {
  const { setup, signal: s, sizing, checks, tier } = item;
  const price = (v: number | null) => (v === null ? "—" : fmtPrice(v, setup.symbol));
  const blockers = checks.filter((c) => c.hard && c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn" && c.id !== "grade");
  return (
    <article className={cn("flex min-w-0 flex-col gap-3 rounded-[10px] border border-rule bg-ink/40 p-4", tier === "C" && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-mist">#{rank}</span>
          <TierBadge tier={tier} />
          <h3 className="font-display text-[17px] font-semibold text-paper">{setup.platformSymbol}</h3>
          <SideTag side={s.side} />
          <GradeTag grade={s.grade} />
          {s.status === "new" ? <Tag tone="fees">{s.stopOrder ? (s.side === "LONG" ? "Buy stop" : "Sell stop") : "New"}</Tag> : <Tag>Running {s.rMultiple !== null ? r(s.rMultiple) : ""}</Tag>}
        </div>
        <span className="text-[13px] text-fog">
          {setup.strategyName} · {setup.interval}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-5">
        <div><dt className="text-mist">Entry</dt><dd className="tabular-nums text-paper">{price(s.entry)}</dd></div>
        <div><dt className="text-mist">Stop</dt><dd className="tabular-nums text-loss-ink">{price(s.stop)}</dd></div>
        <div><dt className="text-mist">Target</dt><dd className="tabular-nums text-gain-ink">{price(s.target)}</dd></div>
        <div><dt className="text-mist">Reward : risk</dt><dd className="tabular-nums text-paper">{s.rr !== null ? `${s.rr.toFixed(1)} : 1` : "—"}</dd></div>
        <div><dt className="text-mist">Size</dt><dd className="tabular-nums text-paper">{tier === "C" ? "Skip" : sizing ? `${sizing.lots} lot · ${usd(sizing.riskAtLots)} (${item.riskPct}%)` : "—"}</dd></div>
      </dl>
      {s.status === "new" && s.stopOrder && (
        <p className="text-[13px] leading-snug text-fog">
          <span className="text-paper">Pending order, not a market order:</span> place a {s.side === "LONG" ? "buy" : "sell"} stop at {price(s.entry)}, valid until {when.format(s.stopOrder.expires)}.
          {s.stopOrder.cancelAt !== null && ` Cancel it if price reaches ${price(s.stopOrder.cancelAt)} first.`} If it doesn&apos;t fill, wait for the next signal.
        </p>
      )}
      <p className="text-[13px] leading-snug text-fog"><span className="text-paper">Tier {tier}:</span> {item.tierReason}</p>
      <p className="text-[13px] leading-snug">
        {item.takeable ? (
          <span className="text-gain-ink">Fits every rule.</span>
        ) : (
          <span className="text-loss-ink">Blocked: {blockers.map((b) => b.detail).join(" ")}</span>
        )}
        {warnings.length > 0 && <span className="text-fees-ink"> {warnings.map((w) => w.detail).join(". ")}.</span>}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mist">
        <span>Signal {when.format(s.signalTime)} · backtest {setup.baseline.winRatePct}% wins, {r(setup.baseline.avgR)} a trade</span>
        <Button
          size="sm"
          variant={item.takeable ? "primary" : "secondary"}
          onClick={() => onPlan({ setupId: setup.id, side: s.side, grade: s.grade ?? null, entry: item.plan?.entry ?? s.entry, stop: s.stop, target: s.target, signalEntry: s.entry })}
        >
          Plan trade
        </Button>
      </div>
    </article>
  );
}

// One query for both panels (react-query shares it by key).
function useSignals(accountId: string) {
  return useQuery({
    queryKey: [...PLAYBOOK_SIGNALS_KEY, accountId],
    queryFn: async () => {
      const res = await fetchJson<SignalsResponse>(`/api/playbook/signals?account=${encodeURIComponent(accountId)}`);
      // MT5's contract specs, so the trade dialogs can size FTSE 100 here too.
      registerSpecs(res.specs);
      return res;
    },
    refetchInterval: 60_000,
  });
}

function SignalsPanel({ account, onPlan, freeSlots }: { account: PlaybookAccount; onPlan: (d: PlanDefaults) => void; freeSlots: number }) {
  const { data, error, isLoading } = useSignals(account.id);
  const all = data?.signals ?? [];
  const own = all.filter((x) => x.inPlan);
  const other = all.filter((x) => !x.inPlan);
  const fresh = own.filter((x) => x.signal.status === "new");
  const running = own.filter((x) => x.signal.status === "open");
  const ownCount = account.setups.length;
  const perWeek = account.setups.reduce((a, s) => a + (setupById(s.id)?.baseline.perWeek ?? 0), 0);
  const otherPct = Math.round(OTHER_SETUP_RISK_SCALE * 100);
  return (
    <Panel
      title="Today's signals"
      note={`This account's ${ownCount} setups, by priority: ones you can take first, then tier S, A+, A, B, C, new before running. ${freeSlots > 0 ? `You have ${freeSlots} free slot${freeSlots > 1 ? "s" : ""}: take from the top.` : "All slots are full."}`}
      aside={data && <span className="text-xs text-mist">Checked {when.format(data.asOf)}, every minute</span>}
    >
      {isLoading ? (
        <EmptyState>Scanning the {PLAYBOOK_SETUPS.length} setups. The first scan after a restart downloads two years of candles and can take a minute.</EmptyState>
      ) : error || !data ? (
        <Callout tone="critical" title="Couldn't scan">{error instanceof Error ? error.message : "Try again in a minute."}</Callout>
      ) : (
        <div className="flex flex-col gap-5">
          <TierLegend />
          {fresh.length === 0 ? (
            <EmptyState>No new signal on this account&apos;s setups right now. Their backtests averaged about {perWeek.toFixed(1)} a week, so most days have none: that&apos;s normal, not a reason to look elsewhere.</EmptyState>
          ) : (
            <div className="grid gap-3">{fresh.map((x, i) => <SignalCard key={x.setup.id} item={x} rank={i + 1} onPlan={onPlan} />)}</div>
          )}
          {running.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-paper">Already running in the backtest</h3>
              <p className="mb-3 text-[13px] text-fog">Signals from earlier candles. Entering now is usually chasing: the checks flag it when price has moved more than {0.25}R.</p>
              <div className="grid gap-3">{running.map((x, i) => <SignalCard key={x.setup.id} item={x} rank={fresh.length + i + 1} onPlan={onPlan} />)}</div>
            </div>
          )}
          {other.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-rule pt-5">
              <h3 className="text-sm font-medium text-paper">Other setups ({other.length})</h3>
              <Callout tone="warning" title="Not part of this account's plan">
                These come from playbook setups assigned to your other account, or left out of both. They passed the backtest, but their drawdowns or losing streaks
                are a poor fit for this account&apos;s limits, or taking them here would double a bet your other account already makes. If you take one, it&apos;s
                sized at {otherPct}% of the usual risk (the 8/33 EMA setups at 25%) and still counts toward your slots and daily stop. Skipping them is the plan.
              </Callout>
              <div className="grid gap-3 opacity-90">{other.map((x, i) => <SignalCard key={x.setup.id} item={x} rank={own.length + i + 1} onPlan={onPlan} />)}</div>
            </div>
          )}
          {data.errors.length > 0 && <p className="text-xs text-mist">Some data didn&apos;t load: {data.errors.slice(0, 3).join("; ")}</p>}
        </div>
      )}
    </Panel>
  );
}

/* ---------- open trades and history ---------- */

function OpenTrades({ trades, onClose, onEdit }: { trades: JournalEntry[]; onClose: (t: JournalEntry) => void; onEdit: (t: JournalEntry) => void }) {
  return (
    <Panel title="Open trades" note="Close each one with the P&L your platform shows, so costs and swap are counted.">
      {trades.length === 0 ? (
        <EmptyState>No open trades.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr><th className={thClass}>Market</th><th className={thClass}>Setup</th><th className={thClass}>Entry</th><th className={thClass}>Stop</th><th className={thClass}>Target</th><th className={thClass}>Risk</th><th className={thClass}>Opened</th><th className={thClass}><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const s = setupById(t.setupId);
                const p = (v: number | null) => (v === null ? "—" : fmtPrice(v, t.symbol));
                return (
                  <tr key={t.id}>
                    <td className={tdClass}><span className="flex flex-wrap items-center gap-1.5">{marketOf(t)} <SideTag side={t.side} /> <GradeTag grade={t.grade} />{!t.rulesFollowed && <Tag tone="loss">Rule break</Tag>}</span></td>
                    <td className={cn(tdClass, "text-fog")}>{s ? `${s.strategyName} ${s.interval}`.trim() : t.setupId}</td>
                    <td className={cn(tdClass, "tabular-nums")}>{p(t.entryPrice)}</td>
                    <td className={cn(tdClass, "tabular-nums text-loss-ink")}>{p(t.stopLoss)}</td>
                    <td className={cn(tdClass, "tabular-nums text-gain-ink")}>{p(t.takeProfit)}</td>
                    <td className={cn(tdClass, "tabular-nums")}>{usd(t.riskAmount)}</td>
                    <td className={cn(tdClass, "whitespace-nowrap text-fog")}>{when.format(t.entryTime)}</td>
                    <td className={cn(tdClass, "text-right")}><span className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => onEdit(t)}>Edit</Button><Button size="sm" onClick={() => onClose(t)}>Close</Button></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function History({ trades, onEdit }: { trades: JournalEntry[]; onEdit: (t: JournalEntry) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? trades : trades.slice(0, 15);
  const mistakeLabel = (id: string) => ({ "moved-stop": "Moved stop", "closed-early": "Closed early", "late-entry": "Late entry", oversized: "Oversized", "not-in-playbook": "Off-plan", revenge: "Revenge", news: "News" })[id] ?? id;
  return (
    <Panel title="Closed trades" note="Newest first." aside={trades.length > 15 && <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${trades.length}`}</Button>}>
      {trades.length === 0 ? (
        <EmptyState>Nothing closed yet. Every closed trade lands here with its R, and feeds the scorecard.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr><th className={thClass}>Closed</th><th className={thClass}>Market</th><th className={thClass}>Setup</th><th className={thClass}>Result</th><th className={thClass}>P&L</th><th className={thClass}>Exit</th><th className={thClass}>Discipline</th><th className={thClass}><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const s = setupById(t.setupId);
                return (
                  <tr key={t.id}>
                    <td className={cn(tdClass, "whitespace-nowrap text-fog")}>{t.exitTime ? date.format(t.exitTime) : "—"}</td>
                    <td className={tdClass}><span className="flex flex-wrap items-center gap-1.5">{marketOf(t)} <SideTag side={t.side} /> <GradeTag grade={t.grade} /></span></td>
                    <td className={cn(tdClass, "text-fog")}>{s ? `${s.strategyName} ${s.interval}`.trim() : t.setupId}</td>
                    <td className={cn(tdClass, "tabular-nums", toneClass(t.rMultiple ?? 0))}>{t.rMultiple !== null ? r(t.rMultiple) : "—"}</td>
                    <td className={cn(tdClass, "tabular-nums", toneClass(t.pnl ?? 0))}>
                      {t.pnl !== null ? money(t.pnl) : "—"}
                      {(t.commission || t.swap) ? <span className="block text-[12px] text-fog">{money((t.commission ?? 0) + (t.swap ?? 0))} fees &amp; swap</span> : null}
                    </td>
                    <td className={cn(tdClass, "capitalize text-fog")}>{t.exitReason ?? "—"}</td>
                    <td className={tdClass}>
                      <span className="flex flex-wrap gap-1">
                        {t.rulesFollowed && t.mistakes.length === 0 ? <Tag tone="gain">Clean</Tag> : null}
                        {!t.rulesFollowed && <Tag tone="loss">Rule break</Tag>}
                        {t.mistakes.map((m) => <Tag key={m} tone="fees">{mistakeLabel(m)}</Tag>)}
                      </span>
                    </td>
                    <td className={cn(tdClass, "text-right")}>
                      {t.source === "journal" ? (
                        <a href="/trades" className="text-[13px] text-fog underline-offset-2 hover:underline">From Trades page</a>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => onEdit(t)}>Review</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ---------- scorecard and discipline ---------- */

const VERDICT: Record<SetupVerdict, { label: string; tone: "neutral" | "gain" | "loss" | "fees" | "signal" }> = {
  "no-trades": { label: "No trades yet", tone: "neutral" },
  collecting: { label: "Collecting", tone: "neutral" },
  "on-track": { label: "On track", tone: "gain" },
  watch: { label: "Watch", tone: "fees" },
  pause: { label: "Pause it", tone: "loss" },
  retired: { label: "Retired", tone: "neutral" },
};

function Scorecard({ view }: { view: PlaybookView }) {
  return (
    <Panel
      title="Setup scorecard"
      note="Your live results next to the backtest, in R (profit ÷ amount risked). A setup gets 25 trades before it can be paused: losing streaks of 5 to 7 happened in every backtest and aren't a reason to quit."
    >
      <div className="relative overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Setup</th>
              <th className={thClass}>Backtest</th>
              <th className={thClass}>Live trades</th>
              <th className={thClass}>Win rate</th>
              <th className={thClass}>Avg</th>
              <th className={thClass}>Total</th>
              <th className={thClass}>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {view.scorecard.map(({ setup, live, verdict, reason }) => (
              <tr key={setup.id}>
                <td className={tdClass}>
                  <span className="text-paper">{setup.platformSymbol}</span> <span className="text-fog">{setup.strategyName} {setup.interval}</span>
                </td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums text-fog")}>{setup.baseline.winRatePct}% · {r(setup.baseline.avgR)} · PF {setup.baseline.profitFactor}</td>
                <td className={cn(tdClass, "tabular-nums")}>{live.trades}</td>
                <td className={cn(tdClass, "tabular-nums")}>{live.trades ? `${live.winRatePct.toFixed(0)}%` : "—"}</td>
                <td className={cn(tdClass, "tabular-nums", live.trades ? toneClass(live.avgR) : "text-fog")}>{live.trades ? r(live.avgR) : "—"}</td>
                <td className={cn(tdClass, "tabular-nums", live.trades ? toneClass(live.sumR) : "text-fog")}>{live.trades ? r(live.sumR) : "—"}</td>
                <td className={tdClass}>
                  <span className="flex flex-col gap-0.5">
                    <span><Tag tone={VERDICT[verdict].tone}>{VERDICT[verdict].label}</Tag></span>
                    <span className="text-xs text-mist">{reason}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Discipline({ view }: { view: PlaybookView }) {
  const { followed, broken, mistakes } = view.adherence;
  const total = followed.trades + broken.trades;
  return (
    <Panel title="Discipline" note="Clean trades followed every rule and had no mistakes. If the other group costs more, fixing habits beats changing strategies.">
      {total === 0 ? (
        <EmptyState>Shows up after your first closed trade.</EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-6">
            <Stat label={`Clean trades (${followed.trades})`} value={followed.trades ? r(followed.sumR) : "—"} note={followed.trades ? `${r(followed.avgR)} a trade, ${followed.winRatePct.toFixed(0)}% wins` : undefined} tone={followed.trades ? toneClass(followed.sumR) : undefined} />
            <Stat label={`Rule breaks or mistakes (${broken.trades})`} value={broken.trades ? r(broken.sumR) : "—"} note={broken.trades ? `${r(broken.avgR)} a trade, ${broken.winRatePct.toFixed(0)}% wins` : undefined} tone={broken.trades ? toneClass(broken.sumR) : undefined} />
          </div>
          <p className="text-[13px] text-fog">
            {Math.round((followed.trades / total) * 100)}% of your closed trades were clean.
          </p>
          {mistakes.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-paper">What mistakes cost, worst first</h3>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {mistakes.map((m) => (
                  <li key={m.id} className="flex justify-between gap-4">
                    <span className="text-paper">{m.label} <span className="text-mist">· {m.trades} trade{m.trades > 1 ? "s" : ""}</span></span>
                    <span className={cn("tabular-nums", toneClass(m.sumR))}>{r(m.sumR)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function RulesPanel({ view }: { view: PlaybookView }) {
  const k = view.rules;
  return (
    <Panel title="The rules" note="Set from a replay of two years of the original 13 setups as one account. See the Guides page for how to trade each strategy.">
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-paper marker:text-mist">
        <li>
          This account trades {view.account.setups.length} setups:{" "}
          {view.account.setups.map((a, i) => {
            const s = setupById(a.id);
            return (
              <span key={a.id}>
                {i > 0 && ", "}
                <span className="text-paper">{s ? `${s.platformSymbol} ${s.strategyName} ${s.interval}` : a.id}</span>
                {a.riskScale !== 1 && ` (at ${Math.round(a.riskScale * 100)}% of the usual risk)`}
              </span>
            );
          })}
          . Signals from the other playbook setups show under &quot;Other setups&quot; at {Math.round(OTHER_SETUP_RISK_SCALE * 100)}% risk; skipping them is the plan. A chart that looks good elsewhere is not a trade.
        </li>
        {k.riskPctB === null ? (
          <li>Risk {k.riskPctA}% ({usd((view.account.size * k.riskPctA) / 100)}) on A-grade trades only. Skip B-grade and ungraded signals: with {view.account.maxLossPct}% of total room, this account can&apos;t afford the weaker trades.</li>
        ) : (
          <li>Risk {k.riskPctA}% ({usd((view.account.size * k.riskPctA) / 100)}) on A-grade, {k.riskPctB}% ({usd((view.account.size * k.riskPctB) / 100)}) on B-grade. Skip B-grade currency trades: they lost money in the backtest.</li>
        )}
        <li>Take only trades with the strategy&apos;s own target: at least 2 : 1 reward to risk (1.5 : 1 on MACD gold).</li>
        <li>At most {k.maxOpen} trades open. BTC and ETH in the same direction are one bet, so are gold and silver, and so are currency pairs that bet the same way on the dollar.</li>
        <li>Stop for the day at {money(-(view.account.size * k.dailyStopPct) / 100)} or after {k.maxLossesPerDay} losing trades, whichever comes first. Today&apos;s losses plus the risk on open trades must never pass that stop. The firm&apos;s limit is {view.account.dailyLossPct}%, and open trades count toward it.</li>
        <li>If any account hits its daily stop, stop trading every account until the reset.</li>
        <li>Never raise risk to catch up when you&apos;re behind.</li>
        <li>Leave stops and targets where the strategy puts them. Moving them makes your results stop matching the backtest.</li>
        <li>No trades within 30 minutes of high-impact news or of the daily rollover (00:00 platform time).</li>
        <li>Judge a setup after 25 trades, not after a losing streak.</li>
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-mist">
        The setups were picked from many strategy, market and timeframe pairs, then re-tested on the platform&apos;s own bars since 2020; thirteen that failed the re-test are retired. Picking the best of many overstates the edge, so expect live results to be worse than the backtest. Check lot sizes against your platform&apos;s symbol specification. More on each strategy in the <Link href="/guides" className="underline underline-offset-4">Guides</Link>.
      </p>
    </Panel>
  );
}

/* ---------- page ---------- */

const ACCOUNT_STORAGE_KEY = "playbook-account";

export default function PlaybookBoard() {
  const [accountId, setAccountId] = useState<string>(PLAYBOOK_ACCOUNTS[0].id);
  // Remember the last account picked on this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCOUNT_STORAGE_KEY);
      if (saved && PLAYBOOK_ACCOUNTS.some((a) => a.id === saved)) setAccountId(saved);
    } catch {}
  }, []);
  const selectAccount = (id: string) => {
    setAccountId(id);
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, id);
    } catch {}
  };
  const { data: view, error, isLoading } = useQuery({
    queryKey: [...PLAYBOOK_KEY, accountId],
    queryFn: () => fetchJson<PlaybookView>(`/api/playbook?account=${encodeURIComponent(accountId)}`),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  const [plan, setPlan] = useState<PlanDefaults | null>(null);
  const [closing, setClosing] = useState<JournalEntry | null>(null);
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  if (isLoading) return <Panel title="Loading the playbook"><EmptyState>Loading your trades.</EmptyState></Panel>;
  if (error || !view) return <Callout tone="critical" title="Couldn't load the playbook">{error instanceof Error ? error.message : "Try again in a minute."}</Callout>;

  const entries = [...view.open, ...view.closed];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-fog">
          One place to run the plan: check the account, take the best signal that fits, log it with the pre-trade checks, close it with the real P&L, and let the scorecard tell you which setups and habits are paying.
        </p>
        <Button variant="primary" onClick={() => setPlan({})}><Plus size={16} aria-hidden="true" /> Plan a trade</Button>
      </div>
      <AccountSwitcher view={view} onSelect={selectAccount} />
      <AccountPanel view={view} />
      <SignalsPanel account={view.account} onPlan={setPlan} freeSlots={Math.max(0, view.rules.maxOpen - view.status.openCount)} />
      <OpenTrades trades={view.open} onClose={setClosing} onEdit={setEditing} />
      <Discipline view={view} />
      <Scorecard view={view} />
      <History trades={view.closed} onEdit={setClosing} />
      <RulesPanel view={view} />
      <PlanTradeDialog open={plan !== null} defaults={plan ?? {}} entries={entries} account={view.account} stoppedElsewhere={view.stoppedElsewhere} onClose={() => setPlan(null)} />
      <CloseTradeDialog trade={closing} onClose={() => setClosing(null)} />
      <EditTradeDialog trade={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
