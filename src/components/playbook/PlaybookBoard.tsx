"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button, Callout, EmptyState, Panel, Stat, Tag, money, signedNumber, tableClass, tdClass, thClass, toneClass } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import { setupById } from "@/lib/playbook/config";
import type { JournalEntry, RankedSignal, SetupVerdict } from "@/lib/playbook/rules";
import type { PlaybookView } from "@/lib/playbook/store";
import { fmtPrice } from "@/lib/plan/weeklyPlan";
import { cn } from "@/lib/utils";
import { CloseTradeDialog, PLAYBOOK_KEY, PLAYBOOK_SIGNALS_KEY, PlanTradeDialog, type PlanDefaults } from "./TradeDialogs";

interface SignalsResponse {
  asOf: number;
  signals: RankedSignal[];
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
function GradeTag({ grade }: { grade: "A" | "B" | null | undefined }) {
  return grade ? <Tag tone={grade === "A" ? "signal" : "neutral"}>{grade}-grade</Tag> : <Tag>No grade</Tag>;
}

/* ---------- account ---------- */

function AccountPanel({ view }: { view: PlaybookView }) {
  const s = view.status;
  const room = s.roomToFloor;
  const floorSpan = s.size - s.floor;
  const todayLeft = s.ownDailyStop + s.todayPnl;
  return (
    <Panel
      title={view.account.name}
      note={`$${s.size.toLocaleString()} account. Equity may never touch ${usd(s.floor)} (12% below the start, it never moves) or lose ${view.account.dailyLossPct}% in a day. Counts only trades logged here.`}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-5">
        <div>
          <Stat label="Balance" value={usd(s.balance)} note={`${money(s.closedPnl)} closed`} tone={toneClass(s.closedPnl) === "text-fog" ? undefined : toneClass(s.closedPnl)} />
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
      {s.dailyStopHit && (
        <Callout tone="critical" title="Daily stop hit" className="mt-5">
          You&apos;re down {usd(-s.todayPnl)} today. No more trades until the firm&apos;s day resets at 00:00 platform time.
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
  const { setup, signal: s, sizing, checks } = item;
  const price = (v: number | null) => (v === null ? "—" : fmtPrice(v, setup.symbol));
  const blockers = checks.filter((c) => c.hard && c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn" && c.id !== "grade");
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-rule bg-ink/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-mist">#{rank}</span>
          <h3 className="font-display text-[17px] font-semibold text-paper">{setup.platformSymbol}</h3>
          <SideTag side={s.side} />
          <GradeTag grade={s.grade} />
          {s.status === "new" ? <Tag tone="fees">New</Tag> : <Tag>Running {s.rMultiple !== null ? r(s.rMultiple) : ""}</Tag>}
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
        <div><dt className="text-mist">Size</dt><dd className="tabular-nums text-paper">{sizing ? `${sizing.lots} lot · ${usd(sizing.riskAtLots)}` : "—"}</dd></div>
      </dl>
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

function SignalsPanel({ onPlan, freeSlots }: { onPlan: (d: PlanDefaults) => void; freeSlots: number }) {
  const { data, error, isLoading } = useQuery({
    queryKey: PLAYBOOK_SIGNALS_KEY,
    queryFn: () => fetchJson<SignalsResponse>("/api/playbook/signals"),
    refetchInterval: 60_000,
  });
  const fresh = data?.signals.filter((x) => x.signal.status === "new") ?? [];
  const running = data?.signals.filter((x) => x.signal.status === "open") ?? [];
  return (
    <Panel
      title="Today's signals"
      note={`Only the 13 playbook setups, best first: new before running, A-grade before B, then the setup with the higher backtest average. ${freeSlots > 0 ? `You have ${freeSlots} free slot${freeSlots > 1 ? "s" : ""}: take from the top.` : "All slots are full."}`}
      aside={data && <span className="text-xs text-mist">Checked {when.format(data.asOf)}, every minute</span>}
    >
      {isLoading ? (
        <EmptyState>Scanning the 13 setups. The first scan after a restart downloads two years of candles and can take a minute.</EmptyState>
      ) : error || !data ? (
        <Callout tone="critical" title="Couldn't scan">{error instanceof Error ? error.message : "Try again in a minute."}</Callout>
      ) : (
        <div className="flex flex-col gap-5">
          {fresh.length === 0 ? (
            <EmptyState>No new signal right now. Across all 13 setups expect about 4 to 5 a week, so most hours have none: that&apos;s normal, not a reason to look elsewhere.</EmptyState>
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
          {data.errors.length > 0 && <p className="text-xs text-mist">Some data didn&apos;t load: {data.errors.slice(0, 3).join("; ")}</p>}
        </div>
      )}
    </Panel>
  );
}

/* ---------- open trades and history ---------- */

function OpenTrades({ trades, onClose }: { trades: JournalEntry[]; onClose: (t: JournalEntry) => void }) {
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
                    <td className={cn(tdClass, "text-fog")}>{s ? `${s.strategyName} ${s.interval}` : t.setupId}</td>
                    <td className={cn(tdClass, "tabular-nums")}>{p(t.entryPrice)}</td>
                    <td className={cn(tdClass, "tabular-nums text-loss-ink")}>{p(t.stopLoss)}</td>
                    <td className={cn(tdClass, "tabular-nums text-gain-ink")}>{p(t.takeProfit)}</td>
                    <td className={cn(tdClass, "tabular-nums")}>{usd(t.riskAmount)}</td>
                    <td className={cn(tdClass, "whitespace-nowrap text-fog")}>{when.format(t.entryTime)}</td>
                    <td className={cn(tdClass, "text-right")}><Button size="sm" onClick={() => onClose(t)}>Close</Button></td>
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
                    <td className={cn(tdClass, "text-fog")}>{s ? `${s.strategyName} ${s.interval}` : t.setupId}</td>
                    <td className={cn(tdClass, "tabular-nums", toneClass(t.rMultiple ?? 0))}>{t.rMultiple !== null ? r(t.rMultiple) : "—"}</td>
                    <td className={cn(tdClass, "tabular-nums", toneClass(t.pnl ?? 0))}>{t.pnl !== null ? money(t.pnl) : "—"}</td>
                    <td className={cn(tdClass, "capitalize text-fog")}>{t.exitReason ?? "—"}</td>
                    <td className={tdClass}>
                      <span className="flex flex-wrap gap-1">
                        {t.rulesFollowed && t.mistakes.length === 0 ? <Tag tone="gain">Clean</Tag> : null}
                        {!t.rulesFollowed && <Tag tone="loss">Rule break</Tag>}
                        {t.mistakes.map((m) => <Tag key={m} tone="fees">{mistakeLabel(m)}</Tag>)}
                      </span>
                    </td>
                    <td className={cn(tdClass, "text-right")}><Button size="sm" variant="ghost" onClick={() => onEdit(t)}>Review</Button></td>
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
    <Panel title="The rules" note="Set from a replay of two years of these 13 setups as one account. See the Guides page for how to trade each strategy.">
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-paper marker:text-mist">
        <li>Only the 13 setups on this page. A chart that looks good elsewhere is not a trade.</li>
        <li>Risk {k.riskPctA}% ({usd((view.account.size * k.riskPctA) / 100)}) on A-grade, {k.riskPctB}% on B-grade. Skip B-grade currency trades: they lost money in the backtest.</li>
        <li>At most {k.maxOpen} trades open. BTC and ETH in the same direction are one bet, so are gold and silver, and so are currency pairs that bet the same way on the dollar.</li>
        <li>Stop for the day at {money(-(view.account.size * k.dailyStopPct) / 100)}. The firm&apos;s limit is {view.account.dailyLossPct}%, and open trades count toward it.</li>
        <li>Leave stops and targets where the strategy puts them. Moving them makes your results stop matching the backtest.</li>
        <li>No trades within 30 minutes of high-impact news or of the daily rollover (00:00 platform time).</li>
        <li>Judge a setup after 25 trades, not after a losing streak.</li>
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-mist">
        The setups were picked as the best of about 174 strategy, market and timeframe pairs over the same two years they were tested on, so expect live results to be worse than the backtest. Gold has 11 months of data and silver 10. Check lot sizes against your platform&apos;s symbol specification. More on each strategy in the <Link href="/guides" className="underline underline-offset-4">Guides</Link>.
      </p>
    </Panel>
  );
}

/* ---------- page ---------- */

export default function PlaybookBoard() {
  const { data: view, error, isLoading } = useQuery({
    queryKey: PLAYBOOK_KEY,
    queryFn: () => fetchJson<PlaybookView>("/api/playbook"),
    refetchInterval: 60_000,
  });
  const [plan, setPlan] = useState<PlanDefaults | null>(null);
  const [closing, setClosing] = useState<JournalEntry | null>(null);

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
      <AccountPanel view={view} />
      <SignalsPanel onPlan={setPlan} freeSlots={Math.max(0, view.rules.maxOpen - view.status.openCount)} />
      <OpenTrades trades={view.open} onClose={setClosing} />
      <Discipline view={view} />
      <Scorecard view={view} />
      <History trades={view.closed} onEdit={setClosing} />
      <RulesPanel view={view} />
      <PlanTradeDialog open={plan !== null} defaults={plan ?? {}} entries={entries} onClose={() => setPlan(null)} />
      <CloseTradeDialog trade={closing} onClose={() => setClosing(null)} />
    </div>
  );
}
