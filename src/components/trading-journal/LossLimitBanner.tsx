"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, Settings2 } from "lucide-react";
import type { Trade } from "./DashboardContext";

interface LossLimitBannerProps {
  trades: Trade[];
}

const DAILY_KEY = "aurajournal.dailyLossLimit";
const WEEKLY_KEY = "aurajournal.weeklyLossLimit";

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function LossLimitBanner({ trades }: LossLimitBannerProps) {
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [weeklyLimit, setWeeklyLimit] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Seed limits from localStorage, defaulting to 4% / 8% of the most
  // recent known account balance on first use.
  useEffect(() => {
    const storedDaily = localStorage.getItem(DAILY_KEY);
    const storedWeekly = localStorage.getItem(WEEKLY_KEY);

    if (storedDaily && storedWeekly) {
      setDailyLimit(parseFloat(storedDaily));
      setWeeklyLimit(parseFloat(storedWeekly));
      return;
    }

    const chronTrades = [...trades].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    const latestBalance = chronTrades[0]?.balanceAfter || chronTrades[0]?.balanceBefore || 10000;
    const defaultDaily = storedDaily ? parseFloat(storedDaily) : Math.round(latestBalance * 0.04);
    const defaultWeekly = storedWeekly ? parseFloat(storedWeekly) : Math.round(latestBalance * 0.08);
    setDailyLimit(defaultDaily);
    setWeeklyLimit(defaultWeekly);
  }, [trades.length]);

  if (dailyLimit === null || weeklyLimit === null) return null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayPnl = trades
    .filter((t) => isSameLocalDay(new Date(t.time), now))
    .reduce((sum, t) => sum + t.pnl, 0);

  const weekPnl = trades
    .filter((t) => new Date(t.time) >= sevenDaysAgo)
    .reduce((sum, t) => sum + t.pnl, 0);

  const dailyBreached = dailyLimit > 0 && todayPnl <= -dailyLimit;
  const weeklyBreached = weeklyLimit > 0 && weekPnl <= -weeklyLimit;
  const dailyWarn = !dailyBreached && dailyLimit > 0 && todayPnl <= -dailyLimit * 0.8;
  const weeklyWarn = !weeklyBreached && weeklyLimit > 0 && weekPnl <= -weeklyLimit * 0.8;

  const breached = dailyBreached || weeklyBreached;
  const warning = !breached && (dailyWarn || weeklyWarn);

  const persist = (key: string, value: number) => {
    localStorage.setItem(key, value.toString());
  };

  return (
    <div
      className={`mb-8 rounded-2xl border p-5 flex flex-col gap-3 transition-all ${
        breached
          ? "bg-rose-950/40 border-rose-500/30"
          : warning
            ? "bg-amber-950/30 border-amber-500/30"
            : "bg-slate-900/40 border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {breached ? (
            <AlertTriangle className="text-rose-400 shrink-0" size={20} />
          ) : (
            <ShieldCheck className={warning ? "text-amber-400 shrink-0" : "text-emerald-400 shrink-0"} size={20} />
          )}
          <div className="text-sm">
            {breached ? (
              <span className="font-semibold text-rose-300">
                {dailyBreached ? "Daily" : "Weekly"} loss limit hit — consider stopping and reviewing before taking another trade.
              </span>
            ) : warning ? (
              <span className="font-semibold text-amber-300">Approaching your loss limit — trade carefully.</span>
            ) : (
              <span className="font-semibold text-slate-300">Within your daily and weekly loss limits.</span>
            )}
            <div className="text-xs text-slate-400 mt-0.5">
              Today: <span className={todayPnl < 0 ? "text-rose-400" : "text-emerald-400"}>{todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(2)}</span>
              {" "}/ -${dailyLimit.toFixed(0)} limit
              {"  ·  "}
              Last 7d: <span className={weekPnl < 0 ? "text-rose-400" : "text-emerald-400"}>{weekPnl >= 0 ? "+" : ""}${weekPnl.toFixed(2)}</span>
              {" "}/ -${weeklyLimit.toFixed(0)} limit
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Settings2 size={14} /> Limits
        </button>
      </div>

      {showSettings && (
        <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-800/60">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daily Loss Limit ($)</label>
            <input
              type="number"
              step="any"
              value={dailyLimit}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setDailyLimit(val);
                persist(DAILY_KEY, val);
              }}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm w-40 focus:border-violet-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Weekly Loss Limit ($)</label>
            <input
              type="number"
              step="any"
              value={weeklyLimit}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setWeeklyLimit(val);
                persist(WEEKLY_KEY, val);
              }}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm w-40 focus:border-violet-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
