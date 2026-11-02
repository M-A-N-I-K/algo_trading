"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button, Callout, Field, TextInput, money } from "@/components/kit";
import type { Trade } from "./DashboardContext";
import { useDashboard } from "./DashboardContext";

interface LossLimitBannerProps {
  trades: Trade[];
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function LossLimitBanner({ trades }: LossLimitBannerProps) {
  const { dailyLossLimit, weeklyLossLimit, updateLossLimits, coindcxBalance } = useDashboard();
  const [showSettings, setShowSettings] = useState(false);
  const [dailyInput, setDailyInput] = useState("");
  const [weeklyInput, setWeeklyInput] = useState("");

  // Falls back to 4%/8% of a reference balance until the user sets explicit
  // values from Settings (DB-backed, so they persist across devices — this
  // used to live in localStorage only). The reference balance prefers the
  // last-synced real CoinDCX account balance over inferring one from trade
  // history, so the auto-calculated limits track actual account size.
  const chronTrades = [...trades].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const tradeDerivedBalance = chronTrades[0]?.balanceAfter || chronTrades[0]?.balanceBefore || 10000;
  const usingSyncedBalance = coindcxBalance != null;
  const referenceBalance = coindcxBalance ?? tradeDerivedBalance;
  const dailyLimit = dailyLossLimit ?? Math.round(referenceBalance * 0.04);
  const weeklyLimit = weeklyLossLimit ?? Math.round(referenceBalance * 0.08);
  const usingAutoLimits = dailyLossLimit == null || weeklyLossLimit == null;

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

  const openSettings = () => {
    setDailyInput(dailyLimit.toString());
    setWeeklyInput(weeklyLimit.toString());
    setShowSettings((v) => !v);
  };

  const handleSaveLimits = () => {
    const daily = parseFloat(dailyInput);
    const weekly = parseFloat(weeklyInput);
    if (isNaN(daily) || isNaN(weekly) || daily < 0 || weekly < 0) return;
    updateLossLimits(daily, weekly);
  };

  const meters = [
    { label: "Today", pnl: todayPnl, limit: dailyLimit, breached: dailyBreached, warn: dailyWarn },
    { label: "Last 7 days", pnl: weekPnl, limit: weeklyLimit, breached: weeklyBreached, warn: weeklyWarn },
  ];

  return (
    <section aria-label="Loss limits" className="mb-8 space-y-3">
      {breached && (
        <Callout tone="critical" title={`${dailyBreached ? "Daily" : "Weekly"} loss limit reached`}>
          Stop for now and review your last trades before taking another one.
        </Callout>
      )}
      {warning && (
        <Callout tone="warning" title="You are close to a loss limit">
          You have used over 80% of a limit. Size down or step away.
        </Callout>
      )}

      <div className="flex flex-col gap-4 rounded-[10px] border border-rule bg-deck px-5 py-4 md:flex-row md:items-center md:gap-8">
        {meters.map((m) => {
          const used = Math.max(0, -m.pnl);
          const share = m.limit > 0 ? Math.min(1, used / m.limit) : 0;
          const fill = m.breached ? "var(--loss)" : m.warn ? "var(--fees)" : "var(--fog)";
          return (
            <div key={m.label} className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-paper">{m.label}</span>
                <span className="text-fog">
                  <span className={m.pnl < 0 ? "text-loss-ink" : m.pnl > 0 ? "text-gain-ink" : "text-fog"}>{money(m.pnl)}</span>
                  {" "}against a {money(m.limit, { sign: false, digits: 0 })} loss limit
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-deck-2"
                role="meter"
                aria-label={`${m.label} loss limit used`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)}
              >
                <div className="h-full rounded-full transition-[width]" style={{ width: `${share * 100}%`, background: fill }} />
              </div>
            </div>
          );
        })}
        <Button variant="ghost" size="sm" onClick={openSettings} aria-expanded={showSettings} className="self-start md:self-center">
          <Settings2 size={14} /> Limits
        </Button>
      </div>

      {usingAutoLimits && !showSettings && (
        <p className="px-1 text-xs text-mist">
          Limits are set automatically to 4% a day and 8% a week of{" "}
          {usingSyncedBalance ? "your synced CoinDCX balance" : "your last recorded balance"} (
          {money(referenceBalance, { sign: false })}). Set your own under Limits.
        </p>
      )}

      {showSettings && (
        <div className="flex flex-wrap items-end gap-4 rounded-[10px] border border-rule bg-deck px-5 py-4">
          <Field label="Daily loss limit ($)" htmlFor="ll-daily" className="w-44">
            <TextInput id="ll-daily" type="number" step="any" value={dailyInput} onChange={(e) => setDailyInput(e.target.value)} />
          </Field>
          <Field label="Weekly loss limit ($)" htmlFor="ll-weekly" className="w-44">
            <TextInput id="ll-weekly" type="number" step="any" value={weeklyInput} onChange={(e) => setWeeklyInput(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={handleSaveLimits}>
            Save limits
          </Button>
        </div>
      )}
    </section>
  );
}
