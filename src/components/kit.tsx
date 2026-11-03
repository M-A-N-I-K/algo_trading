"use client";

// The app's shared building blocks. Every page uses these rather than
// restyling raw elements, so the visual language lives in one place.
// Money colours (gain / loss / fees / funding) are defined in global.css.

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export { Panel, Legend, EmptyState, money, pct, signedNumber, toneClass, duration } from "@/components/viz/shared";

/* ---------- buttons ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-paper text-ink hover:bg-white",
  secondary: "border border-rule bg-deck text-paper hover:bg-deck-2",
  ghost: "text-fog hover:bg-deck-2 hover:text-paper",
  danger: "border border-loss/40 text-loss-ink hover:bg-loss/10",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "md" | "sm" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    size === "md" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-[13px]",
    BUTTON[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <button type={type} className={cn(buttonClass(variant, size), className)} {...props} />;
}

/* ---------- form fields ---------- */

export const inputClass =
  "w-full rounded-md border border-rule bg-ink px-3 py-2 text-sm text-paper placeholder:text-mist transition-colors hover:border-mist/70 focus:border-signal focus:outline-none disabled:opacity-50";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] text-fog">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-snug text-mist">{hint}</p>}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "appearance-auto pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-24 leading-relaxed", className)} {...props} />;
}

/* ---------- choice ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: readonly { value: NoInfer<T>; label: ReactNode }[];
  value: T;
  onChange: (value: NoInfer<T>) => void;
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-md border border-rule bg-deck p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] transition-colors",
            size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-[13px]",
            value === o.value ? "bg-deck-2 text-paper" : "text-fog hover:text-paper",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- feedback ---------- */

const CALLOUT = {
  info: { icon: Info, ring: "border-rule bg-deck", iconClass: "text-signal" },
  good: { icon: CheckCircle2, ring: "border-gain/35 bg-gain/[0.07]", iconClass: "text-gain-ink" },
  warning: { icon: AlertTriangle, ring: "border-fees/40 bg-fees/[0.08]", iconClass: "text-fees-ink" },
  critical: { icon: OctagonAlert, ring: "border-loss/45 bg-loss/[0.08]", iconClass: "text-loss-ink" },
} as const;

/** A notice with an icon; status is never carried by colour alone. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const c = CALLOUT[tone];
  const Icon = c.icon;
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={cn("flex gap-3 rounded-[10px] border px-4 py-3", c.ring, className)}>
      <Icon size={18} className={cn("mt-0.5 shrink-0", c.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-paper">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-fog" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* ---------- figures ---------- */

/** A labelled figure. Label above in quiet text, value in the display face. */
export function Stat({
  label,
  value,
  note,
  tone,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-fog">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate font-display font-semibold tracking-[-0.02em]",
          size === "lg" ? "text-[30px] leading-tight" : "text-xl",
          tone ?? "text-paper",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-mist">{note}</p>}
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gain" | "loss" | "fees" | "signal" }) {
  const tones = {
    neutral: "bg-deck-2 text-fog",
    gain: "bg-gain/15 text-gain-ink",
    loss: "bg-loss/15 text-loss-ink",
    fees: "bg-fees/15 text-fees-ink",
    signal: "bg-signal/15 text-signal",
  };
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs", tones[tone])}>{children}</span>;
}

/* ---------- tables ---------- */

export const tableClass = "w-full border-collapse text-sm";
export const thClass = "py-2 pr-4 text-left text-xs font-normal text-mist";
export const tdClass = "border-t border-rule py-2.5 pr-4 text-paper";
