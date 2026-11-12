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

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type CopyState = "idle" | "copied" | "failed";

function CopyButton({ text, label, primary }: { text: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<CopyState>("idle");
  const onCopy = async () => {
    setState((await copyText(text)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <Button variant={primary ? "primary" : undefined} size="sm" onClick={onCopy} aria-live="polite">
      {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed: use Download" : label}
    </Button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <details className="group mt-3 min-w-0">
      <summary className="cursor-pointer text-[13px] text-fog hover:text-paper">
        Show the {label} code ({code.split("\n").length} lines)
      </summary>
      <div className="relative mt-2 max-h-[420px] min-w-0 overflow-auto rounded-md border border-rule bg-ink">
        <pre className="p-3 text-[12px] leading-relaxed text-paper">
          <code>{code}</code>
        </pre>
      </div>
    </details>
  );
}

export default function IndicatorCard({ info, code, strategyCode, mt5Code }: { info: IndicatorInfo; code?: string; strategyCode?: string; mt5Code?: string }) {
  const retired = info.status === "retired";

  return (
    <Panel
      title={info.title}
      note={
        <>
          <span className="mr-2 align-middle">
            <Tag tone={retired ? "loss" : "gain"}>{retired ? "Retired" : "Playbook"}</Tag>
          </span>
          Best on {info.bestOn}. Same rules and defaults as the backtest.
        </>
      }
      className={retired ? "opacity-75" : ""}
      aside={
        <div className="flex flex-wrap gap-2">
          {strategyCode && info.strategyFile && (
            <>
              <CopyButton text={strategyCode} label="Copy strategy" primary={!retired} />
              <Button size="sm" onClick={() => download(strategyCode, info.strategyFile!)} aria-label={`Download ${info.strategyFile}`}>
                <Download size={14} aria-hidden="true" />
                strategy .pine
              </Button>
            </>
          )}
          {code && info.file && (
            <>
              <CopyButton text={code} label="Copy indicator" primary={!retired && !strategyCode} />
              <Button size="sm" onClick={() => download(code, info.file!)} aria-label={`Download ${info.file}`}>
                <Download size={14} aria-hidden="true" />
                indicator .pine
              </Button>
            </>
          )}
          {mt5Code && info.mt5File && (
            <>
              <CopyButton text={mt5Code} label="Copy MT5" />
              <Button size="sm" onClick={() => download(mt5Code, info.mt5File!)}>
                <Download size={14} aria-hidden="true" />
                .mq5
              </Button>
            </>
          )}
        </div>
      }
    >
      {info.backtest && <p className="mb-4 max-w-[80ch] text-sm leading-relaxed text-paper">{info.backtest}</p>}
      {info.strategySettings && (
        <p className="mb-4 max-w-[80ch] rounded-md border border-rule bg-ink/40 px-3 py-2 text-[13px] leading-relaxed text-fog">
          <span className="text-paper">Strategy Tester settings:</span> {info.strategySettings}
        </p>
      )}
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

      {strategyCode && <CodeBlock label="strategy" code={strategyCode} />}
      {code && <CodeBlock label="indicator" code={code} />}
    </Panel>
  );
}
