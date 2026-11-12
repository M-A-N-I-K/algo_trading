import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/testerReports/analyze";
import { cn } from "@/lib/utils";

export const STEPS = [
  { id: "numbers", know: "know", strong: "your numbers", pre: "" },
  { id: "streak", know: "know", strong: "losing streak", pre: "your normal" },
  { id: "trades", know: "know", strong: "trades", pre: "how many", sub: "the target really takes" },
  { id: "worst-day", know: "know", strong: "worst day", pre: "your" },
  { id: "attempts", know: "know", strong: "attempts", pre: "how many", sub: "you actually need to pass one" },
] as const;

export const VERDICT_LABEL: Record<Verdict, string> = { buy: "Buy it", slow: "Only with others", skip: "Skip it" };
export const VERDICT_CLASS: Record<Verdict, string> = {
  buy: "bg-gain text-ink",
  slow: "bg-fees text-ink",
  skip: "bg-loss text-paper",
};

export function VerdictPill({ verdict, className, href }: { verdict: Verdict; className?: string; href?: string }) {
  const cls = cn("inline-flex items-center justify-center rounded-full px-5 py-2 font-display text-[15px] font-semibold whitespace-nowrap", VERDICT_CLASS[verdict], className);
  return href ? <a href={href} className={cls}>{VERDICT_LABEL[verdict]}</a> : <span className={cls}>{VERDICT_LABEL[verdict]}</span>;
}

/** The five "know" steps joined by a line, ending in the verdict, each a link to its section. */
export function Stepper({ verdict }: { verdict: Verdict }) {
  return (
    <nav aria-label="Report sections" className="rounded-[10px] border border-rule bg-deck px-5 py-6">
      <ol className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-0">
        {STEPS.map((s) => (
          <li key={s.id} className="relative flex-1 lg:pr-4">
            {/* the connecting line, behind the boxes */}
            <span aria-hidden="true" className="absolute top-[18px] left-9 right-0 hidden h-[3px] bg-gain lg:block" />
            <a href={`#${s.id}`} className="group relative flex gap-3 lg:flex-col lg:gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-gain text-ink">
                <Check size={20} strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-[15px] italic text-mist">{s.know}</span>
                <span className="block text-[15px] leading-snug text-paper group-hover:underline group-hover:underline-offset-4">
                  {s.pre && `${s.pre} `}
                  <strong className="font-semibold">{s.strong}</strong>
                </span>
                {"sub" in s && <span className="mt-0.5 block text-xs text-mist">{s.sub}</span>}
              </span>
            </a>
          </li>
        ))}
        <li className="flex items-start lg:pl-2">
          <VerdictPill verdict={verdict} href="#verdict" className="px-6 py-2.5 text-[17px] shadow-[0_0_24px_-6px] shadow-current" />
        </li>
      </ol>
    </nav>
  );
}

/** A dashboard section headed like the stepper: "know" in italics, then the title. */
export function Section({ id, step, title, note, children }: { id: string; step: number; title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 min-w-0 rounded-[10px] border border-rule bg-deck p-5">
      <div className="mb-4">
        <p className="flex items-center gap-2 text-xs text-mist">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-gain text-ink"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>
          Step {step} · <span className="font-serif text-[14px] italic">know</span>
        </p>
        <h2 className="mt-1 font-display text-[19px] font-semibold tracking-[-0.01em] text-paper">{title}</h2>
        {note && <p className="mt-1 max-w-[70ch] text-[13px] leading-snug text-fog">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** Cumulative R after each trade, with the drawdown below the running peak shaded. Static SVG. */
export function RCurve({ equity, height = 180 }: { equity: number[]; height?: number }) {
  const W = 800, H = height, pad = { l: 40, r: 8, t: 8, b: 18 };
  const lo = Math.min(0, ...equity), hi = Math.max(0, ...equity);
  const x = (i: number) => pad.l + (equity.length > 1 ? (i / (equity.length - 1)) * (W - pad.l - pad.r) : 0);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  let peak = -Infinity;
  const peaks = equity.map((v) => (peak = Math.max(peak, v)));
  const line = equity.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const dd = peaks.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") + [...equity].reverse().map((v, j) => `L${x(equity.length - 1 - j).toFixed(1)},${y(v).toFixed(1)}`).join("") + "Z";
  const step = Math.max(1, Math.ceil((hi - lo) / 4 / 5) * 5);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Cumulative result in R over ${equity.length - 1} trades, ending at ${equity[equity.length - 1].toFixed(1)}R`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-mist" : "stroke-rule"} strokeWidth={1} />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-mist text-[11px]">{v}R</text>
        </g>
      ))}
      <path d={dd} className="fill-loss/25" />
      <path d={line} fill="none" className="stroke-gain" strokeWidth={2} strokeLinejoin="round" />
      <text x={pad.l} y={H - 4} className="fill-mist text-[11px]">trade 1</text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-mist text-[11px]">trade {equity.length - 1}</text>
    </svg>
  );
}

/** A labelled horizontal bar, for small distributions. */
export function Bar({ label, value, max, tone = "gain", right }: { label: ReactNode; value: number; max: number; tone?: "gain" | "loss" | "fees"; right?: ReactNode }) {
  const w = Math.max(0, Math.min(1, max > 0 ? Math.abs(value) / max : 0)) * 100;
  const bg = { gain: "bg-gain", loss: "bg-loss", fees: "bg-fees" }[tone];
  return (
    <div className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-[13px]">
      <span className="text-fog">{label}</span>
      <span className="h-2.5 rounded-full bg-deck-2"><span className={cn("block h-full rounded-full", bg)} style={{ width: `${w}%` }} /></span>
      <span className="text-right tabular-nums text-paper">{right ?? value}</span>
    </div>
  );
}

export function BackLink() {
  return <Link href="/tester-reports" className="text-[13px] text-fog underline-offset-4 hover:underline">← All tester reports</Link>;
}
