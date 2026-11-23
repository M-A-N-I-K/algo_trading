"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button, Callout, Field, Panel, SelectInput, Tag, TextInput } from "@/components/kit";
import { PLAYBOOK_KEY } from "@/components/playbook/TradeDialogs";
import { fetchJson } from "@/lib/apiClient";
import { PLAYBOOK_ACCOUNTS, accountById } from "@/lib/playbook/config";
import { cn } from "@/lib/utils";

// Live sync: each MT5 account, connected through MetaApi's cloud (login,
// server, investor password) or exported by the PB_BarFeed expert from the
// MT5 app here, linked to the prop account it is. Linked accounts' trades
// land in the Playbook by themselves (src/lib/mt5/sync.ts).

type Row = {
  login: string;
  server: string;
  company: string;
  mode: string;
  currency: string;
  balance: number | null;
  equity: number | null;
  writtenAt: number | null;
  positions: number;
  open: number;
  firstTrade: number | null;
  deposit: number | null;
  accountId: string | null;
  suggested: string | null;
  source: "local" | "cloud";
  status: string | null; // set for cloud accounts
};
type Changes = { created: number; linked: number; updated: number; skipped: number };
type View = { feedLive: boolean; cloudReady: boolean; accounts: Row[]; sync?: { at: number; changes: Changes; errors: string[] } };

const KEY = ["mt5-accounts"];
const LIVE_MS = 2 * 60_000;
const money = (n: number | null, ccy = "USD") =>
  n === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(n);
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function ago(t: number | null, now: number) {
  if (t === null) return "never";
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : dayFmt.format(t);
}

function changesText(c: Changes) {
  const parts = [
    c.created && `${c.created} new`,
    c.linked && `${c.linked} matched to trades you'd logged`,
    c.updated && `${c.updated} updated`,
  ].filter(Boolean);
  return parts.length ? `Synced: ${parts.join(", ")}.` : "Everything was already up to date.";
}

function ConnectForm({ onDone, onCancel }: { onDone: (v: View) => void; onCancel?: () => void }) {
  const id = useId();
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [password, setPassword] = useState("");
  const [accountId, setAccountId] = useState("");
  const connect = useMutation({
    mutationFn: () =>
      fetchJson<View>("/api/mt5/cloud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, server, password, accountId: accountId || null }) }),
    onSuccess: (v) => {
      setPassword("");
      setLogin("");
      setServer("");
      setAccountId("");
      onDone(v);
    },
    onError: () => setPassword(""),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-rule bg-ink/40 p-4">
      <p className="text-sm font-semibold text-paper">Connect an MT5 account</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Login" htmlFor={`${id}-login`} hint="The account number.">
          <TextInput id={`${id}-login`} inputMode="numeric" autoComplete="off" required pattern="\d{1,20}" value={login} onChange={(e) => setLogin(e.target.value.trim())} />
        </Field>
        <Field label="Server" htmlFor={`${id}-server`} hint="Exactly as MT5 or your firm's email shows it.">
          <TextInput id={`${id}-server`} autoComplete="off" required maxLength={100} value={server} onChange={(e) => setServer(e.target.value)} />
        </Field>
        <Field label="Investor password" htmlFor={`${id}-password`} hint="The read-only one: it can see trades but can't place them. Never your master password.">
          <TextInput id={`${id}-password`} type="password" autoComplete="new-password" required maxLength={100} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Sync into" htmlFor={`${id}-account`}>
          <SelectInput id={`${id}-account`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Decide later</option>
            {PLAYBOOK_ACCOUNTS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <p className="text-[12px] text-mist">The password goes to MetaApi once to log in its cloud terminal and isn&apos;t saved here. Syncing then works without MT5 open on this computer.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={connect.isPending}>
          {connect.isPending ? "Connecting…" : "Connect account"}
        </Button>
        {onCancel && !connect.isPending && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
        {connect.isPending && <span className="text-[12px] text-fog">MetaApi is checking the login with your broker. This can take a minute or two.</span>}
      </div>
      {connect.error && <Callout tone="critical" title="Couldn't connect">{connect.error instanceof Error ? connect.error.message : "Try again."}</Callout>}
    </form>
  );
}

function statusLine(a: Row, now: number) {
  if (a.status === null) {
    const live = a.writtenAt !== null && now - a.writtenAt < LIVE_MS;
    return { live, text: live ? "MT5 app logged in now" : `MT5 app last seen ${ago(a.writtenAt, now)}`, problem: false };
  }
  if (a.status === "connected") return { live: true, text: "Connected in the cloud", problem: false };
  if (a.status === "connecting") return { live: false, text: "Connecting to the broker…", problem: false };
  return { live: false, text: a.status, problem: true };
}

export default function Mt5LiveSync() {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: KEY, queryFn: () => fetchJson<View>("/api/mt5/accounts"), refetchInterval: 30_000 });
  const done = (v: View) => {
    qc.setQueryData(KEY, v);
    qc.invalidateQueries({ queryKey: PLAYBOOK_KEY });
    qc.invalidateQueries({ queryKey: ["mt5"] });
  };
  const sync = useMutation({ mutationFn: () => fetchJson<View>("/api/mt5/accounts", { method: "POST" }), onSuccess: done });
  const link = useMutation({
    mutationFn: (v: { login: string; accountId: string | null }) =>
      fetchJson<View>("/api/mt5/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }),
    onSuccess: done,
  });
  const disconnect = useMutation({
    mutationFn: (login: string) => fetchJson<View>("/api/mt5/cloud", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login }) }),
    onSuccess: done,
  });
  const [adding, setAdding] = useState(false);
  const result = link.data?.sync ?? sync.data?.sync;
  const failure = link.error ?? sync.error ?? disconnect.error;
  const now = Date.now();
  const accounts = data?.accounts ?? [];

  return (
    <Panel
      title="Live sync from MT5"
      note="Connect each MT5 account and pick its prop account: its trades reach the Playbook by themselves, with fills, stop, size, costs, the closing P&L and the balance. Trades you already logged are matched, not doubled."
      aside={
        accounts.some((a) => a.accountId) && (
          <Button size="sm" variant="ghost" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw size={14} aria-hidden="true" className={cn(sync.isPending && "animate-spin")} />
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        )
      }
    >
      {isLoading ? (
        <p className="text-sm text-fog">Looking for MT5 accounts.</p>
      ) : error ? (
        <Callout tone="critical" title="Couldn't read the MT5 accounts">{error instanceof Error ? error.message : "Try again in a minute."}</Callout>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col gap-4 text-sm text-fog">
          {data?.cloudReady ? (
            <ConnectForm onDone={done} />
          ) : (
            <Callout tone="warning" title="Cloud sync needs a MetaApi token">
              Create an API token at app.metaapi.cloud/token, add it to .env as METAAPI_TOKEN, and restart the app. Then you can connect accounts here with their investor password.
            </Callout>
          )}
          <details className="group">
            <summary className="cursor-pointer text-[13px] text-fog hover:text-paper">Or sync from the MT5 app on this computer instead</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              In MT5, open the chart running <span className="text-paper">PB_BarFeed</span>, remove the expert (right-click the chart, then Expert List), and drag it back on from the Navigator. Version 1.30 or later exports trades.
            </li>
            <li>Log into each prop account in MT5 once (File, then Login to Trade Account). Each one shows up here within 10 seconds.</li>
            <li>Pick which prop account each login is. That&apos;s it: no passwords leave your machine.</li>
          </ol>
          {!data?.feedLive && <Callout tone="warning" className="mt-2" title="The bar feed isn't running">Start MT5 and attach PB_BarFeed to any chart first.</Callout>}
          </details>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="grid gap-3 lg:grid-cols-2">
            {accounts.map((a) => {
              const st = statusLine(a, now);
              const suggestion = !a.accountId && a.suggested ? accountById(a.suggested) : null;
              return (
                <li key={a.login} className="flex flex-col gap-3 rounded-lg border border-rule bg-ink/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-paper">
                        <span className="tabular-nums">{a.login}</span>
                        {a.mode && <Tag tone={a.mode === "real" ? "signal" : "neutral"}>{a.mode}</Tag>}
                        <Tag>{a.status !== null ? "Cloud" : "MT5 app"}</Tag>
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-fog">{a.server || a.company}</p>
                    </div>
                    {!st.problem && (
                      <p className="flex items-center gap-1.5 text-[12px] text-mist">
                        <span className={cn("h-2 w-2 rounded-full", st.live ? "bg-gain" : "bg-mist/50")} aria-hidden="true" />
                        {st.text}
                      </p>
                    )}
                  </div>
                  {st.problem && <Callout tone="warning" title="Not syncing">{st.text}</Callout>}
                  <dl className="grid grid-cols-3 gap-2 text-[13px]">
                    <div><dt className="text-mist">Balance</dt><dd className="tabular-nums text-paper">{money(a.balance, a.currency)}</dd></div>
                    <div><dt className="text-mist">Equity</dt><dd className="tabular-nums text-paper">{money(a.equity, a.currency)}</dd></div>
                    <div><dt className="text-mist">Trades</dt><dd className="tabular-nums text-paper">{a.positions}{a.open ? <span className="text-fog">, {a.open} open</span> : null}</dd></div>
                  </dl>
                  <label className="flex flex-col gap-1.5 text-[13px] text-fog">
                    Sync into
                    <SelectInput
                      value={a.accountId ?? ""}
                      disabled={link.isPending}
                      onChange={(e) => link.mutate({ login: a.login, accountId: e.target.value || null })}
                    >
                      <option value="">Don&apos;t sync this login</option>
                      {PLAYBOOK_ACCOUNTS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </SelectInput>
                  </label>
                  {suggestion && (
                    <p className="text-[12px] text-fog">
                      Started with {money(a.deposit, a.currency)}, so this looks like your <span className="text-paper">{suggestion.name}</span>.{" "}
                      <button type="button" className="text-signal hover:text-paper focus-visible:outline-2 focus-visible:outline-signal" onClick={() => link.mutate({ login: a.login, accountId: suggestion.id })}>
                        Link it
                      </button>
                    </p>
                  )}
                  {a.accountId && a.firstTrade !== null && <p className="text-[12px] text-mist">Every trade since {dayFmt.format(a.firstTrade)} is in the Playbook.</p>}
                  {a.status !== null && (
                    <button
                      type="button"
                      className="self-start text-[12px] text-mist hover:text-loss focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-50"
                      disabled={disconnect.isPending}
                      onClick={() => {
                        if (window.confirm(`Disconnect ${a.login}? It stops syncing and is removed from MetaApi. Trades already synced stay.`)) disconnect.mutate(a.login);
                      }}
                    >
                      Disconnect
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {data?.cloudReady &&
            (adding ? (
              <ConnectForm onDone={(v) => { setAdding(false); done(v); }} onCancel={() => setAdding(false)} />
            ) : (
              <Button size="sm" variant="secondary" className="self-start" onClick={() => setAdding(true)}>Connect another account</Button>
            ))}
          <p className="text-[12px] text-mist">
            Cloud accounts sync about once a minute, whether or not MT5 is open. Accounts from the MT5 app only update while it&apos;s logged into them. Trades the sync finds that you didn&apos;t log first are checked against the rules as they stood when you opened them.
          </p>
        </div>
      )}
      {result && (
        <Callout tone={result.errors.length ? "warning" : "good"} className="mt-4" title={changesText(result.changes)}>
          {result.errors.length ? result.errors.join(" ") : result.changes.skipped ? `${result.changes.skipped} skipped: already on the Trades page, or a market the Playbook doesn't trade.` : null}
        </Callout>
      )}
      {failure && (
        <Callout tone="critical" className="mt-4" title="Sync failed">{failure instanceof Error ? failure.message : "Try again."}</Callout>
      )}
    </Panel>
  );
}
