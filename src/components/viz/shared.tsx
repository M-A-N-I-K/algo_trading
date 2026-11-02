"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MINUS = "−";

/** +$7.50 / −$62.64, with a true minus sign. */
export function money(value: number, { sign = true, digits = 2 }: { sign?: boolean; digits?: number } = {}): string {
  const abs = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (value < 0 && Math.abs(value) >= 0.5 * 10 ** -digits) return `${MINUS}$${abs}`;
  return `${sign && value > 0 ? "+" : ""}$${abs}`;
}

export function pct(value: number, digits = 1): string {
  return `${value < 0 ? MINUS : ""}${Math.abs(value * 100).toFixed(digits)}%`;
}

export function signedNumber(value: number, digits = 2, suffix = ""): string {
  return `${value > 0 ? "+" : value < 0 ? MINUS : ""}${Math.abs(value).toFixed(digits)}${suffix}`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / (60 * 24));
  const h = Math.round((minutes % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** Text class for a signed money value: gain/loss ink, neutral at zero. */
export function toneClass(value: number): string {
  if (value > 0) return "text-gain-ink";
  if (value < 0) return "text-loss-ink";
  return "text-fog";
}

/** Measures an element's content width; charts render to the real width. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Tooltip positioned inside a `relative` chart container, kept within its width. */
export function Tooltip({ tip, containerWidth }: { tip: TipState | null; containerWidth: number }) {
  if (!tip) return null;
  const flip = tip.x > containerWidth * 0.62;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-rule bg-ink/95 px-3 py-2 text-xs leading-relaxed text-paper shadow-lg shadow-black/40"
      style={{
        left: flip ? undefined : tip.x + 14,
        right: flip ? containerWidth - tip.x + 14 : undefined,
        top: Math.max(0, tip.y - 12),
      }}
    >
      {tip.content}
    </div>
  );
}

export function TipRow({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-fog">
        {swatch && <span className="inline-block h-2 w-2 rounded-full" style={{ background: swatch }} />}
        {label}
      </span>
      <span className="text-paper">{value}</span>
    </div>
  );
}

/** A section of the dashboard: heading, optional note, content. Flat, no shadow. */
export function Panel({
  title,
  note,
  aside,
  children,
  className = "",
}: {
  title: string;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-[10px] border border-rule bg-deck p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-paper">{title}</h2>
          {note && <p className="mt-0.5 max-w-[62ch] text-[13px] leading-snug text-fog">{note}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "dot" | "line" | "block" }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fog">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.shape === "line" ? (
            <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: item.color }} />
          ) : item.shape === "block" ? (
            <span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: item.color }} />
          ) : (
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-fog">{children}</p>;
}
