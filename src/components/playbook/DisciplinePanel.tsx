"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flame, Hourglass, Minus, X } from "lucide-react";
import { Button, Callout, Panel } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import type { DayReport, DayState, RuleResult } from "@/lib/playbook/discipline";
import type { DisciplineView } from "@/lib/playbook/disciplineStore";
import { cn } from "@/lib/utils";

export const DISCIPLINE_KEY = ["playbook-discipline"] as const;

const dayName = (day: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const dayDate = (day: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

const STATE: Record<DayState, { label: string; cell: string; icon: typeof Check | null }> = {
  kept: { label: "Kept", cell: "border-gain/50 bg-gain/15 text-gain-ink", icon: Check },
  broken: { label: "Broken", cell: "border-loss/50 bg-loss/15 text-loss-ink", icon: X },
  missed: { label: "Not closed out", cell: "border-dashed border-loss/50 text-loss-ink", icon: Minus },
  open: { label: "Today", cell: "border-signal bg-signal/10 text-signal", icon: Hourglass },
  future: { label: "To come", cell: "border-rule text-mist", icon: null },
  weekend: { label: "Weekend", cell: "border-rule text-mist", icon: null },
};

function StreakHero({ view }: { view: DisciplineView }) {
  const s = view.streak;
  const lit = s.current > 0;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", lit ? "bg-fees/20 text-fees-ink" : "bg-deck-2 text-mist")}>
          <Flame size={30} aria-hidden="true" fill={lit ? "currentColor" : "none"} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[34px] font-semibold leading-none tabular-nums text-paper">
            {s.current}
            {s.atRisk && <Hourglass size={20} className="ml-2 inline align-baseline text-fees-ink" aria-label="Streak at risk" />}
          </p>
          <p className="text-[13px] text-fog">clean trading day{s.current === 1 ? "" : "s"} in a row · best {s.best}</p>
        </div>
      </div>
      <p className="text-[13px] text-paper">
        {view.closable.length === 0
          ? "Weekend: the streak waits for Monday."
          : s.todayDone
          ? "Today is closed out."
          : s.atRisk
            ? "Close out today to keep the streak going."
            : s.current === 0
              ? "Close out today with every rule kept to start a streak."
              : "Close out today to add a day."}
        {s.nextMilestone && (
          <span className="text-fog">
            {" "}{s.nextMilestone - s.current} more to {s.nextMilestone}{s.nextMilestone === 5 ? ", a full clean week" : ""}.
          </span>
        )}
      </p>
    </div>
  );
}

function WeekStrip({ week, today }: { week: DayReport[]; today: string }) {
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="This week">
      {week.slice(0, 5).map((d) => {
        const st = STATE[d.state];
        const Icon = st.icon;
        return (
          <li key={d.day} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-[8px] border px-1 py-2 text-center", st.cell, d.day === today && "ring-1 ring-signal")}>
            <span className="text-[11px] uppercase tracking-[0.06em]">{dayName(d.day)}</span>
            <span className="flex h-5 items-center">{Icon ? <Icon size={16} aria-hidden="true" /> : <span className="text-[11px]">·</span>}</span>
            <span className="truncate text-[11px] text-fog">{st.label}</span>
            <span className="sr-only">{dayDate(d.day)}: {st.label}{d.trades ? `, ${d.trades} trades` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RuleRow({ result, label, why, manual, checked, onToggle, inputId }: { result: RuleResult; label: string; why: string; manual: boolean; checked: boolean; onToggle: () => void; inputId: string }) {
  const broken = !manual && result.status === "broken";
  return (
    <li className="flex items-start gap-3 border-t border-rule py-2.5 first:border-t-0">
      {manual ? (
        <input id={inputId} type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 size-4 shrink-0 accent-[var(--signal)]" />
      ) : (
        <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", broken ? "bg-loss/20 text-loss-ink" : "bg-gain/20 text-gain-ink")} aria-hidden="true">
          {broken ? <X size={11} /> : <Check size={11} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <label htmlFor={manual ? inputId : undefined} className={cn("block text-sm", broken ? "text-loss-ink" : "text-paper")}>
          {label}
          {!manual && <span className="sr-only">: {broken ? "broken" : "kept"}</span>}
        </label>
        <p className="text-[12px] leading-snug text-mist">{manual ? why : result.detail}</p>
      </div>
      {!manual && <span className="shrink-0 text-[11px] text-mist">auto</span>}
    </li>
  );
}

function CloseOut({ view }: { view: DisciplineView }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(view.closable[0]);
  const report = view.closableDays.find((d) => d.day === day) ?? view.closableDays[0];
  const manualIds = report.rules.filter((r) => view.rules.find((x) => x.id === r.id)?.kind === "manual");
  const [ticks, setTicks] = useState<Set<string>>(new Set(manualIds.filter((r) => r.status === "kept").map((r) => r.id)));
  // Reset the ticks when switching days or after the server answers.
  const key = `${report.day}:${manualIds.map((r) => r.id + r.status).join(",")}`;
  useEffect(() => {
    setTicks(new Set(manualIds.filter((r) => r.status === "kept").map((r) => r.id)));
  }, [key]);
  useEffect(() => {
    if (!view.closable.includes(day)) setDay(view.closable[0]);
  }, [view.closable, day]);

  const save = useMutation({
    mutationFn: () => fetchJson<DisciplineView>("/api/playbook/discipline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: report.day, kept: [...ticks] }) }),
    onSuccess: (next) => qc.setQueryData(DISCIPLINE_KEY, next),
  });

  const autoBroken = report.rules.some((r) => view.rules.find((x) => x.id === r.id)?.kind === "auto" && r.status === "broken");
  const allTicked = manualIds.every((r) => ticks.has(r.id));
  const isToday = report.day === view.today;
  const name = isToday ? "today" : dayName(report.day, "long");

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-paper">
          Close out {isToday ? "today" : name} <span className="text-fog">· {dayDate(report.day)} · {report.trades} trade{report.trades === 1 ? "" : "s"}</span>
        </h3>
        {view.closable.length > 1 && (
          <div className="flex gap-1" role="group" aria-label="Day to close out">
            {view.closable.map((d) => (
              <Button key={d} size="sm" variant={d === report.day ? "primary" : "ghost"} onClick={() => setDay(d)}>
                {d === view.today ? "Today" : dayName(d)}
              </Button>
            ))}
          </div>
        )}
      </div>
      <ul className="flex flex-col">
        {report.rules.map((res) => {
          const rule = view.rules.find((x) => x.id === res.id)!;
          const manual = rule.kind === "manual";
          return (
            <RuleRow
              key={res.id}
              inputId={`dr-${report.day}-${res.id}`}
              result={res}
              label={rule.label}
              why={rule.why}
              manual={manual}
              checked={ticks.has(res.id)}
              onToggle={() => setTicks((t) => { const n = new Set(t); if (n.has(res.id)) n.delete(res.id); else n.add(res.id); return n; })}
            />
          );
        })}
      </ul>
      {autoBroken && (
        <p className="text-[13px] text-loss-ink">A rule was broken {isToday ? "today" : `on ${name}`}, so this day won&apos;t count toward the streak. Closing it out still keeps the record honest.</p>
      )}
      {save.error && <p className="text-[13px] text-loss-ink">{save.error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : report.checkedIn ? "Update close-out" : `Close out ${isToday ? "today" : name}`}
        </Button>
        {!autoBroken && !allTicked && <span className="text-[12px] text-mist">Untick a rule only if you broke it: the day then won&apos;t count.</span>}
        {report.checkedIn && <span className="text-[12px] text-gain-ink">Closed out</span>}
      </div>
    </div>
  );
}

export default function DisciplinePanel() {
  const { data: view, error, isLoading } = useQuery({
    queryKey: DISCIPLINE_KEY,
    queryFn: () => fetchJson<DisciplineView>("/api/playbook/discipline"),
    refetchInterval: 60_000,
  });
  if (isLoading) return null;
  if (error || !view) return <Callout tone="critical" title="Couldn't load the discipline streak">{error instanceof Error ? error.message : "Try again in a minute."}</Callout>;

  return (
    <Panel
      title="Discipline streak"
      note={`Week of ${dayDate(view.weekPlan.weekOf)}. Most rules are checked against your journal; tick the rest and close out each trading day. A day counts only when every rule was kept.`}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <StreakHero view={view} />
          <WeekStrip week={view.week} today={view.today} />
          <div>
            <h3 className="mb-2 text-sm font-medium text-paper">This week&apos;s goals</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-paper marker:text-mist">
              {view.weekPlan.goals.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        </div>
        {view.closable.length ? (
          <CloseOut key={view.closable.join(",")} view={view} />
        ) : (
          <div className="flex min-w-0 flex-col gap-2 rounded-[8px] border border-rule bg-deck-2 p-4">
            <h3 className="text-sm font-medium text-paper">Weekend: nothing to close out</h3>
            <p className="text-[13px] leading-relaxed text-fog">Weekends without trades don&apos;t count and don&apos;t break the streak. The checklist opens on Monday; close out each trading day before you log off.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
