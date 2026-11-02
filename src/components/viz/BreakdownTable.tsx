"use client";

import type { GroupRow } from "@/lib/journal/metrics";
import { money, pct, toneClass } from "./shared";

/**
 * Rows of a grouping (symbol, side, exit type…) with the P&L split into
 * gross, fees, funding and net. The bar shows net on a shared diverging
 * scale so rows compare at a glance; the numbers carry the detail.
 */
export default function BreakdownTable({
  rows,
  keyLabel,
  columns = "full",
  labelOf = (k) => k,
}: {
  rows: GroupRow[];
  keyLabel: string;
  columns?: "full" | "compact";
  labelOf?: (key: string) => string;
}) {
  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(r.net)));
  const full = columns === "full";

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse whitespace-nowrap text-sm">
        <thead>
          <tr className="text-left text-xs text-mist">
            <th scope="col" className="py-2 pr-3 font-normal">{keyLabel}</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Trades</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Win rate</th>
            {full && (
              <>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Price P&amp;L</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Fees</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Funding</th>
              </>
            )}
            <th scope="col" className="py-2 pr-3 text-right font-normal">Net</th>
            <th scope="col" className="w-[22%] py-2 font-normal">
              <span className="sr-only">Net, relative</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = (Math.abs(r.net) / maxAbs) * 50;
            return (
              <tr key={r.key} className="border-t border-rule">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium text-paper">{labelOf(r.key)}</th>
                <td className="py-2.5 pr-3 text-right text-fog">{r.count}</td>
                <td className="py-2.5 pr-3 text-right text-fog">{pct(r.winRate, 0)}</td>
                {full && (
                  <>
                    <td className={`py-2.5 pr-3 text-right ${toneClass(r.gross)}`}>{money(r.gross)}</td>
                    <td className="py-2.5 pr-3 text-right text-fees-ink">{r.fees ? money(-r.fees) : "$0.00"}</td>
                    <td className="py-2.5 pr-3 text-right text-funding-ink">{money(r.funding)}</td>
                  </>
                )}
                <td className={`py-2.5 pr-3 text-right font-medium ${toneClass(r.net)}`}>{money(r.net)}</td>
                <td className="min-w-16 py-2.5" aria-hidden="true">
                  <div className="relative h-2">
                    <div className="absolute bottom-[-4px] top-[-4px] left-1/2 w-px bg-mist/60" />
                    <div
                      className="absolute top-0 h-2 rounded-[3px]"
                      style={{
                        width: `${w}%`,
                        left: r.net >= 0 ? "50%" : `${50 - w}%`,
                        background: r.net >= 0 ? "var(--gain)" : "var(--loss)",
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
