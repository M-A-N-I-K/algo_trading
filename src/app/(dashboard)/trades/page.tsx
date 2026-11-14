"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import TradesTable from "@/components/trading-journal/TradesTable";
import { useDashboard } from "@/components/trading-journal/DashboardContext";
import { AccountNotice, AccountSelect, useAccountTrades } from "@/components/trading-journal/AccountSource";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { pnlBreakdown, summarize } from "@/lib/journal/metrics";
import { Button, Panel, Segmented, SelectInput, Stat, TextInput, money, pct, toneClass } from "@/components/kit";

type Outcome = "ALL" | "WIN" | "LOSS";
type Side = "ALL" | "LONG" | "SHORT";

export default function TradesPage() {
  const { openTradeForm, handleDeleteTrade } = useDashboard();
  const { source, chooseSource, isCoinDcx, trades, symbols, error, empty, canModify, inspect } = useAccountTrades();
  const accountLabel = isCoinDcx ? "CoinDCX" : "this account's";

  const [symbol, setSymbol] = useState("ALL");
  const [strategy, setStrategy] = useState("ALL");
  const [outcome, setOutcome] = useState<Outcome>("ALL");
  const [side, setSide] = useState<Side>("ALL");
  const [query, setQuery] = useState("");

  const strategies = useMemo(() => {
    const used = new Set(trades.map((t) => t.strategy));
    const known = STRATEGY_CATALOG.map((s) => ({ value: s.value, label: s.label }));
    const extra = [...used].filter((s) => !known.some((k) => k.value === s)).map((s) => ({ value: s, label: s }));
    return [...known.filter((k) => used.has(k.value)), ...extra];
  }, [trades]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trades.filter((t) => {
      if (symbol !== "ALL" && t.symbol !== symbol) return false;
      if (strategy !== "ALL" && t.strategy !== strategy) return false;
      if (side !== "ALL" && t.side !== side) return false;
      if (outcome === "WIN" && !(t.pnl > 0)) return false;
      if (outcome === "LOSS" && t.pnl > 0) return false;
      if (q && !(t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)) && !t.notes.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [trades, symbol, strategy, side, outcome, query]);

  const b = pnlBreakdown(filtered);
  const s = summarize(filtered);
  const isFiltered = symbol !== "ALL" || strategy !== "ALL" || side !== "ALL" || outcome !== "ALL" || query.trim() !== "";

  const reset = () => {
    setSymbol("ALL");
    setStrategy("ALL");
    setSide("ALL");
    setOutcome("ALL");
    setQuery("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <AccountSelect
          value={source}
          onChange={(key) => {
            chooseSource(key);
            reset();
          }}
        />
        <Segmented
          label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: "ALL", label: "All trades" },
            { value: "WIN", label: "Wins" },
            { value: "LOSS", label: "Losses" },
          ]}
        />
        <Segmented
          label="Direction"
          value={side}
          onChange={setSide}
          options={[
            { value: "ALL", label: "Both" },
            { value: "LONG", label: "Long" },
            { value: "SHORT", label: "Short" },
          ]}
        />
        <div className="flex flex-1 flex-wrap gap-3">
          <SelectInput aria-label="Symbol" className="w-auto min-w-36" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="ALL">All symbols</option>
            {symbols.map((sym) => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </SelectInput>
          <SelectInput aria-label="Strategy" className="w-auto min-w-44" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="ALL">All strategies</option>
            {strategies.map((st) => (
              <option key={st.value} value={st.value}>{st.label}</option>
            ))}
          </SelectInput>
          <div className="relative min-w-52 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist" aria-hidden="true" />
            <TextInput
              aria-label="Search tags and notes"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags and notes"
            />
          </div>
          {isFiltered && (
            <Button variant="ghost" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <AccountNotice error={error} empty={empty} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-[10px] border border-rule bg-deck px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={isFiltered ? "Matching trades" : "Trades"} value={b.count} note={s.winRate == null ? undefined : `${pct(s.winRate, 0)} won`} />
        <Stat label="Net" value={money(b.net)} tone={toneClass(b.net)} />
        <Stat label="Price P&L" value={money(b.gross)} tone={toneClass(b.gross)} />
        <Stat label="Fees" value={money(-b.fees)} tone="text-fees-ink" />
        <Stat label="Funding" value={money(b.funding)} tone="text-funding-ink" />
        <Stat label="Expectancy" value={s.expectancy == null ? "—" : money(s.expectancy)} note="Per trade, net" />
      </div>

      <Panel title={isFiltered ? `${filtered.length} of ${trades.length} trades` : `All ${accountLabel} trades`}
        note={isCoinDcx ? "Select a trade to open its notes, tags and checklist." : "Trades logged in the Playbook open there; trades linked from this page open their notes."}
      >
        <TradesTable
          filteredTrades={filtered}
          onEdit={(t) => openTradeForm(t)}
          onDelete={handleDeleteTrade}
          onInspect={inspect}
          canModify={canModify}
          isFullLog
        />
      </Panel>
    </div>
  );
}
