"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel, money, toneClass } from "@/components/kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TradesTable from "@/components/trading-journal/TradesTable";
import { cn } from "@/lib/utils";
import type { Trade } from "@/components/trading-journal/DashboardContext";

const DAY_TITLE_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "\u2212" : "+";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

interface PnlCalendarProps {
  trades: Trade[];
  onInspect: (t: Trade) => void;
}

export default function PnlCalendar({ trades, onInspect }: PnlCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const hasAutoJumped = useRef(false);

  // Once trades first load, jump to the month of the most recent trade
  // instead of leaving the calendar on an empty current month. Only fires
  // once, so it never fights the user's own month navigation afterward.
  useEffect(() => {
    if (hasAutoJumped.current || trades.length === 0) return;
    hasAutoJumped.current = true;
    const latest = trades.reduce((max, t) => (new Date(t.time) > max ? new Date(t.time) : max), new Date(trades[0].time));
    setViewMonth(latest);
  }, [trades]);

  const dailyPnl = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>();
    for (const t of trades) {
      const d = new Date(t.time);
      const key = dayKey(d);
      const entry = map.get(key) ?? { pnl: 0, count: 0 };
      entry.pnl += t.pnl;
      entry.count += 1;
      map.set(key, entry);
    }
    return map;
  }, [trades]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ];

  const monthTotal = useMemo(() => {
    let pnl = 0;
    let tradingDays = 0;
    let greenDays = 0;
    for (let i = 1; i <= totalDays; i++) {
      const entry = dailyPnl.get(dayKey(new Date(year, month, i)));
      if (entry) {
        pnl += entry.pnl;
        tradingDays += 1;
        if (entry.pnl > 0) greenDays += 1;
      }
    }
    return { pnl, tradingDays, greenDays };
  }, [dailyPnl, year, month, totalDays]);

  const today = new Date();

  const selectedDayTrades = useMemo(() => {
    if (!selectedDay) return [];
    const key = dayKey(selectedDay);
    return trades
      .filter((t) => dayKey(new Date(t.time)) === key)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [trades, selectedDay]);

  const selectedDayPnl = selectedDayTrades.reduce((sum, t) => sum + t.pnl, 0);

  const maxAbs = Math.max(1e-9, ...[...dailyPnl.values()].map((e) => Math.abs(e.pnl)));

  return (
    <Panel
      title="Calendar"
      note={
        monthTotal.tradingDays > 0 ? (
          <>
            <span className={toneClass(monthTotal.pnl)}>{money(monthTotal.pnl)}</span> in {MONTH_LABEL.format(viewMonth)}, with{" "}
            {monthTotal.greenDays} of {monthTotal.tradingDays} trading days positive.
          </>
        ) : (
          `No trades in ${MONTH_LABEL.format(viewMonth)}.`
        )
      }
      aside={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="rounded-md p-2 text-fog transition-colors hover:bg-deck-2 hover:text-paper"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="w-28 text-center text-sm text-paper">{MONTH_LABEL.format(viewMonth)}</span>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="rounded-md p-2 text-fog transition-colors hover:bg-deck-2 hover:text-paper"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="truncate py-1 text-center text-xs text-mist">
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="h-14 sm:h-20" />;

          const entry = dailyPnl.get(dayKey(date));
          const isToday = date.toDateString() === today.toDateString();
          const strength = entry ? Math.sqrt(Math.min(1, Math.abs(entry.pnl) / maxAbs)) : 0;
          const pole = entry && entry.pnl >= 0 ? "var(--gain)" : "var(--loss)";

          return (
            <button
              type="button"
              key={date.toISOString()}
              disabled={!entry}
              onClick={() => setSelectedDay(date)}
              aria-label={
                entry
                  ? `${DAY_TITLE_FORMAT.format(date)}: ${money(entry.pnl)} across ${entry.count} trade${entry.count === 1 ? "" : "s"}`
                  : `${DAY_TITLE_FORMAT.format(date)}: no trades`
              }
              className={cn(
                "flex h-14 sm:h-20 flex-col justify-between overflow-hidden rounded-md p-1.5 text-left transition-[filter] sm:p-2",
                entry ? "cursor-pointer hover:brightness-125" : "cursor-default bg-ink/50",
                isToday && "outline outline-1 outline-signal",
              )}
              style={entry ? { background: `color-mix(in oklab, ${pole} ${Math.round(16 + strength * 54)}%, var(--deck-2))` } : undefined}
            >
              <span className={cn("text-[11px]", entry ? "text-paper/80" : "text-mist")}>{date.getDate()}</span>
              {entry && (
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-paper sm:hidden">
                    {entry.pnl < 0 ? "\u2212" : "+"}{Math.round(Math.abs(entry.pnl))}
                  </span>
                  <span className="hidden truncate text-sm font-medium text-paper sm:block">{formatCompact(entry.pnl)}</span>
                  <span className="hidden truncate text-[11px] text-paper/70 sm:block">
                    {entry.count} trade{entry.count !== 1 ? "s" : ""}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto overflow-x-hidden rounded-[12px] border border-rule bg-deck p-5 text-paper sm:max-w-6xl sm:p-7">
          <DialogHeader className="mb-3 pr-8">
            <DialogTitle className="font-display text-xl font-bold tracking-[-0.02em] text-paper">
              {selectedDay ? DAY_TITLE_FORMAT.format(selectedDay) : ""}
            </DialogTitle>
            {selectedDay && (
              <p className="text-sm text-fog">
                {selectedDayTrades.length} trade{selectedDayTrades.length !== 1 ? "s" : ""}, net{" "}
                <span className={toneClass(selectedDayPnl)}>{money(selectedDayPnl)}</span>
              </p>
            )}
          </DialogHeader>

          <div className="min-w-0">
            <TradesTable filteredTrades={selectedDayTrades} onInspect={onInspect} isFullLog hideActions timeOnly />
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
