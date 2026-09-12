"use client";

import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import type { Trade } from "@/components/trading-journal/DashboardContext";

interface SymbolStats {
  symbol: string;
  trades: number;
  wins: number;
  netPnl: number;
  avgPnl: number;
}

interface SymbolPerformanceTableProps {
  trades: Trade[];
}

export default function SymbolPerformanceTable({ trades }: SymbolPerformanceTableProps) {
  const rows: SymbolStats[] = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; netPnl: number }>();
    for (const t of trades) {
      const entry = map.get(t.symbol) ?? { trades: 0, wins: 0, netPnl: 0 };
      entry.trades += 1;
      entry.netPnl += t.pnl;
      if (t.pnl > 0) entry.wins += 1;
      map.set(t.symbol, entry);
    }

    return Array.from(map, ([symbol, s]) => ({
      symbol,
      trades: s.trades,
      wins: s.wins,
      netPnl: s.netPnl,
      avgPnl: s.netPnl / s.trades,
    })).sort((a, b) => b.netPnl - a.netPnl);
  }, [trades]);

  return (
    <Card className="glass border-slate-800 p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="font-Outfit text-lg font-semibold">Symbol Performance</h3>
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Total P&amp;L by Symbol
        </span>
      </div>

      <div className="overflow-x-auto w-full">
        <Table className="w-full">
          <TableHeader className="bg-slate-900/50">
            <TableRow className="hover:bg-transparent border-slate-800">
              <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Symbol</TableHead>
              <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Trades</TableHead>
              <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Win Rate</TableHead>
              <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Avg P&amp;L</TableHead>
              <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 text-right">Net P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const winRate = (r.wins / r.trades) * 100;
              const isProfit = r.netPnl >= 0;
              return (
                <TableRow key={r.symbol} className="hover:bg-slate-800/10 border-slate-800/40 transition-colors">
                  <TableCell className="text-white font-bold py-4 text-sm">{r.symbol}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{r.trades}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{winRate.toFixed(1)}%</TableCell>
                  <TableCell className={`py-4 font-medium text-sm ${r.avgPnl >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                    {r.avgPnl >= 0 ? "+" : ""}${r.avgPnl.toFixed(2)}
                  </TableCell>
                  <TableCell className={`py-4 font-bold text-sm text-right ${isProfit ? "text-emerald-400" : "text-rose-500"}`}>
                    {isProfit ? "+" : ""}${r.netPnl.toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500 font-medium py-12">
                  No trades to break down yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
