import type { Summary } from "@/lib/journal/metrics";
import { money, pct, signedNumber } from "./shared";

interface Ratio {
  label: string;
  value: string;
  note: string;
}

function ratios(s: Summary): Ratio[] {
  const dash = "—";
  return [
    {
      label: "Win rate",
      value: s.winRate == null ? dash : pct(s.winRate, 0),
      note: `${s.wins} won, ${s.losses} lost or flat`,
    },
    {
      label: "Expectancy",
      value: s.expectancy == null ? dash : money(s.expectancy),
      note: "Average net result per trade",
    },
    {
      label: "Profit factor",
      value: s.profitFactor == null ? dash : s.profitFactor === Infinity ? "No losses" : s.profitFactor.toFixed(2),
      note: "Net won divided by net lost",
    },
    {
      label: "Average R",
      value: s.avgR == null ? dash : signedNumber(s.avgR, 2, "R"),
      note: s.rCount ? `Across ${s.rCount} trades with a stop` : "Add stops to measure R",
    },
    {
      label: "Average win / loss",
      value: s.avgWin == null || s.avgLoss == null ? dash : `${money(s.avgWin, { sign: false })} / ${money(s.avgLoss, { sign: false })}`,
      note: "Size of a typical win against a typical loss",
    },
    {
      label: "Break-even move",
      value: s.breakevenMovePct == null ? dash : `${s.breakevenMovePct.toFixed(3)}%`,
      note: "Price move a trade needs just to cover its fees",
    },
    {
      label: "Max drawdown",
      value: money(s.maxDrawdown),
      note: "Deepest fall in net P&L from a previous high",
    },
    {
      label: "Longest losing run",
      value: `${s.longestLosingStreak} trade${s.longestLosingStreak === 1 ? "" : "s"}`,
      note: "Consecutive trades without a net win",
    },
  ];
}

export default function RatioList({ summary }: { summary: Summary }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-1">
      {ratios(summary).map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 border-t border-rule py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(2)]:border-t">
          <dt className="min-w-0">
            <span className="block text-sm text-paper">{r.label}</span>
            <span className="block text-xs text-fog">{r.note}</span>
          </dt>
          <dd className="shrink-0 font-display text-lg font-semibold tracking-[-0.01em] text-paper">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
