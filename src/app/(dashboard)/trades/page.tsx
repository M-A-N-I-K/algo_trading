"use client";

import { useState } from "react";
import TradesTable from "@/components/trading-journal/TradesTable";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function TradesPage() {
  const { trades, symbols, openTradeForm, handleDeleteTrade, openNotes } = useDashboard();

  const [filterSymbol, setFilterSymbol] = useState("ALL");
  const [filterStrategy, setFilterStrategy] = useState("ALL");
  const [filterOutcome, setFilterOutcome] = useState("ALL");
  const [filterTag, setFilterTag] = useState("");

  const filteredTrades = trades.filter(t => {
    const matchSym = filterSymbol === "ALL" || t.symbol === filterSymbol;
    const matchStrat = filterStrategy === "ALL" || t.strategy === filterStrategy;
    let matchOutcome = true;
    if (filterOutcome === "WIN") matchOutcome = t.pnl > 0;
    if (filterOutcome === "LOSS") matchOutcome = t.pnl <= 0;
    const matchTag =
      !filterTag.trim() ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(filterTag.trim().toLowerCase()));
    return matchSym && matchStrat && matchOutcome && matchTag;
  });

  return (
    <TradesTable
      filteredTrades={filteredTrades}
      symbols={symbols}
      filterSymbol={filterSymbol}
      setFilterSymbol={setFilterSymbol}
      filterStrategy={filterStrategy}
      setFilterStrategy={setFilterStrategy}
      filterOutcome={filterOutcome}
      setFilterOutcome={setFilterOutcome}
      filterTag={filterTag}
      setFilterTag={setFilterTag}
      onEdit={(t) => openTradeForm(t)}
      onDelete={handleDeleteTrade}
      onInspect={(t) => openNotes(t)}
      isFullLog={true}
    />
  );
}
