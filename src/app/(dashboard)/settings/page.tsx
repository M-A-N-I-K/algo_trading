"use client";

import { useEffect, useState } from "react";
import { Settings, Wallet, ShieldAlert, Tag, LayoutGrid, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import PlaceholderPage from "@/components/layout/PlaceholderPage";
import { KPI_CARD_KEYS } from "@/components/trading-journal/KPICards";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass border-slate-800">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
            <Icon className="text-violet-500" size={16} />
          </div>
          <h3 className="font-Outfit text-lg font-bold text-white">{title}</h3>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed mb-5 ml-12">{description}</p>
        <div className="ml-12">{children}</div>
      </CardContent>
    </Card>
  );
}

function StartingBalanceSection() {
  const { startingBalance, updateStartingBalance } = useDashboard();
  const [value, setValue] = useState(startingBalance.toString());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(startingBalance.toString());
  }, [startingBalance]);

  const isDirty = parseFloat(value) !== startingBalance && value.trim() !== "";

  const handleSave = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) return;
    setIsSaving(true);
    await updateStartingBalance(parsed);
    setIsSaving(false);
  };

  return (
    <SettingsSection
      icon={Wallet}
      title="Starting Balance"
      description="The baseline your Equity Curve and account-growth % are measured from, used for any trade that doesn't carry its own logged balance."
    >
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="number"
          min="0"
          step="any"
          className="w-full sm:w-64 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          disabled={!isDirty || isSaving}
          onClick={handleSave}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </SettingsSection>
  );
}

function CoindcxBalanceSection() {
  const { coindcxBalance, coindcxBalanceSyncedAt, isSyncingBalance, syncCoindcxBalance } = useDashboard();

  return (
    <SettingsSection
      icon={Wallet}
      title="CoinDCX Account Balance"
      description="Pulls your live USDT futures wallet balance (free + locked margin) from CoinDCX. Daily/weekly loss limits below auto-calculate from this balance whenever you haven't set an explicit value — sync any time to keep that calculation current."
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1">
          <div className="text-2xl font-bold text-white">
            {coindcxBalance != null ? `$${coindcxBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {coindcxBalanceSyncedAt
              ? `Last synced ${new Date(coindcxBalanceSyncedAt).toLocaleString()}`
              : "Never synced yet"}
          </p>
        </div>
        <button
          onClick={() => syncCoindcxBalance()}
          disabled={isSyncingBalance}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          <RefreshCw size={14} className={isSyncingBalance ? "animate-spin" : ""} />
          {isSyncingBalance ? "Syncing..." : "Sync Now"}
        </button>
      </div>
    </SettingsSection>
  );
}

function RiskLimitsSection() {
  const { dailyLossLimit, weeklyLossLimit, updateLossLimits } = useDashboard();
  const [daily, setDaily] = useState(dailyLossLimit?.toString() ?? "");
  const [weekly, setWeekly] = useState(weeklyLossLimit?.toString() ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDaily(dailyLossLimit?.toString() ?? "");
    setWeekly(weeklyLossLimit?.toString() ?? "");
  }, [dailyLossLimit, weeklyLossLimit]);

  const parsedDaily = parseFloat(daily);
  const parsedWeekly = parseFloat(weekly);
  const isValid = !isNaN(parsedDaily) && !isNaN(parsedWeekly) && parsedDaily >= 0 && parsedWeekly >= 0;
  const isDirty = isValid && (parsedDaily !== dailyLossLimit || parsedWeekly !== weeklyLossLimit);

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    await updateLossLimits(parsedDaily, parsedWeekly);
    setIsSaving(false);
  };

  return (
    <SettingsSection
      icon={ShieldAlert}
      title="Daily & Weekly Loss Limits"
      description="Thresholds shown on the dashboard's loss-limit banner. Leave unset to default to 4% / 8% of your most recent account balance."
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daily Limit ($)</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Auto (4% of balance)"
            className="w-full sm:w-56 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Weekly Limit ($)</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Auto (8% of balance)"
            className="w-full sm:w-56 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
          />
        </div>
        <button
          disabled={!isDirty || isSaving}
          onClick={handleSave}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </SettingsSection>
  );
}

function DefaultStrategySection() {
  const { defaultStrategy, updateDefaultStrategy } = useDashboard();
  const [value, setValue] = useState(defaultStrategy);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(defaultStrategy);
  }, [defaultStrategy]);

  const isDirty = value !== defaultStrategy;

  const handleSave = async () => {
    setIsSaving(true);
    await updateDefaultStrategy(value);
    setIsSaving(false);
  };

  return (
    <SettingsSection
      icon={Tag}
      title="Default Strategy"
      description="Pre-filled strategy tag for new manual trade entries and CSV imports."
    >
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          className="w-full sm:w-72 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {STRATEGY_CATALOG.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          disabled={!isDirty || isSaving}
          onClick={handleSave}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </SettingsSection>
  );
}

function DashboardCardsSection() {
  const { hiddenKpiCards, updateHiddenKpiCards } = useDashboard();
  const [selected, setSelected] = useState<Set<string>>(new Set(hiddenKpiCards));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelected(new Set(hiddenKpiCards));
  }, [hiddenKpiCards]);

  const isDirty =
    selected.size !== hiddenKpiCards.length || [...selected].some((k) => !hiddenKpiCards.includes(k));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    await updateHiddenKpiCards([...selected]);
    setIsSaving(false);
  };

  return (
    <SettingsSection
      icon={LayoutGrid}
      title="Dashboard Cards"
      description="Uncheck any KPI card you don't want cluttering the main dashboard."
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KPI_CARD_KEYS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 cursor-pointer hover:border-slate-700 transition-colors"
            >
              <input
                type="checkbox"
                checked={!selected.has(key)}
                onChange={() => toggle(key)}
                className="accent-violet-500"
              />
              {label}
            </label>
          ))}
        </div>
        <button
          disabled={!isDirty || isSaving}
          onClick={handleSave}
          className="self-start bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </SettingsSection>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <StartingBalanceSection />
      <CoindcxBalanceSection />
      <RiskLimitsSection />
      <DefaultStrategySection />
      <DashboardCardsSection />

      <PlaceholderPage
        icon={Settings}
        title="More Settings"
        description="Account and trading-account preferences will live here as the platform grows beyond a single default account."
        plannedCapabilities={[
          "Manage multiple trading accounts",
          "Notification preferences",
          "Data export",
        ]}
      />
    </div>
  );
}
