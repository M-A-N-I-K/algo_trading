"use client";

import { useEffect, useState } from "react";
import { Settings, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import PlaceholderPage from "@/components/layout/PlaceholderPage";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function SettingsPage() {
  const { startingBalance, updateStartingBalance } = useDashboard();
  const [value, setValue] = useState(startingBalance?.toString());
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
    <div className="flex flex-col gap-6">
      <Card className="glass border-slate-800">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
              <Wallet className="text-violet-500" size={16} />
            </div>
            <h3 className="font-Outfit text-lg font-bold text-white">Starting Balance</h3>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed mb-5 ml-12">
            The baseline your Equity Curve and account-growth % are measured from, used for any
            trade that doesn&apos;t carry its own logged balance.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center ml-12">
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
        </CardContent>
      </Card>

      <PlaceholderPage
        icon={Settings}
        title="More Settings"
        description="Account, trading-account, and notification preferences will live here as the platform grows beyond a single default account."
        plannedCapabilities={[
          "Manage multiple trading accounts",
          "Default currency & risk preferences",
          "Notification preferences",
          "Data export",
        ]}
      />
    </div>
  );
}
