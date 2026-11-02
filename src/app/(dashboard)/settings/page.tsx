"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DASHBOARD_SECTIONS } from "@/components/dashboard/sections";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { useDashboard } from "@/components/trading-journal/DashboardContext";
import { Button, Field, SelectInput, TextInput, money } from "@/components/kit";

/** One row of the settings sheet: what it is on the left, the control on the right. */
function SettingsRow({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-rule py-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10">
      <div>
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-paper">{title}</h2>
        <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-fog">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SaveButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  return (
    <Button variant={dirty ? "primary" : "secondary"} disabled={!dirty || saving} onClick={onClick}>
      {saving ? "Saving…" : "Save"}
    </Button>
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
    <SettingsRow
      title="Starting balance"
      description="The baseline for account growth, used for any trade that doesn't carry its own logged balance."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Balance ($)" htmlFor="set-start" className="w-56">
          <TextInput id="set-start" type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <SaveButton dirty={isDirty} saving={isSaving} onClick={handleSave} />
      </div>
    </SettingsRow>
  );
}

function RiskLimitsSection() {
  const { dailyLossLimit, weeklyLossLimit, updateLossLimits, coindcxBalance } = useDashboard();
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
    <SettingsRow
      title="Loss limits"
      description={
        <>
          Shown as meters on the dashboard. Leave a field empty to use 4% a day and 8% a week of{" "}
          {coindcxBalance != null ? <>your CoinDCX balance ({money(coindcxBalance, { sign: false })})</> : "your last recorded balance"}.
          Update the balance on the{" "}
          <Link href="/import" className="text-signal underline-offset-2 hover:underline">
            Sync page
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Daily limit ($)" htmlFor="set-daily" className="w-48">
          <TextInput id="set-daily" type="number" min="0" step="any" placeholder="Automatic" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
        <Field label="Weekly limit ($)" htmlFor="set-weekly" className="w-48">
          <TextInput id="set-weekly" type="number" min="0" step="any" placeholder="Automatic" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </Field>
        <SaveButton dirty={isDirty} saving={isSaving} onClick={handleSave} />
      </div>
    </SettingsRow>
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
    <SettingsRow title="Default strategy" description="Pre-filled when you log a trade by hand.">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Strategy" htmlFor="set-strategy" className="w-72 max-w-full">
          <SelectInput id="set-strategy" value={value} onChange={(e) => setValue(e.target.value)}>
            {STRATEGY_CATALOG.map((st) => (
              <option key={st.value} value={st.value}>{st.label}</option>
            ))}
          </SelectInput>
        </Field>
        <SaveButton dirty={isDirty} saving={isSaving} onClick={handleSave} />
      </div>
    </SettingsRow>
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
    <SettingsRow title="Dashboard sections" description="Choose what appears under the P&L bridge. The bridge itself is always shown.">
      <fieldset>
        <legend className="sr-only">Visible dashboard sections</legend>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {DASHBOARD_SECTIONS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-paper hover:bg-deck-2">
              <input type="checkbox" checked={!selected.has(key)} onChange={() => toggle(key)} className="h-4 w-4 accent-[var(--signal)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4">
        <SaveButton dirty={isDirty} saving={isSaving} onClick={handleSave} />
      </div>
    </SettingsRow>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-5xl rounded-[10px] border border-rule bg-deck p-5 sm:p-7">
      <StartingBalanceSection />
      <RiskLimitsSection />
      <DefaultStrategySection />
      <DashboardCardsSection />
    </div>
  );
}
