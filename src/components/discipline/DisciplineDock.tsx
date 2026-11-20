"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Check, Flame, Hourglass, Minus, X } from "lucide-react";
import { Button } from "@/components/kit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchJson } from "@/lib/apiClient";
import type { DayReport, DayState, RuleResult } from "@/lib/playbook/discipline";
import type { DisciplineView } from "@/lib/playbook/disciplineStore";
import { cn } from "@/lib/utils";

// The discipline streak and the day's checklist, on every page: a streak
// block in the sidebar (a chip in the mobile top bar) opens a drawer with
// today's rules and the close-out. The D key opens it too.

export const DISCIPLINE_KEY = ["playbook-discipline"] as const;

export function useDisciplineView() {
  return useQuery({
    queryKey: DISCIPLINE_KEY,
    queryFn: () => fetchJson<DisciplineView>("/api/playbook/discipline"),
    refetchInterval: 60_000,
  });
}

const DockContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export const useDisciplineDock = () => useContext(DockContext);

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function DisciplineProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const signedIn = useSession().status === "authenticated";
  useEffect(() => {
    if (!signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]') && !open) return; // another dialog is up
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, signedIn]);
  return (
    <DockContext.Provider value={{ open, setOpen }}>
      {children}
      {signedIn && <DisciplineDrawer />}
    </DockContext.Provider>
  );
}

/* ---------- shared bits ---------- */

const dayName = (day: string, style: "short" | "long" | "narrow" = "short") =>
  new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const dayDate = (day: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

const STATE: Record<DayState, { label: string; cell: string; dot: string; icon: typeof Check | null }> = {
  kept: { label: "Kept", cell: "border-gain/50 bg-gain/15 text-gain-ink", dot: "bg-gain", icon: Check },
  broken: { label: "Broken", cell: "border-loss/50 bg-loss/15 text-loss-ink", dot: "bg-loss", icon: X },
  missed: { label: "Not closed", cell: "border-dashed border-loss/50 text-loss-ink", dot: "border border-dashed border-loss bg-transparent", icon: Minus },
  open: { label: "Today", cell: "border-signal bg-signal/10 text-signal", dot: "bg-signal", icon: Hourglass },
  future: { label: "To come", cell: "border-rule text-mist", dot: "bg-deck-2", icon: null },
  weekend: { label: "Weekend", cell: "border-rule text-mist", dot: "bg-deck-2", icon: null },
};

/** Where today stands, in a few words, for the sidebar and the drawer. */
function todayStatus(view: DisciplineView): { text: string; tone: string } {
  const today = view.closableDays.find((d) => d.day === view.today);
  if (!today) return { text: "Weekend: nothing to close out", tone: "text-mist" };
  const autoBroken = today.rules.some((r) => r.status === "broken" && view.rules.find((x) => x.id === r.id)?.kind === "auto");
  if (autoBroken) return { text: "A rule broke today", tone: "text-loss-ink" };
  if (today.checkedIn) return { text: "Today is closed out", tone: "text-gain-ink" };
  const toTick = view.rules.filter((r) => r.kind === "manual" && today.rules.some((x) => x.id === r.id)).length;
  return { text: `Close out today: ${toTick} to tick`, tone: view.streak.atRisk ? "text-fees-ink" : "text-signal" };
}

/* ---------- triggers ---------- */

/** The streak in the sidebar: flame and count, this week as five dots, and today's status. */
export function StreakButton({ variant }: { variant: "sidebar" | "chip" }) {
  const { data: view } = useDisciplineView();
  const { setOpen } = useDisciplineDock();
  const n = view?.streak.current ?? 0;
  const lit = n > 0;

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm tabular-nums", lit ? "border-fees/40 text-fees-ink" : "border-rule text-fog")}
        aria-label={`Discipline: ${n}-day streak. Open today's checklist`}
      >
        <Flame size={15} aria-hidden="true" fill={lit ? "currentColor" : "none"} />
        {n}
        {view?.streak.atRisk && <Hourglass size={13} aria-hidden="true" />}
      </button>
    );
  }

  const status = view ? todayStatus(view) : null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group flex w-full flex-col gap-2.5 rounded-[10px] border border-rule bg-deck px-3 py-3 text-left transition-colors hover:border-mist focus-visible:outline-2 focus-visible:outline-signal"
      aria-label="Open the discipline checklist"
    >
      <span className="flex items-center gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", lit ? "bg-fees/20 text-fees-ink" : "bg-deck-2 text-mist")}>
          <Flame size={17} aria-hidden="true" fill={lit ? "currentColor" : "none"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-semibold leading-tight tabular-nums text-paper">
            {n} day{n === 1 ? "" : "s"} clean
          </span>
          <span className="block text-[11px] text-mist">Best {view?.streak.best ?? 0}</span>
        </span>
        <kbd className="hidden rounded border border-rule px-1.5 text-[11px] text-mist group-hover:text-fog md:inline">D</kbd>
      </span>
      {view && (
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {view.week.slice(0, 5).map((d) => (
            <span key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <span className={cn("h-1.5 w-full rounded-full", STATE[d.state].dot)} />
              <span className={cn("text-[10px]", d.day === view.today ? "text-paper" : "text-mist")}>{dayName(d.day, "narrow")}</span>
            </span>
          ))}
        </span>
      )}
      {status && <span className={cn("text-xs", status.tone)}>{status.text}</span>}
    </button>
  );
}

/* ---------- drawer ---------- */

function WeekStrip({ week, today }: { week: DayReport[]; today: string }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="This week">
      {week.slice(0, 5).map((d) => {
        const st = STATE[d.state];
        const Icon = st.icon;
        return (
          <li key={d.day} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-[8px] border px-1 py-2 text-center", st.cell, d.day === today && "ring-1 ring-signal")}>
            <span className="text-[11px]">{dayName(d.day)}</span>
            <span className="flex h-5 items-center">{Icon ? <Icon size={16} aria-hidden="true" /> : <span className="text-[11px]">·</span>}</span>
            <span className="truncate text-[10px] text-fog">{d.trades ? `${d.trades} trade${d.trades === 1 ? "" : "s"}` : st.label}</span>
            <span className="sr-only">{dayDate(d.day)}: {st.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RuleRow({ result, label, why, manual, checked, onToggle, inputId }: { result: RuleResult; label: string; why: string; manual: boolean; checked: boolean; onToggle: () => void; inputId: string }) {
  const broken = !manual && result.status === "broken";
  return (
    <li className={cn("flex items-start gap-3 rounded-[8px] px-3 py-2.5", broken ? "bg-loss/[0.08]" : manual ? "bg-deck-2/60" : "")}>
      {manual ? (
        <input id={inputId} type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--gain)]" />
      ) : (
        <span className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full", broken ? "bg-loss/25 text-loss-ink" : "bg-gain/20 text-gain-ink")} aria-hidden="true">
          {broken ? <X size={12} /> : <Check size={12} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <label htmlFor={manual ? inputId : undefined} className={cn("block text-sm leading-snug", manual && "cursor-pointer", broken ? "text-loss-ink" : "text-paper")}>
          {label}
          {!manual && <span className="sr-only">: {broken ? "broken" : "kept so far"}</span>}
        </label>
        <p className="mt-0.5 text-[12px] leading-snug text-mist">{manual ? why : result.detail}</p>
      </div>
    </li>
  );
}

function CloseOut({ view }: { view: DisciplineView }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(view.closable[0]);
  const report = view.closableDays.find((d) => d.day === day) ?? view.closableDays[0];
  const kindOf = (id: string) => view.rules.find((x) => x.id === id)?.kind;
  const manual = report.rules.filter((r) => kindOf(r.id) === "manual");
  const auto = report.rules.filter((r) => kindOf(r.id) === "auto");
  const [ticks, setTicks] = useState<Set<string>>(new Set(manual.filter((r) => r.status === "kept").map((r) => r.id)));
  // Reset the ticks when switching days or after the server answers.
  const key = `${report.day}:${manual.map((r) => r.id + r.status).join(",")}`;
  useEffect(() => {
    setTicks(new Set(manual.filter((r) => r.status === "kept").map((r) => r.id)));
  }, [key]);
  useEffect(() => {
    if (!view.closable.includes(day)) setDay(view.closable[0]);
  }, [view.closable, day]);

  const save = useMutation({
    mutationFn: () => fetchJson<DisciplineView>("/api/playbook/discipline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: report.day, kept: [...ticks] }) }),
    onSuccess: (next) => qc.setQueryData(DISCIPLINE_KEY, next),
  });

  const autoBroken = auto.filter((r) => r.status === "broken");
  const allTicked = manual.every((r) => ticks.has(r.id));
  const isToday = report.day === view.today;
  const name = isToday ? "today" : dayName(report.day, "long");
  const row = (res: RuleResult) => {
    const rule = view.rules.find((x) => x.id === res.id)!;
    return (
      <RuleRow
        key={res.id}
        inputId={`dr-${report.day}-${res.id}`}
        result={res}
        label={rule.label}
        why={rule.why}
        manual={rule.kind === "manual"}
        checked={ticks.has(res.id)}
        onToggle={() => setTicks((t) => { const n = new Set(t); if (n.has(res.id)) n.delete(res.id); else n.add(res.id); return n; })}
      />
    );
  };

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="closeout-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="closeout-title" className="font-display text-lg font-semibold text-paper">
          {isToday ? "Today" : dayName(report.day, "long")}, {dayDate(report.day)}
        </h3>
        <span className="text-[13px] text-fog">{report.trades} trade{report.trades === 1 ? "" : "s"} logged</span>
      </div>
      {view.closable.length > 1 && (
        <div className="flex gap-1" role="group" aria-label="Day to close out">
          {view.closable.map((d) => (
            <Button key={d} size="sm" variant={d === report.day ? "primary" : "ghost"} onClick={() => setDay(d)}>
              {d === view.today ? "Today" : dayName(d)}
            </Button>
          ))}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] text-fog">Checked against your journal</p>
        <ul className="flex flex-col gap-1">{auto.map(row)}</ul>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] text-fog">Tick what you kept</p>
        <ul className="flex flex-col gap-1">{manual.map(row)}</ul>
      </div>

      {autoBroken.length > 0 && (
        <p className="text-[13px] leading-snug text-loss-ink">
          {autoBroken.length === 1 ? "A rule" : `${autoBroken.length} rules`} broke {isToday ? "today" : `on ${name}`}, so this day won&apos;t count toward the streak. Close it out anyway: the record stays honest.
        </p>
      )}
      {save.error && <p className="text-[13px] text-loss-ink">{save.error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : report.checkedIn ? "Update close-out" : `Close out ${name}`}
        </Button>
        {report.checkedIn && !save.isPending && <span className="flex items-center gap-1 text-[13px] text-gain-ink"><Check size={14} aria-hidden="true" /> Closed out</span>}
      </div>
      {autoBroken.length === 0 && !allTicked && <p className="text-[12px] text-mist">Leave a box empty only if you broke that rule. The day then won&apos;t count.</p>}
    </section>
  );
}

function DisciplineDrawer() {
  const { open, setOpen } = useDisciplineDock();
  const { data: view, error } = useDisciplineView();
  const s = view?.streak;
  const lit = (s?.current ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex h-full !w-[460px] !max-w-[100vw] flex-col gap-0 border-l border-rule bg-ink p-0 text-paper">
        <SheetHeader className="border-b border-rule px-5 pb-5 pt-6">
          <SheetTitle className="sr-only">Discipline</SheetTitle>
          <SheetDescription className="sr-only">Your streak and today&apos;s checklist</SheetDescription>
          {s && (
            <div className="flex items-center gap-4 pr-8">
              <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", lit ? "bg-fees/20 text-fees-ink" : "bg-deck-2 text-mist")}>
                <Flame size={30} aria-hidden="true" fill={lit ? "currentColor" : "none"} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-paper">{s.current}</p>
                <p className="mt-1 text-[13px] text-fog">
                  clean trading day{s.current === 1 ? "" : "s"} in a row, best {s.best}
                  {s.nextMilestone ? `. ${s.nextMilestone - s.current} more to ${s.nextMilestone}.` : "."}
                </p>
              </div>
            </div>
          )}
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {error && <p className="text-[13px] text-loss-ink">Couldn&apos;t load the checklist: {error.message}</p>}
          {view && (
            <>
              <WeekStrip week={view.week} today={view.today} />
              {view.closable.length ? (
                <CloseOut key={view.closable.join(",")} view={view} />
              ) : (
                <div className="rounded-[10px] border border-rule bg-deck p-4">
                  <h3 className="text-sm font-medium text-paper">Weekend: nothing to close out</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-fog">Weekends without trades don&apos;t count and don&apos;t break the streak. The checklist opens again on Monday.</p>
                </div>
              )}
              <section className="border-t border-rule pt-5">
                <h3 className="text-sm font-medium text-paper">This week&apos;s goals</h3>
                <p className="mb-2 text-xs text-mist">Week of {dayDate(view.weekPlan.weekOf)}</p>
                <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-fog marker:text-mist">
                  {view.weekPlan.goals.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </section>
            </>
          )}
        </div>
        <p className="border-t border-rule px-5 py-3 text-[11px] text-mist">Press D on any page to open or close this.</p>
      </SheetContent>
    </Sheet>
  );
}
