"use client";

import { TrendingDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Currency, computeConsecutiveLossTable, formatCurrency, formatPercent } from "@/lib/riskCalculator";
import { SectionCard } from "./shared";

interface ConsecutiveLossCardProps {
  currency: Currency;
  capital: number;
  riskAmount: number;
  maxConsecutiveLosses: number;
}

export default function ConsecutiveLossCard({ currency, capital, riskAmount, maxConsecutiveLosses }: ConsecutiveLossCardProps) {
  const rows = computeConsecutiveLossTable(capital, riskAmount, maxConsecutiveLosses);

  return (
    <SectionCard title="Consecutive Loss Protection" icon={<TrendingDown size={16} className="text-primary" />}>
      <div className="overflow-x-auto -mx-2">
        <Table className="min-w-[420px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Losing Trades</TableHead>
              <TableHead>Cumulative Loss</TableHead>
              <TableHead>Remaining Capital</TableHead>
              <TableHead className="text-right">% of Capital Left</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const atLimit = row.losses === maxConsecutiveLosses;
              const beyondLimit = row.losses > maxConsecutiveLosses;
              return (
                <TableRow key={row.losses} className={atLimit ? "bg-destructive/5" : beyondLimit ? "opacity-50" : ""}>
                  <TableCell className="font-semibold">{row.losses}{atLimit && " ⚠️"}</TableCell>
                  <TableCell className="text-rose-500 font-semibold">{formatCurrency(row.cumulativeLoss, currency)}</TableCell>
                  <TableCell>{formatCurrency(row.remainingCapital, currency)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatPercent(row.remainingCapitalPct)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
        🛑 At {maxConsecutiveLosses} consecutive losses: stop trading and review your setup.
      </div>
    </SectionCard>
  );
}
