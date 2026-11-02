"use client";

import type { PnlBreakdown, Summary } from "@/lib/journal/metrics";
import { money, pct } from "./shared";

interface Step {
  key: string;
  label: string;
  detail: string;
  from: number;
  to: number;
  value: number;
  color: string;
}

function headline(b: PnlBreakdown): string {
  if (b.count === 0) return "No closed trades in this period.";
  const costs = b.fees - b.funding; // funding received reduces cost
  if (b.gross > 0 && b.net < 0) {
    const times = costs / b.gross;
    return times >= 2
      ? `Your trades earned ${money(b.gross, { sign: false })} on price. Fees and funding cost ${times.toFixed(1)} times that.`
      : `Your trades earned ${money(b.gross, { sign: false })} on price, but fees and funding cost more.`;
  }
  if (b.gross > 0) {
    return `Fees and funding kept ${pct(costs / b.gross, 0)} of the ${money(b.gross, { sign: false })} you earned on price.`;
  }
  if (b.gross < 0) {
    return `Price moved against you by ${money(-b.gross, { sign: false })}, and costs added ${money(costs, { sign: false })} on top.`;
  }
  return "Price P&L was flat; costs decided the result.";
}

export default function PnlBridge({
  breakdown,
  summary,
  fundingEvents,
}: {
  breakdown: PnlBreakdown;
  summary: Summary;
  fundingEvents?: number;
}) {
  const b = breakdown;
  const afterGross = b.gross;
  const afterFees = afterGross - b.fees;
  const afterFunding = afterFees + b.funding;

  const steps: Step[] = [
    {
      key: "gross",
      label: "Price P&L",
      detail: `${b.count} closed trade${b.count === 1 ? "" : "s"}`,
      from: 0,
      to: afterGross,
      value: b.gross,
      color: b.gross >= 0 ? "var(--gain)" : "var(--loss)",
    },
    {
      key: "fees",
      label: "Fees",
      detail:
        summary.avgFee != null
          ? `${money(summary.avgFee, { sign: false })} a trade${
              summary.breakevenMovePct != null ? `, ${summary.breakevenMovePct.toFixed(3)}% of size` : ""
            }`
          : "No fee data",
      from: afterGross,
      to: afterFees,
      value: -b.fees,
      color: "var(--fees)",
    },
    {
      key: "funding",
      label: "Funding",
      detail: b.funding >= 0 ? "Received while holding" : `Paid while holding${fundingEvents ? `, ${fundingEvents} settlements` : ""}`,
      from: afterFees,
      to: afterFunding,
      value: b.funding,
      color: "var(--funding)",
    },
    {
      key: "net",
      label: "Net P&L",
      detail: "What reached your wallet",
      from: 0,
      to: b.net,
      value: b.net,
      color: b.net >= 0 ? "var(--gain)" : "var(--loss)",
    },
  ];

  const points = [0, afterGross, afterFees, afterFunding, b.net];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  // Room either side for the value labels that sit outside the bar ends.
  const domainLo = lo - span * 0.2;
  const domainHi = hi + span * 0.2;
  const x = (v: number) => ((v - domainLo) / (domainHi - domainLo)) * 100;

  return (
    <section aria-labelledby="bridge-title" className="mb-10">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div>
          <h2 id="bridge-title" className="text-sm text-fog">
            Net P&amp;L
          </h2>
          <p className="font-display text-[56px] font-bold leading-none tracking-[-0.045em] text-paper sm:text-[72px]">
            {money(b.net)}
          </p>
        </div>
        <p className="max-w-[46ch] text-balance text-[17px] leading-snug text-paper/90 lg:pb-2 lg:text-right">{headline(b)}</p>
      </div>

      <div className="mt-8" role="table" aria-label="How net P&L is made up">
        {steps.map((step, i) => {
          const left = Math.min(x(step.from), x(step.to));
          const width = Math.max(Math.abs(x(step.to) - x(step.from)), 0.4);
          const negative = step.to < step.from;
          const isNet = step.key === "net";
          return (
            <div
              key={step.key}
              role="row"
              className={`grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-4 py-2 sm:grid-cols-[13rem_1fr] ${
                isNet ? "mt-2 border-t border-rule pt-4" : ""
              }`}
            >
              <div role="rowheader" className="min-w-0">
                <p className={`text-sm ${isNet ? "font-semibold text-paper" : "text-paper"}`}>{step.label}</p>
                <p className="truncate text-xs text-fog">{step.detail}</p>
              </div>
              <div role="cell" className="relative h-9">
                {/* zero line */}
                <div className="absolute bottom-0 top-0 w-px bg-mist/60" style={{ left: `${x(0)}%` }} />
                <div
                  className="bridge-bar absolute top-1.5 bottom-1.5 rounded-[4px]"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: step.color,
                    transformOrigin: negative ? "right center" : "left center",
                    animationDelay: `${i * 140}ms`,
                  }}
                />
                <span
                  className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-sm ${
                    isNet ? "font-semibold text-paper" : "text-paper"
                  }`}
                  style={
                    negative || (isNet && step.to < 0)
                      ? { right: `${100 - left + 0.8}%` }
                      : { left: `${left + width + 0.8}%` }
                  }
                >
                  {money(step.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
