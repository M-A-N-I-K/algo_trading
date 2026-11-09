"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button, Callout, EmptyState, Panel, Stat, Tag, tableClass, tdClass, thClass } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import type { CommissionFinding } from "@/lib/costs/fundingpips";

type Position = {
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  volume: number;
  status: "OPEN" | "CLOSED";
  openTime: string;
  openPrice: number;
  closeTime: string | null;
  closePrice: number | null;
  commission: number;
  swap: number;
  profit: number | null;
  netPnl: number | null;
  exitReason: "stop" | "target" | "manual" | null;
};
type Summary = {
  trades: Position[];
  closed: number;
  open: number;
  wins: number;
  netPnl: number;
  profit: number;
  commission: number;
  swap: number;
  commissionFindings: CommissionFinding[];
  costSource: string;
};
type ImportResult = { created: number; updated: number; account: { login: string; server: string; type: string; balance: number | null }; summary: Summary };

const KEY = ["mt5"];
const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const tone = (n: number | null) => ((n ?? 0) > 0 ? "text-gain-ink" : (n ?? 0) < 0 ? "text-loss-ink" : "text-paper");
const when = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ruleText(f: CommissionFinding) {
  const r = f.rule;
  const rule = r.kind === "perLot" ? `$${r.usdPerLot} per lot` : r.kind === "percent" ? `${(r.rate * 100).toFixed(2)}% of entry value` : "none";
  return `${rule}, charged once at entry`;
}

// Import MT5 Trade History Reports into their own table, and show what each
// symbol was charged in commission (the rates the backtests now use).
export default function Mt5Import() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const { data, error, isLoading } = useQuery({ queryKey: KEY, queryFn: () => fetchJson<Summary>("/api/mt5") });

  const upload = useMutation({
    mutationFn: (f: File) => {
      const body = new FormData();
      body.append("file", f);
      return fetchJson<ImportResult>("/api/mt5", { method: "POST", body });
    },
    onSuccess: (res) => {
      qc.setQueryData(KEY, res.summary);
      setFile(null);
      if (input.current) input.current.value = "";
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="MT5 trade history"
        note="Your FundingPips account. In MT5: Toolbox → History → right-click → Report → HTML, then upload the file here. Uploading a newer report updates trades that have since closed."
      >
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) upload.mutate(file);
          }}
        >
          <input
            ref={input}
            type="file"
            accept=".html,.htm,text/html"
            aria-label="MT5 report file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-w-0 max-w-full text-sm text-fog file:mr-3 file:rounded-md file:border file:border-rule file:bg-deck file:px-3 file:py-1.5 file:text-sm file:text-paper"
          />
          <Button type="submit" variant="primary" size="sm" disabled={!file || upload.isPending}>
            <Upload size={14} aria-hidden="true" />
            {upload.isPending ? "Importing…" : "Import report"}
          </Button>
        </form>
        {upload.data && (
          <Callout tone="good" className="mt-4" title={`Imported account ${upload.data.account.login} (${upload.data.account.server}, ${upload.data.account.type})`}>
            {upload.data.created} new and {upload.data.updated} updated positions.
            {upload.data.account.balance !== null && <> Balance on the report: {usd(upload.data.account.balance)}.</>}
          </Callout>
        )}
        {upload.error && (
          <Callout tone="critical" className="mt-4" title="Couldn't import that file">
            {upload.error instanceof Error ? upload.error.message : "Try exporting the report again."}
          </Callout>
        )}
      </Panel>

      {isLoading ? null : error ? (
        <Callout tone="critical" title="Couldn't load MT5 trades">{error instanceof Error ? error.message : ""}</Callout>
      ) : !data || data.trades.length === 0 ? (
        <Panel title="No MT5 trades yet">
          <EmptyState>Upload a report above to see your trades and the commission you were charged.</EmptyState>
        </Panel>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 rounded-[10px] border border-rule bg-deck p-5 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Net result (closed)" value={usd(data.netPnl)} tone={tone(data.netPnl)} note={`${data.closed} closed, ${data.open} open`} />
            <Stat label="Win rate" value={data.closed ? `${Math.round((data.wins / data.closed) * 100)}%` : "—"} note={`${data.wins} of ${data.closed}`} />
            <Stat label="From price moves" value={usd(data.profit)} tone={tone(data.profit)} />
            <Stat label="Commission" value={usd(data.commission)} tone="text-fees-ink" />
            <Stat label="Swap" value={usd(data.swap)} tone="text-fees-ink" note="Overnight fees" />
          </section>

          <Panel title="Commission you were charged" note={data.costSource}>
            <div className="relative overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Symbol</th>
                    <th className={thClass}>Trades</th>
                    <th className={thClass}>Lots</th>
                    <th className={thClass}>Paid</th>
                    <th className={thClass}>Per lot</th>
                    <th className={thClass}>Of entry value</th>
                    <th className={thClass}>Rule now used in backtests</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissionFindings.map((f) => (
                    <tr key={f.symbol}>
                      <td className={tdClass}>{f.symbol}</td>
                      <td className={`${tdClass} tabular-nums`}>{f.trades}</td>
                      <td className={`${tdClass} tabular-nums`}>{f.lots.toFixed(2)}</td>
                      <td className={`${tdClass} tabular-nums`}>{usd(f.paid)}</td>
                      <td className={`${tdClass} tabular-nums`}>{usd(f.usdPerLot)}</td>
                      <td className={`${tdClass} tabular-nums`}>{(f.pctOfValue * 100).toFixed(4)}%</td>
                      <td className={tdClass}>
                        <span className="mr-2">{ruleText(f)}</span>
                        <Tag tone={f.matches ? "gain" : "loss"}>{f.matches ? "matches" : "differs"}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Positions" note="Times in your time zone. Net = price P&L + commission + swap.">
            <div className="relative max-h-[560px] overflow-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Opened</th>
                    <th className={thClass}>Symbol</th>
                    <th className={thClass}>Side</th>
                    <th className={thClass}>Lots</th>
                    <th className={thClass}>Entry → exit</th>
                    <th className={thClass}>Exit</th>
                    <th className={thClass}>Commission</th>
                    <th className={thClass}>Swap</th>
                    <th className={thClass}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((t) => (
                    <tr key={t.positionId}>
                      <td className={`${tdClass} whitespace-nowrap`}>{when.format(new Date(t.openTime))}</td>
                      <td className={tdClass}>{t.symbol}</td>
                      <td className={tdClass}>
                        <Tag tone={t.side === "LONG" ? "gain" : "loss"}>{t.side === "LONG" ? "Buy" : "Sell"}</Tag>
                      </td>
                      <td className={`${tdClass} tabular-nums`}>{t.volume}</td>
                      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                        {t.openPrice} → {t.closePrice ?? "open"}
                      </td>
                      <td className={tdClass}>{t.status === "OPEN" ? <Tag tone="signal">open</Tag> : t.exitReason}</td>
                      <td className={`${tdClass} tabular-nums text-fees-ink`}>{usd(t.commission)}</td>
                      <td className={`${tdClass} tabular-nums text-fees-ink`}>{usd(t.swap)}</td>
                      <td className={`${tdClass} tabular-nums ${tone(t.netPnl)}`}>{t.netPnl === null ? "—" : usd(t.netPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
