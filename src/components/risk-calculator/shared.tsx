"use client";

import { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RiskLevel } from "@/lib/riskCalculator";

export function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-help align-middle">
        <HelpCircle size={13} />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function SectionCard({
  title,
  icon,
  tooltip,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  tooltip?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`bg-deck border-border ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-display font-bold">
          {icon}
          {title}
          {tooltip && <InfoTooltip text={tooltip} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  prefix?: string;
  step?: number;
  min?: number;
  placeholder?: string;
  tooltip?: string;
  error?: string;
  optional?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  step = 0.01,
  min,
  placeholder,
  tooltip,
  error,
  optional,
}: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        {label}
        {optional && <span className="text-[10px] font-normal text-muted-foreground/70">(optional)</span>}
        {tooltip && <InfoTooltip text={tooltip} />}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          step={step}
          min={min}
          value={value === null || Number.isNaN(value) ? "" : value}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
          placeholder={placeholder}
          className={`w-full bg-input/40 border rounded-lg px-4 py-2.5 text-sm outline-none transition-all focus:border-primary text-foreground placeholder:text-muted-foreground/50 ${
            prefix ? "pl-8" : ""
          } ${suffix ? "pr-14" : ""} ${error ? "border-destructive" : "border-border"}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <span className="text-[11px] text-destructive font-medium">{error}</span>}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  sub,
  tone = "default",
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative" | "accent";
  tooltip?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-rose-500",
    accent: "text-primary",
  }[tone];

  return (
    <div>
      <span className="flex items-center gap-1.5 text-xs text-mist">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      <div className={`text-xl font-display font-bold mt-1 ${toneClass}`}>{value}</div>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const config: Record<RiskLevel, { label: string; tone: string; bars: number }> = {
    conservative: { label: "Conservative risk", tone: "var(--gain)", bars: 1 },
    moderate: { label: "Moderate risk", tone: "var(--fees)", bars: 2 },
    aggressive: { label: "Aggressive risk", tone: "var(--loss)", bars: 3 },
  };
  const c = config[level];
  // Three steps, filled up to the level, so the level reads without colour too.
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-rule px-2.5 py-1 text-sm text-paper">
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className="w-1 rounded-sm" style={{ height: 4 + i * 3, background: i <= c.bars ? c.tone : "var(--rule)" }} />
        ))}
      </span>
      {c.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: "amount" | "percent" }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-xs text-mist">
      {source === "amount" ? "Set by amount" : "Set by percentage"}
    </span>
  );
}

export function ExpandableFormula({ formula, children }: { formula: string; children?: ReactNode }) {
  return (
    <details className="group">
      <summary className="text-[11px] text-primary cursor-pointer select-none list-none flex items-center gap-1 hover:underline">
        How is this calculated?
      </summary>
      <div className="mt-2 p-3 rounded-lg bg-muted/50 text-[11px] text-muted-foreground font-mono leading-relaxed">
        {formula}
        {children}
      </div>
    </details>
  );
}
