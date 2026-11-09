"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Download } from "lucide-react";
import { Button, Panel, Tag } from "@/components/kit";
import type { IndicatorInfo } from "@/lib/indicators/catalog";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (e.g. plain http on a LAN address): fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export default function IndicatorCard({ info, code }: { info: IndicatorInfo; code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const lines = code.split("\n").length;

  const onCopy = async () => {
    setState((await copyText(code)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2500);
  };

  const onDownload = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = info.file;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title={info.title}
      note={<>Best on {info.bestOn}. Same rules and defaults as the backtest.</>}
      aside={
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={onCopy} aria-live="polite">
            {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {state === "copied" ? "Copied" : state === "failed" ? "Copy failed: use Download" : "Copy script"}
          </Button>
          <Button size="sm" onClick={onDownload}>
            <Download size={14} aria-hidden="true" />
            Download .pine
          </Button>
        </div>
      }
    >
      <ol className="flex flex-col gap-2">
        {info.steps.map((s) => (
          <li key={s.label} className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-3">
            <span className="shrink-0 sm:w-28">
              <Tag tone="signal">{s.label}</Tag>
            </span>
            <span className="leading-relaxed text-fog">{s.text}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[13px] text-mist">
        Not sure what a step means? Read the{" "}
        <Link href={info.guide} className="underline underline-offset-4 hover:text-paper">
          beginner guide
        </Link>
        .
      </p>

      <details className="group mt-4 min-w-0">
        <summary className="cursor-pointer text-[13px] text-fog hover:text-paper">Show the code ({lines} lines)</summary>
        <div className="relative mt-2 max-h-[420px] min-w-0 overflow-auto rounded-md border border-rule bg-ink">
          <pre className="p-3 text-[12px] leading-relaxed text-paper">
            <code>{code}</code>
          </pre>
        </div>
      </details>
    </Panel>
  );
}
