"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, CircleX, Crosshair, Flag, ShieldAlert } from "lucide-react";
import { Button, Callout, Panel, Segmented, Tag, signedNumber, tableClass, tdClass, thClass, toneClass } from "@/components/kit";
import type { GuideStep, StrategyGuide } from "@/guides";
import GuideDiagram from "./GuideDiagram";

const DIFFICULTY_TONE = { Beginner: "gain", Intermediate: "fees", Advanced: "loss" } as const;

function Steps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-deck-2 font-display text-[12px] font-semibold text-paper">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-paper">{s.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-fog">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items, icon: Icon, iconClass }: { items: string[]; icon: typeof CircleX; iconClass: string }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-fog">
          <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${iconClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function OrderCard({ icon: Icon, title, text, tone }: { icon: typeof Flag; title: string; text: string; tone: string }) {
  return (
    <div className="rounded-[10px] border border-rule bg-deck p-5">
      <p className={`flex items-center gap-2 font-display text-[15px] font-semibold ${tone}`}>
        <Icon size={16} aria-hidden="true" /> {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fog">{text}</p>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const done = checked.every(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={item}>
            <label className="flex cursor-pointer gap-3 rounded-md px-2 py-1.5 text-sm text-paper hover:bg-deck-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gain)]"
                checked={checked[i]}
                onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
              />
              <span className={checked[i] ? "text-fog line-through decoration-mist" : ""}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={`text-sm ${done ? "text-gain-ink" : "text-fog"}`}>
          {done ? "Every box is ticked. The trade follows the rules." : `${checked.filter(Boolean).length} of ${items.length} ticked. Don't place the trade until all are.`}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setChecked(items.map(() => false))}>
          Reset
        </Button>
      </div>
    </div>
  );
}

export default function StrategyGuideView({ guide }: { guide: StrategyGuide }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const losers = guide.backtest.rows.filter((r) => r.returnPct < 0).map((r) => r.symbol);

  return (
    <article className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/guides" className="inline-flex items-center gap-1.5 text-[13px] text-fog hover:text-paper">
          <ArrowLeft size={14} aria-hidden="true" /> All guides
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-paper">{guide.name}</h1>
            <Tag tone={DIFFICULTY_TONE[guide.difficulty]}>{guide.difficulty}</Tag>
            <Tag>{guide.style}</Tag>
          </div>
          <p className="mt-1 max-w-[70ch] text-[15px] text-fog">{guide.tagline}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-[10px] border border-rule bg-deck p-5 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Charts", guide.timeframes],
          ["Direction", guide.direction],
          ["Markets", guide.markets],
          ["How often", guide.frequency],
          ["Time in a trade", guide.holdTime],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[13px] text-fog">{label}</dt>
            <dd className="mt-0.5 text-sm text-paper">{value}</dd>
          </div>
        ))}
      </dl>

      <Callout tone="warning" title="Practise before you risk money">
        Follow this guide on a demo account or with the smallest size your exchange allows for at least 20 trades.{" "}
        {losers.length > 0
          ? `In its last backtest this strategy lost money on ${losers.join(" and ")} (see the bottom of this page).`
          : "A good backtest doesn't guarantee future results (see the bottom of this page)."}
      </Callout>

      <Panel title="How it works">
        <div className="flex flex-col gap-3">
          {guide.summary.map((p) => (
            <p key={p} className="max-w-[75ch] text-sm leading-relaxed text-fog">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-5">
          <GuideDiagram diagram={guide.diagram} />
        </div>
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Words you need" note="Every term the steps below use.">
          <dl className="flex flex-col gap-3">
            {guide.terms.map((t) => (
              <div key={t.term}>
                <dt className="text-sm font-medium text-paper">{t.term}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-fog">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Set up your chart" note="Do this once.">
          <Steps steps={guide.chartSetup} />
        </Panel>
      </div>

      <Panel
        title="Find a trade"
        note="Go through the steps in order. If any step fails, there's no trade."
        aside={
          <Segmented
            label="Trade direction"
            size="sm"
            value={side}
            onChange={setSide}
            options={[
              { value: "long", label: "Long (buy)" },
              { value: "short", label: "Short (sell)" },
            ]}
          />
        }
      >
        <Steps steps={side === "long" ? guide.long : guide.short} />
      </Panel>

      <section aria-label="Orders" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OrderCard icon={Crosshair} title="Entry" text={guide.entry} tone="text-signal" />
        <OrderCard icon={ShieldAlert} title="Stop loss" text={guide.stop} tone="text-loss-ink" />
        <OrderCard icon={Flag} title="Take profit" text={guide.target} tone="text-gain-ink" />
      </section>

      <Panel title="While you're in the trade">
        <Steps steps={guide.manage} />
        <p className="mt-4 text-sm text-fog">
          Not sure how big to go? Use{" "}
          <Link href="/risk" className="text-paper underline underline-offset-2">
            Position size
          </Link>
          : enter your entry, stop and the amount you're willing to lose, and it gives you the quantity.
        </p>
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Don't trade when">
          <Bullets items={guide.skip} icon={CircleX} iconClass="text-loss-ink" />
        </Panel>
        <Panel title="Common beginner mistakes">
          <Bullets items={guide.mistakes} icon={CircleX} iconClass="text-fees-ink" />
        </Panel>
      </div>

      <Panel title="Worked example" note={guide.example.title}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-fog marker:text-mist">
          {guide.example.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Panel>

      <Panel title="Pre-trade checklist" note="Tick each box before you place the order. Ticks reset when you leave the page.">
        <Checklist items={guide.checklist} />
      </Panel>

      <Panel title="How it did in the last backtest" note={`${guide.backtest.period}. ${guide.backtest.settings}`}>
        <div className="overflow-x-auto">
          <table className={`${tableClass} min-w-[36rem] whitespace-nowrap`}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>Market</th>
                <th scope="col" className={thClass}>Charts</th>
                <th scope="col" className={`${thClass} text-right`}>Trades</th>
                <th scope="col" className={`${thClass} text-right`}>Win rate</th>
                <th scope="col" className={`${thClass} text-right`}>Profit factor</th>
                <th scope="col" className={`${thClass} text-right`}>Return</th>
                <th scope="col" className={`${thClass} text-right`}>Max drawdown</th>
              </tr>
            </thead>
            <tbody>
              {guide.backtest.rows.map((r) => (
                <tr key={r.symbol}>
                  <td className={tdClass}>{r.symbol}</td>
                  <td className={`${tdClass} text-fog`}>{r.timeframe}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{r.trades}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{r.winRatePct.toFixed(1)}%</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{r.profitFactor.toFixed(2)}</td>
                  <td className={`${tdClass} text-right tabular-nums ${toneClass(r.returnPct)}`}>{signedNumber(r.returnPct, 1, "%")}</td>
                  <td className={`${tdClass} text-right tabular-nums text-loss-ink`}>{r.maxDrawdownPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-[75ch] text-sm leading-relaxed text-fog">{guide.backtest.verdict}</p>
        <p className="mt-3 text-sm text-fog">
          Run it yourself on other markets or dates from{" "}
          <Link href="/backtest" className="text-paper underline underline-offset-2">
            Backtests
          </Link>
          .
        </p>
      </Panel>

      <Panel title="After every trade">
        <Bullets
          icon={CircleCheck}
          iconClass="text-gain-ink"
          items={[
            "Log it in the Journal with this strategy selected, and tick its checklist in the trade's notes.",
            "Write one line on whether you followed every rule. Rule-breaking trades are the first thing to cut.",
            "After 20 trades, compare your results with the backtest above. Much worse usually means a rule is being read differently.",
          ]}
        />
      </Panel>
    </article>
  );
}
