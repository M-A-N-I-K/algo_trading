"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Trade } from "@/components/trading-journal/DashboardContext";
import { holdMinutesOf, rMultipleOf } from "@/lib/journal/metrics";
import { duration, money, signedNumber, toneClass } from "@/components/viz/shared";
import { Tag } from "@/components/kit";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { accountById } from "@/lib/playbook/config";

const STRATEGY_LABEL = new Map<string, string>(STRATEGY_CATALOG.map((s) => [s.value, s.label]));

interface TradesTableProps {
  filteredTrades: Trade[];
  onEdit?: (t: Trade) => void;
  onDelete?: (id: string) => void;
  onInspect: (t: Trade) => void;
  /** Full journal view: taller scroll area and every column. */
  isFullLog?: boolean;
  hideActions?: boolean;
  /** Per-row: false hides that row's edit and delete buttons. */
  canModify?: (t: Trade) => boolean;
  timeOnly?: boolean;
  /** Kept for call-site compatibility; filters now live on the journal page. */
  symbols?: string[];
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "2-digit" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

const EXIT_LABEL: Record<string, string> = { tpsl: "TP/SL", manual: "Manual", liquidation: "Liquidated" };

function price(v: number) {
  const digits = v >= 1000 ? 2 : v >= 1 ? 4 : 6;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function TradesTable({
  filteredTrades,
  onEdit,
  onDelete,
  onInspect,
  isFullLog = false,
  hideActions = false,
  canModify,
  timeOnly = false,
}: TradesTableProps) {
  const th = "sticky top-0 z-[1] bg-deck py-2.5 pr-4 text-left text-xs font-normal text-mist";
  const thNum = `${th} text-right`;

  return (
    <div className={`relative w-full overflow-x-auto ${isFullLog ? "max-h-[70vh] overflow-y-auto" : ""}`}>
      <table className="w-full min-w-[56rem] border-collapse whitespace-nowrap text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${th} pl-1`}>Closed</th>
            <th scope="col" className={th}>Market</th>
            <th scope="col" className={thNum}>Size</th>
            <th scope="col" className={thNum}>Entry → exit</th>
            {isFullLog && <th scope="col" className={thNum}>Price P&amp;L</th>}
            {isFullLog && <th scope="col" className={thNum}>Fees</th>}
            {isFullLog && <th scope="col" className={thNum}>Funding</th>}
            <th scope="col" className={thNum}>Net</th>
            <th scope="col" className={thNum}>R</th>
            {isFullLog && <th scope="col" className={thNum}>Held</th>}
            <th scope="col" className={th}>Strategy and tags</th>
            {!hideActions && (
              <th scope="col" className={`${th} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {filteredTrades.map((t) => {
            const r = rMultipleOf(t);
            const held = holdMinutesOf(t);
            const closed = new Date(t.time);
            return (
              <tr
                key={t.id}
                className="group cursor-pointer border-t border-rule transition-colors hover:bg-deck-2/60"
                onClick={() => onInspect(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onInspect(t);
                }}
                tabIndex={0}
                aria-label={`${t.symbol} ${t.side.toLowerCase()}, net ${money(t.pnl)}. Open notes.`}
              >
                <td className="py-2.5 pl-1 pr-4 text-fog">
                  {timeOnly ? timeFmt.format(closed) : (
                    <>
                      <span className="text-paper">{dateFmt.format(closed)}</span>{" "}
                      <span className="text-mist">{timeFmt.format(closed)}</span>
                    </>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <span className="font-medium text-paper">{t.symbol}</span>{" "}
                  <Tag tone={t.side === "LONG" ? "gain" : "loss"}>{t.side === "LONG" ? "Long" : "Short"}</Tag>
                  {t.playbookAccountId && (
                    <>
                      {" "}
                      <Tag tone="neutral">{accountById(t.playbookAccountId)?.name ?? t.playbookAccountId}</Tag>
                    </>
                  )}
                  {t.exitType && t.exitType !== "tpsl" && (
                    <>
                      {" "}
                      <Tag tone={t.exitType === "liquidation" ? "loss" : "neutral"}>{EXIT_LABEL[t.exitType] ?? t.exitType}</Tag>
                    </>
                  )}
                  {t.marginCurrency === "INR" && (
                    <>
                      {" "}
                      <Tag>INR</Tag>
                    </>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right text-fog">{t.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                <td className="py-2.5 pr-4 text-right text-fog">
                  {price(t.entryPrice)} <span className="text-mist">→</span> {price(t.exitPrice)}
                </td>
                {isFullLog && (
                  <td className={`py-2.5 pr-4 text-right ${t.grossPnl == null ? "text-mist" : toneClass(t.grossPnl)}`}>
                    {t.grossPnl == null ? "—" : money(t.grossPnl)}
                  </td>
                )}
                {isFullLog && (
                  <td className="py-2.5 pr-4 text-right text-fees-ink">{t.fees == null ? <span className="text-mist">—</span> : money(-t.fees)}</td>
                )}
                {isFullLog && (
                  <td className="py-2.5 pr-4 text-right text-funding-ink">
                    {t.funding == null || Math.abs(t.funding) < 0.005 ? <span className="text-mist">—</span> : money(t.funding)}
                  </td>
                )}
                <td className={`py-2.5 pr-4 text-right font-medium ${toneClass(t.pnl)}`}>{money(t.pnl)}</td>
                <td className={`py-2.5 pr-4 text-right ${r == null ? "text-mist" : toneClass(r)}`}>{r == null ? "—" : signedNumber(r, 2, "R")}</td>
                {isFullLog && <td className="py-2.5 pr-4 text-right text-fog">{held == null ? "—" : duration(held)}</td>}
                <td className="max-w-[16rem] py-2.5 pr-4">
                  <span className="text-fog">{STRATEGY_LABEL.get(t.strategy) ?? t.strategy}</span>
                  {t.tags && t.tags.length > 0 && (
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {t.tags.slice(0, 3).map((tag) => (
                        <Tag key={tag} tone="signal">{tag}</Tag>
                      ))}
                      {t.tags.length > 3 && <Tag>+{t.tags.length - 3}</Tag>}
                    </span>
                  )}
                </td>
                {!hideActions && (
                  <td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {canModify && !canModify(t) ? null : (
                    <div className="flex justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEdit?.(t)}
                        className="rounded-md p-2 text-fog hover:bg-deck-2 hover:text-paper"
                        aria-label={`Edit ${t.symbol} trade`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete?.(t.id)}
                        className="rounded-md p-2 text-fog hover:bg-loss/10 hover:text-loss-ink"
                        aria-label={`Delete ${t.symbol} trade`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {filteredTrades.length === 0 && (
            <tr>
              <td colSpan={14} className="py-12 text-center text-sm text-fog">
                No trades match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
