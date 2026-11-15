import { Download } from "lucide-react";
import { Stat, tableClass, tdClass, thClass } from "@/components/kit";
import { signedNumber, toneClass } from "@/components/viz/format";
import type { Dashboard } from "@/lib/testerReports/dashboard";
import type { HistBin, SplitRow } from "@/lib/testerReports/report";
import { EXIT_LABEL } from "@/lib/testerReports/report";
import { cn } from "@/lib/utils";
import BalanceChart from "./BalanceChart";

const R = (v: number, d = 1) => signedNumber(v, d, "R");
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const hours = (h: number | null) =>
  h === null
    ? "—"
    : h >= 48
      ? `${(h / 24).toFixed(1)} days`
      : `${h.toFixed(1)} h`;
const RECENT = 50;
const money = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

function Block({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[10px] border border-rule bg-deck p-5",
        className,
      )}
    >
      <h3 className="font-display text-[16px] font-semibold text-paper">
        {title}
      </h3>
      {note && (
        <p className="mt-1 max-w-[70ch] text-[13px] leading-snug text-fog">
          {note}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Green for a winning month, red for a losing one, stronger the bigger it is; no trades stays blank. */
function cellStyle(r: number, max: number) {
  const a = Math.round(12 + Math.min(1, Math.abs(r) / max) * 58);
  return {
    background: `color-mix(in oklab, var(${r >= 0 ? "--gain" : "--loss"}) ${a}%, transparent)`,
  };
}

function MonthlyTable({ d }: { d: Dashboard }) {
  const rows = d.report.monthly;
  const max = Math.max(
    1,
    ...rows.flatMap((y) => y.months.map((m) => Math.abs(m?.r ?? 0))),
  );
  const risk = d.home.riskPct;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-[2px] text-[12px] tabular-nums">
        <thead>
          <tr>
            <th className="px-1.5 py-1 text-left font-normal text-mist">
              Year
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                className="px-1 py-1 text-center font-normal text-mist"
              >
                {m}
              </th>
            ))}
            <th className="px-1.5 py-1 text-right font-normal text-mist">
              Year
            </th>
            <th className="px-1.5 py-1 text-right font-normal text-mist">
              % at {risk}%
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y) => (
            <tr key={y.year}>
              <th
                scope="row"
                className="px-1.5 py-1.5 text-left font-medium text-paper"
              >
                {y.year}
              </th>
              {y.months.map((m, i) => (
                <td
                  key={i}
                  className={cn(
                    "rounded-[4px] px-1 py-1.5 text-center",
                    m ? "text-paper" : "text-mist/40",
                  )}
                  style={m && m.r !== 0 ? cellStyle(m.r, max) : undefined}
                  title={
                    m
                      ? `${MONTHS[i]} ${y.year}: ${R(m.r, 2)} from ${m.trades} trade${m.trades > 1 ? "s" : ""} (${(m.r * risk).toFixed(1)}% at ${risk}%)`
                      : `${MONTHS[i]} ${y.year}: no trades`
                  }
                >
                  {m ? m.r.toFixed(1) : "·"}
                </td>
              ))}
              <td
                className={cn(
                  "px-1.5 py-1.5 text-right font-semibold",
                  toneClass(y.r),
                )}
              >
                {R(y.r)}
              </td>
              <td className={cn("px-1.5 py-1.5 text-right", toneClass(y.r))}>
                {signedNumber(y.r * risk, 1, "%")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-mist">
        Net R per month by close time; hover a month for its trades and its % of
        the account. Green made money, red lost, deeper colour for bigger
        months.
      </p>
    </div>
  );
}

function Distribution({ bins, total }: { bins: HistBin[]; total: number }) {
  const W = 420,
    H = 170,
    pad = { l: 30, b: 22, t: 8 };
  const max = Math.max(1, ...bins.map((b) => b.count));
  const bw = (W - pad.l) / bins.length;
  const y = (c: number) => pad.t + (1 - c / max) * (H - pad.t - pad.b);
  const label = (b: HistBin) =>
    `${b.open === "below" ? "≤" : b.open === "above" ? "≥" : ""}${b.at}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`R distribution of ${total} trades: ${bins.map((b) => `${b.count} from ${b.from} to ${b.to}R`).join(", ")}`}
    >
      {[0, Math.round(max / 2), max].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W} y1={y(v)} y2={y(v)} className="stroke-rule" />
          <text
            x={pad.l - 5}
            y={y(v) + 4}
            textAnchor="end"
            className="fill-mist text-[10px]"
          >
            {v}
          </text>
        </g>
      ))}
      {bins.map((b, i) => {
        const h = H - pad.b - y(b.count);
        return (
          <g key={b.from}>
            <title>{`${b.open === "below" ? `Below ${b.to}R` : b.open === "above" ? `Above ${b.from}R` : `${b.from}R to ${b.to}R`}: ${b.count} trade${b.count === 1 ? "" : "s"} (${((b.count / total) * 100).toFixed(0)}%)`}</title>
            <rect
              x={pad.l + i * bw}
              y={pad.t}
              width={bw}
              height={H - pad.t - pad.b}
              fill="transparent"
            />
            {b.count > 0 && (
              <rect
                x={pad.l + i * bw + 1}
                y={y(b.count)}
                width={Math.max(1, bw - 2)}
                height={Math.max(1, h)}
                rx={Math.min(4, h / 2)}
                className={
                  b.at < 0 ? "fill-loss" : b.at > 0 ? "fill-gain" : "fill-mist"
                }
              />
            )}
            {(bins.length <= 10 || b.at % 1 === 0) && (
              <text
                x={pad.l + i * bw + bw / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-mist text-[10px]"
              >
                {label(b)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SplitTable({
  rows,
  keyLabel,
}: {
  rows: SplitRow[];
  keyLabel: string;
}) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.netR)));
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(tableClass, "min-w-[420px]")}>
        <thead>
          <tr>
            <th className={thClass}>{keyLabel}</th>
            <th className={cn(thClass, "text-right")}>Trades</th>
            <th className={cn(thClass, "text-right")}>Won</th>
            <th className={cn(thClass, "text-right")}>PF</th>
            <th className={cn(thClass, "text-right")}>Avg</th>
            <th className={cn(thClass, "w-[30%]")}>Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={cn(tdClass, "whitespace-nowrap text-paper")}>
                {r.key}
              </td>
              <td className={cn(tdClass, "text-right tabular-nums")}>
                {r.trades}
              </td>
              <td className={cn(tdClass, "text-right tabular-nums")}>
                {r.winPct.toFixed(0)}%
              </td>
              <td
                className={cn(
                  tdClass,
                  "text-right tabular-nums",
                  r.profitFactor === null
                    ? ""
                    : r.profitFactor >= 1
                      ? "text-gain-ink"
                      : "text-loss-ink",
                )}
              >
                {r.profitFactor?.toFixed(2) ?? "—"}
              </td>
              <td
                className={cn(
                  tdClass,
                  "text-right tabular-nums",
                  toneClass(r.avgR),
                )}
              >
                {R(r.avgR, 2)}
              </td>
              <td className={tdClass}>
                <span className="flex items-center gap-2 pl-3">
                  <span className="h-2 flex-1 rounded-full bg-deck-2">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        r.netR >= 0 ? "bg-gain" : "bg-loss",
                      )}
                      style={{ width: `${(Math.abs(r.netR) / max) * 100}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "w-14 text-right tabular-nums",
                      toneClass(r.netR),
                    )}
                  >
                    {R(r.netR)}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FullReport({ d }: { d: Dashboard }) {
  const { report: rep, home, numbers: n } = d;
  const s = rep.stats;
  const risk = home.riskPct;
  const account = home.account.name.replace("FundingPips ", "");
  const recent = d.trades
    .slice(-RECENT)
    .map((t, k) => ({ ...t, i: d.trades.length - RECENT + k + 1 }))
    .filter((t) => t.i > 0)
    .reverse();
  const fmtTime = (t: string) => t.slice(0, 16);

  return (
    <section id="report" className="scroll-mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-rule pt-6">
        <div>
          <h2 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-paper">
            Full report
          </h2>
          <p className="mt-1 max-w-[75ch] text-[13px] text-fog">
            Everything MT5&apos;s own report shows, in R and in dollars on the{" "}
            {account} at {risk}% a trade. Times are FundingPips server time.
          </p>
        </div>
        <a
          href={`/tester-reports/${d.info.slug}/trades.csv`}
          className="inline-flex items-center gap-2 rounded-md border border-rule bg-deck px-3 py-2 text-sm text-paper hover:bg-deck-2"
          download
        >
          <Download size={15} aria-hidden="true" /> All {n.trades} trades (CSV)
        </a>
      </div>

      <Block title="Balance and drawdown">
        <BalanceChart
          points={rep.timeline}
          riskPct={risk}
          size={home.account.size}
          maxLossPct={home.account.maxLossPct}
          accountName={account}
        />
      </Block>

      <Block title="Report statistics">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat
            label="Recovery factor"
            value={s.recoveryFactor?.toFixed(2) ?? "—"}
            note="Net R ÷ deepest drawdown"
            tone={(s.recoveryFactor ?? 0) >= 3 ? "text-gain-ink" : undefined}
          />
          <Stat
            label="Sharpe, per trade"
            value={s.sharpe?.toFixed(2) ?? "—"}
            note={`Average R ÷ its spread (σ ${s.stdevR}R)`}
          />
          <Stat
            label="SQN"
            value={s.sqn?.toFixed(2) ?? "—"}
            note="Van Tharp: above 2 is good, above 3 excellent"
            tone={(s.sqn ?? 0) >= 2 ? "text-gain-ink" : undefined}
          />
          <Stat
            label="Longest without a new high"
            value={`${s.longestDrawdownDays} days`}
            note={
              s.longestDrawdownOpen
                ? "Still below its high at the end of the test"
                : "Peak to the next peak"
            }
            tone={s.longestDrawdownOpen ? "text-fees-ink" : undefined}
          />
          <Stat
            label="Winning months"
            value={`${s.profitableMonthsPct}%`}
            note={`of ${s.months} months with trades`}
          />
          <Stat
            label="Trades a month"
            value={s.tradesPerMonth}
            note={`${s.longPct}% long, ${100 - s.longPct}% short`}
          />
          <Stat
            label="Hold, winners"
            value={hours(s.avgHoldHoursWin)}
            note="Average, open to close"
          />
          <Stat
            label="Hold, losers"
            value={hours(s.avgHoldHoursLoss)}
            note="Average, open to close"
          />
        </div>
      </Block>

      <Block title="Month by month">
        <MonthlyTable d={d} />
      </Block>

      <div className="grid gap-5 lg:grid-cols-2">
        <Block
          title="Result distribution"
          note="How many trades ended at each result, in half-R bands. Full stops sit at −1R, targets at the planned R."
        >
          <Distribution bins={rep.distribution} total={n.trades} />
        </Block>
        <Block title="Direction and exit">
          <div className="flex flex-col gap-5">
            <SplitTable rows={rep.bySide} keyLabel="Direction" />
            <SplitTable rows={rep.byExit} keyLabel="How it closed" />
          </div>
        </Block>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Block title="By weekday" note="By the day the trade opened.">
          <SplitTable rows={rep.byWeekday} keyLabel="Day" />
        </Block>
        <Block
          title="By opening hour"
          note="Server time (UTC+2, UTC+3 in summer)."
        >
          <div className="max-h-[420px] overflow-y-auto">
            <SplitTable rows={rep.byHour} keyLabel="Hour" />
          </div>
        </Block>
      </div>

      <Block
        title={`Last ${recent.length} trades`}
        note="Newest first. Download the CSV for all of them with the running total."
      >
        <div className="relative max-h-[480px] overflow-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={cn(thClass, "sticky top-0 bg-deck")}>#</th>
                <th className={cn(thClass, "sticky top-0 bg-deck")}>Opened</th>
                <th className={cn(thClass, "sticky top-0 bg-deck")}>Closed</th>
                <th className={cn(thClass, "sticky top-0 bg-deck")}>Side</th>
                <th className={cn(thClass, "sticky top-0 bg-deck")}>Exit</th>
                <th className={cn(thClass, "sticky top-0 bg-deck text-right")}>
                  Result
                </th>
                <th className={cn(thClass, "sticky top-0 bg-deck text-right")}>
                  $ at {risk}%
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.i}>
                  <td className={cn(tdClass, "tabular-nums text-mist")}>
                    {t.i}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>
                    {fmtTime(t.open)}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>
                    {fmtTime(t.close)}
                  </td>
                  <td className={tdClass}>
                    {t.side === "LONG" ? "Long" : "Short"}
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap text-fog")}>
                    {EXIT_LABEL[t.exit].split(" (")[0]}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      "text-right tabular-nums",
                      toneClass(t.r),
                    )}
                  >
                    {R(t.r, 2)}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      "text-right tabular-nums",
                      toneClass(t.r),
                    )}
                  >
                    {money((t.r * risk * home.account.size) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </section>
  );
}
