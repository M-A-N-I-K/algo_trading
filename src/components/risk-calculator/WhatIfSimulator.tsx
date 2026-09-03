"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Currency, computeWhatIfScenarios, formatCurrency } from "@/lib/riskCalculator";
import { ExpandableFormula, NumberField, SectionCard } from "./shared";

interface WhatIfSimulatorProps {
  currency: Currency;
  defaultCapital: number;
  defaultRiskPct: number;
  defaultRR: number;
}

export default function WhatIfSimulator({ currency, defaultCapital, defaultRiskPct, defaultRR }: WhatIfSimulatorProps) {
  const [capital, setCapital] = useState<number | null>(defaultCapital || 100000);
  const [riskPct, setRiskPct] = useState<number | null>(defaultRiskPct || 1);
  const [rr, setRR] = useState<number | null>(defaultRR || 2);
  const [winRate, setWinRate] = useState<number | null>(50);

  const scenarios = computeWhatIfScenarios({
    startingCapital: capital ?? 0,
    riskPct: riskPct ?? 0,
    rrRatio: rr ?? 0,
    winRatePct: winRate ?? 0,
  });

  return (
    <SectionCard title="What-If Scenario Simulator" icon={<FlaskConical size={16} className="text-primary" />}>
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Starting Capital" value={capital} onChange={setCapital} step={1000} prefix={currency === "INR" ? "₹" : undefined} suffix={currency === "USDT" ? "USDT" : undefined} />
        <NumberField label="Risk %" value={riskPct} onChange={setRiskPct} step={0.1} suffix="%" />
        <NumberField label="R:R Ratio" value={rr} onChange={setRR} step={0.1} />
        <NumberField label="Win Rate" value={winRate} onChange={setWinRate} step={1} suffix="%" />
      </div>

      <div className="overflow-x-auto -mx-2">
        <Table className="min-w-[420px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Trades</TableHead>
              <TableHead className="text-emerald-500">Best Case (All Wins)</TableHead>
              <TableHead>Expected (at Win Rate)</TableHead>
              <TableHead className="text-rose-500">Worst Case (All Losses)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarios.map((row) => (
              <TableRow key={row.trades}>
                <TableCell className="font-semibold">{row.trades}</TableCell>
                <TableCell className="text-emerald-500">{formatCurrency(row.bestCase, currency)}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(row.expected, currency)}</TableCell>
                <TableCell className="text-rose-500">{formatCurrency(row.worstCase, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
        These are <span className="font-semibold text-foreground">hypothetical scenarios</span>, not predictions of future performance. Real results depend on execution, variance, and market conditions.
      </p>

      <ExpandableFormula formula={`Best Case = Capital + Trades × R:R × Risk Amount\nWorst Case = Capital − Trades × Risk Amount\nExpected = Capital + Trades × [Win Rate × R:R − Loss Rate × 1] × Risk Amount`} />
    </SectionCard>
  );
}
