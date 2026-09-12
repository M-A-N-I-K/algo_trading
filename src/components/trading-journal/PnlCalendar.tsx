"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
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
  const sign = n < 0 ? "-" : "+";
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

  return (
    <Card className="glass border-slate-800 p-4 sm:p-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h3 className="font-Outfit text-lg font-semibold text-white">Monthly P&amp;L Calendar</h3>
          <p className="text-xs text-slate-400 mt-1">
            {monthTotal.tradingDays > 0 ? (
              <>
                <span className={monthTotal.pnl >= 0 ? "text-emerald-400" : "text-rose-500"}>
                  {monthTotal.pnl >= 0 ? "+" : ""}${monthTotal.pnl.toFixed(2)}
                </span>{" "}
                this month &middot; {monthTotal.greenDays}/{monthTotal.tradingDays} green days
              </>
            ) : (
              "No trades this month"
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-white w-32 text-center">{MONTH_LABEL.format(viewMonth)}</span>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1 sm:mb-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[9px] sm:text-[10px] font-semibold text-slate-500 uppercase py-1 truncate">
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="aspect-square" />;

          const entry = dailyPnl.get(dayKey(date));
          const isToday = date.toDateString() === today.toDateString();
          const isProfit = entry && entry.pnl > 0;
          const isLoss = entry && entry.pnl < 0;

          return (
            <button
              type="button"
              key={date.toISOString()}
              disabled={!entry}
              onClick={() => setSelectedDay(date)}
              className={cn(
                "aspect-square rounded-lg sm:rounded-xl border p-1 sm:p-2 flex flex-col justify-between transition-colors text-left overflow-hidden",
                isProfit && "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 cursor-pointer",
                isLoss && "bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/20 cursor-pointer",
                !entry && "bg-slate-900/40 border-slate-800 cursor-default",
                isToday && "ring-1 ring-violet-500/60",
              )}
            >
              <span className={cn("text-[9px] sm:text-[11px] font-semibold", entry ? "text-slate-300" : "text-slate-600")}>
                {date.getDate()}
              </span>
              {entry && (
                <div className="flex flex-col min-w-0">
                  <span className={cn("text-[9px] sm:text-xs font-bold truncate", isProfit ? "text-emerald-400" : "text-rose-500")}>
                    {formatCompact(entry.pnl)}
                  </span>
                  <span className="hidden sm:block text-[10px] text-slate-500 truncate">
                    {entry.count} trade{entry.count !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl bg-slate-950 border border-slate-800 text-slate-200 p-4 sm:p-6 md:p-8 rounded-2xl overflow-y-auto overflow-x-hidden max-h-[90vh]">
          <DialogHeader className="mb-4 pr-8">
            <DialogTitle className="font-Outfit text-lg sm:text-xl font-bold text-white tracking-tight">
              {selectedDay ? DAY_TITLE_FORMAT.format(selectedDay) : ""}
            </DialogTitle>
            {selectedDay && (
              <p className="text-xs sm:text-sm text-slate-400">
                {selectedDayTrades.length} trade{selectedDayTrades.length !== 1 ? "s" : ""} &middot; Net{" "}
                <span className={selectedDayPnl >= 0 ? "text-emerald-400 font-semibold" : "text-rose-500 font-semibold"}>
                  {selectedDayPnl >= 0 ? "+" : ""}${selectedDayPnl.toFixed(2)}
                </span>
              </p>
            )}
          </DialogHeader>

          <div className="min-w-0">
            <TradesTable
              filteredTrades={selectedDayTrades}
              symbols={[]}
              onInspect={onInspect}
              isFullLog={false}
              hideActions
              timeOnly
            />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
