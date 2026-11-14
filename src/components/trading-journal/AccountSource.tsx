"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDashboard, type Trade } from "@/components/trading-journal/DashboardContext";
import { SelectInput } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import { PLAYBOOK_ACCOUNTS } from "@/lib/playbook/config";

// Whose trades a page shows: CoinDCX futures, or one funding account. Never
// mixed: they're different money with different rules. The choice is shared
// by the dashboard and the Trades page and remembered in the browser.

export const COINDCX = "coindcx";
export const ACCOUNT_SOURCES = [
  { key: COINDCX, label: "CoinDCX futures" },
  ...PLAYBOOK_ACCOUNTS.map((a) => ({ key: a.id, label: a.name })),
];
const STORAGE_KEY = "dashboard-source";
export const ACCOUNT_TRADES_KEY = "playbook-account-trades";

const isPlaybookRow = (t: Trade) => t.id.startsWith("playbook:");

function readStored(): string {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && ACCOUNT_SOURCES.some((s) => s.key === v) ? v : COINDCX;
  } catch {
    return COINDCX;
  }
}

export function useAccountTrades() {
  const { trades: journalTrades, openNotes } = useDashboard();
  const router = useRouter();
  const [source, setSource] = useState<string>(COINDCX);
  useEffect(() => setSource(readStored()), []);
  const chooseSource = (key: string) => {
    setSource(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // Not remembered in private windows; the choice still applies.
    }
  };
  const isCoinDcx = source === COINDCX;

  const coindcxTrades = useMemo(() => journalTrades.filter((t) => !t.playbookAccountId), [journalTrades]);
  // DashboardContext invalidates this after any journal edit, so linked trades stay current.
  const accountTrades = useQuery({
    queryKey: [ACCOUNT_TRADES_KEY, source],
    queryFn: () => fetchJson<Trade[]>(`/api/playbook/account-trades?account=${encodeURIComponent(source)}`),
    enabled: !isCoinDcx,
  });
  const trades = useMemo(() => (isCoinDcx ? coindcxTrades : (accountTrades.data ?? [])), [isCoinDcx, coindcxTrades, accountTrades.data]);
  const symbols = useMemo(() => Array.from(new Set(trades.map((t) => t.symbol))), [trades]);

  return {
    source,
    chooseSource,
    isCoinDcx,
    trades,
    coindcxTrades,
    symbols,
    error: isCoinDcx ? null : accountTrades.error,
    empty: !isCoinDcx && accountTrades.isSuccess && trades.length === 0,
    /** Journal trades are edited here; Playbook-logged trades on the Playbook page. */
    canModify: (t: Trade) => !isPlaybookRow(t),
    inspect: (t: Trade) => (isPlaybookRow(t) ? router.push("/playbook") : openNotes(t)),
  };
}

export function AccountSelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-fog">
      <span>Account</span>
      <SelectInput className="w-auto min-w-48" value={value} onChange={(e) => onChange(e.target.value)}>
        {ACCOUNT_SOURCES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </SelectInput>
    </label>
  );
}

export function AccountNotice({ error, empty }: { error: Error | null; empty: boolean }) {
  if (error) return <p className="text-sm text-loss-ink">Couldn&apos;t load this account&apos;s trades: {error.message}</p>;
  if (empty) return <p className="text-sm text-fog">No closed trades on this account yet.</p>;
  return null;
}
