import { prisma } from "@/lib/db";
import { appError } from "@/lib/errors";
import { DISCIPLINE_RULES, WEEK_PLAN, dayReport, isWeekday, mondayOf, rulesForDay, shiftDay, streakOf, type CheckIn, type DayReport, type DisciplineRule, type Streak } from "./discipline";
import { platformDay } from "./rules";
import { loadAccounts, loadEntries } from "./store";

export interface DisciplineView {
  today: string;
  rules: DisciplineRule[];
  weekPlan: typeof WEEK_PLAN;
  week: DayReport[]; // Monday to Friday of the current week (plus weekend days that had trades)
  streak: Streak;
  // Days that can still be closed out: today (a weekday, or a weekend day with trades), and the last trading day if it wasn't.
  closable: string[];
  closableDays: DayReport[];
}

export async function disciplineView(userId: string, now = Date.now()): Promise<DisciplineView> {
  const [entries, accounts, rows] = await Promise.all([
    loadEntries(userId),
    loadAccounts(userId),
    prisma.playbookCheckIn.findMany({ where: { userId }, orderBy: { day: "asc" } }),
  ]);
  const today = platformDay(now, accounts[0].timeZone);
  const checkIns = new Map<string, CheckIn>(rows.map((r) => [r.day, { day: r.day, kept: r.kept }]));
  const firstDay = rows[0]?.day ?? null;

  const reports = new Map<string, DayReport>();
  const report = (day: string) => {
    let r = reports.get(day);
    if (!r) reports.set(day, (r = dayReport(day, today, entries, accounts, checkIns.get(day))));
    return r;
  };
  if (firstDay) for (let d = firstDay; d <= today; d = shiftDay(d, 1)) report(d);

  const monday = mondayOf(today);
  const week: DayReport[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDay(monday, i);
    const r = report(d);
    if (i < 5 || r.trades > 0 || r.checkedIn) week.push(r);
  }

  // Weekend days only need closing out when something was traded.
  const closable = isWeekday(today) || report(today).trades > 0 ? [today] : [];
  let prev = shiftDay(today, -1);
  while (!isWeekday(prev) && report(prev).trades === 0) prev = shiftDay(prev, -1);
  if (firstDay && prev >= firstDay && !checkIns.has(prev)) closable.push(prev);

  return { today, rules: [...DISCIPLINE_RULES], weekPlan: WEEK_PLAN, week, streak: streakOf(reports, today, firstDay), closable, closableDays: closable.map(report) };
}

type Body = Record<string, unknown>;

/** Closes out a day: stores which manual rules were kept. Only today or the last unclosed trading day. */
export async function closeOutDay(userId: string, body: Body, now = Date.now()): Promise<DisciplineView> {
  const view = await disciplineView(userId, now);
  const day = typeof body.day === "string" ? body.day : view.today;
  if (!view.closable.includes(day)) throw appError("INVALID_INPUT", "You can close out today, or the last trading day if you missed it.");
  const allowed = new Set(rulesForDay(day).filter((r) => r.kind === "manual").map((r) => r.id));
  const kept = Array.isArray(body.kept) ? [...new Set((body.kept as unknown[]).map(String))].filter((id) => allowed.has(id)) : [];
  await prisma.playbookCheckIn.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, kept },
    update: { kept },
  });
  return disciplineView(userId, now);
}
