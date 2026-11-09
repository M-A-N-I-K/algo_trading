"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Field, TextInput } from "@/components/kit";
import { coveredByPlatform } from "@/lib/costs/fundingpips";

const DAY_MS = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface RunBacktestDialogProps {
  strategyId: string;
  version: number;
  symbol: string;
  timeframe: string;
  onClose: () => void;
}

// Settings for one backtest of a saved strategy version. Symbol, timeframe,
// sizing and guardrails come from the version itself.
export default function RunBacktestDialog({ strategyId, version, symbol, timeframe, onClose }: RunBacktestDialogProps) {
  const router = useRouter();
  const today = Date.now();
  const [from, setFrom] = useState(isoDate(today - 90 * DAY_MS));
  const [to, setTo] = useState(isoDate(today));
  const [capital, setCapital] = useState("10000");
  // Blank = the FundingPips account's real costs (commission measured from
  // the MT5 report, plus spread), worked out on the server for this market.
  const platformCosts = coveredByPlatform(symbol);
  const [feePct, setFeePct] = useState(platformCosts ? "" : "0.04");
  const [slippagePct, setSlippagePct] = useState("0.02");
  const [leverage, setLeverage] = useState("1");
  const [minRr, setMinRr] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/${strategyId}/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          from: new Date(`${from}T00:00:00Z`).toISOString(),
          // Include the whole end day.
          to: new Date(`${to}T23:59:59Z`).toISOString(),
          execution: {
            initialCapital: Number(capital),
            feeRate: feePct.trim() === "" ? undefined : Number(feePct) / 100,
            slippagePercent: Number(slippagePct) / 100,
            maxLeverage: Number(leverage),
            minRiskReward: minRr ? Number(minRr) : undefined,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues = Array.isArray(body.details) ? body.details.filter((d: unknown) => typeof d === "string") : [];
        setError({ message: body.message ?? `Backtest failed (${res.status}).`, issues });
        return;
      }
      router.push(`/strategies/${strategyId}/backtests/${body.backtestId}`);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Backtest failed.", issues: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={running ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-backtest-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[10px] border border-rule bg-deck p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="run-backtest-title" className="font-display text-[17px] font-semibold text-paper">
          Backtest version {version}
        </h3>
        <p className="mt-0.5 text-[13px] text-fog">
          {symbol} · {timeframe}. Sizing and risk limits come from the strategy.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From" htmlFor="bt-from">
            <TextInput id="bt-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="bt-to">
            <TextInput id="bt-to" type="date" value={to} min={from} max={isoDate(today)} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Starting capital ($)" htmlFor="bt-capital">
            <TextInput id="bt-capital" type="number" min="1" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </Field>
          <Field label="Max leverage" htmlFor="bt-leverage">
            <TextInput id="bt-leverage" type="number" min="1" step="any" value={leverage} onChange={(e) => setLeverage(e.target.value)} />
          </Field>
          <Field label="Fee per side (%)" htmlFor="bt-fee" hint={platformCosts ? "Blank uses your FundingPips costs: measured commission plus spread." : undefined}>
            <TextInput
              id="bt-fee"
              type="number"
              min="0"
              step="any"
              placeholder={platformCosts ? "FundingPips costs" : undefined}
              value={feePct}
              onChange={(e) => setFeePct(e.target.value)}
            />
          </Field>
          <Field label="Slippage (%)" htmlFor="bt-slippage">
            <TextInput id="bt-slippage" type="number" min="0" step="any" value={slippagePct} onChange={(e) => setSlippagePct(e.target.value)} />
          </Field>
          <Field label="Minimum R:R (optional)" htmlFor="bt-minrr">
            <TextInput id="bt-minrr" type="number" min="0" step="any" placeholder="None" value={minRr} onChange={(e) => setMinRr(e.target.value)} />
          </Field>
        </div>

        {error && (
          <Callout tone="critical" title={error.message} className="mt-4">
            {error.issues.length > 0 && (
              <ul className="list-disc pl-4">
                {error.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </Callout>
        )}

        {running && (
          <p className="mt-4 text-[13px] text-fog" aria-live="polite">
            Loading candles and simulating. A first run on a long range fetches its candles from Binance and can take a minute.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} disabled={running || !from || !to}>
            {running ? "Running…" : "Run backtest"}
          </Button>
        </div>
      </div>
    </div>
  );
}
