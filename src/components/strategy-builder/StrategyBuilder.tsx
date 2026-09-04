"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IndicatorExpression,
  STRATEGY_TEMPLATES,
  StrategyDefinition,
  StrategyImportResult,
  StrategyVersionRecord,
  exportStrategy,
  getIndicatorDefinition,
  listIndicators,
  parseStrategyImport,
  serializeStrategyExport,
} from "@/domain/strategies";
import { fetchJson } from "@/lib/apiClient";
import { useStrategyBuilder } from "./useStrategyBuilder";
import StrategyMetadataForm from "./StrategyMetadataForm";
import EntryRuleEditor from "./EntryRuleEditor";
import ExitRuleEditor from "./ExitRuleEditor";
import PositionSizingEditor from "./PositionSizingEditor";
import RiskConfigEditor from "./RiskConfigEditor";
import TradingSessionEditor from "./TradingSessionEditor";
import StrategyPreview from "./StrategyPreview";
import StrategyValidationPanel from "./StrategyValidationPanel";
import StrategyVersionSelector from "./StrategyVersionSelector";
import StrategyChart from "./StrategyChart";

interface StrategyBuilderProps {
  strategyId?: string;
  initialDefinition: StrategyDefinition;
  initialVersions?: StrategyVersionRecord[];
}

const sectionClass = "flex flex-col gap-3 bg-slate-900/40 border border-slate-800 rounded-2xl p-4";
const sectionTitleClass = "text-sm font-bold text-slate-200 uppercase tracking-wide";
const buttonClass =
  "text-xs font-semibold px-3.5 py-2 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed";
const primaryButtonClass = buttonClass + " bg-violet-600 border-violet-500 text-white hover:bg-violet-500";
const secondaryButtonClass = buttonClass + " bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700";

function isImportSuccess(result: StrategyImportResult): result is Extract<StrategyImportResult, { success: true }> {
  return result.success;
}

export default function StrategyBuilder({ strategyId: initialStrategyId, initialDefinition, initialVersions = [] }: StrategyBuilderProps) {
  const router = useRouter();
  const { definition, setDefinition, isDirty, validation, markSaved, loadDefinition } = useStrategyBuilder(initialDefinition);

  const [strategyId, setStrategyId] = useState(initialStrategyId);
  const [versions, setVersions] = useState(initialVersions);
  const [selectedVersion, setSelectedVersion] = useState(initialVersions[0]?.version ?? 1);
  const [manualIndicators, setManualIndicators] = useState<IndicatorExpression[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persistVersion = useCallback(
    async (def: StrategyDefinition, changeNote?: string): Promise<{ strategyId: string; version: StrategyVersionRecord }> => {
      if (!strategyId) {
        const res = await fetchJson<{ strategy: { id: string }; version: StrategyVersionRecord }>("/api/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ definition: def }),
        });
        return { strategyId: res.strategy.id, version: res.version };
      }
      const res = await fetchJson<{ version: StrategyVersionRecord }>(`/api/strategies/${strategyId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: def, changeNote }),
      });
      return { strategyId, version: res.version };
    },
    [strategyId],
  );

  const afterPersist = useCallback(
    (newStrategyId: string, version: StrategyVersionRecord, isNew: boolean) => {
      markSaved(version.definition);
      setVersions((prev) => [version, ...prev]);
      setSelectedVersion(version.version);
      if (isNew) {
        setStrategyId(newStrategyId);
        router.push(`/strategies/${newStrategyId}/edit`);
      }
    },
    [markSaved, router],
  );

  const saveDraft = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const wasNew = !strategyId;
      const { strategyId: id, version } = await persistVersion(definition);
      afterPersist(id, version, wasNew);
      await fetchJson(`/api/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      setStatus("Saved as draft.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [definition, strategyId, persistVersion, afterPersist]);

  const saveAndValidate = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const wasNew = !strategyId;
      const { strategyId: id, version } = await persistVersion(definition);
      afterPersist(id, version, wasNew);
      const res = await fetch(`/api/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "READY" }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus(body.message || "Strategy is not ready yet — see the validation panel below.");
      } else {
        setStatus("Strategy validated and marked READY.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [definition, strategyId, persistVersion, afterPersist]);

  const saveNewVersion = useCallback(async () => {
    if (!strategyId) return;
    setSaving(true);
    setStatus(null);
    try {
      const { version } = await persistVersion(definition);
      afterPersist(strategyId, version, false);
      setStatus(`Saved as version ${version.version}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [definition, strategyId, persistVersion, afterPersist]);

  const applyTemplate = useCallback(
    (build: () => StrategyDefinition) => {
      if (isDirty && !window.confirm("Discard unsaved changes and load this template?")) return;
      loadDefinition(build());
      setShowTemplates(false);
    },
    [isDirty, loadDefinition],
  );

  const handleExport = useCallback(() => {
    const payload = exportStrategy(definition.metadata.name || "strategy", definition);
    const blob = new Blob([serializeStrategyExport(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(definition.metadata.name || "strategy").replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [definition]);

  const handleImport = useCallback(() => {
    const result = parseStrategyImport(importText);
    // `strict: false` in this repo's tsconfig means `if (!result.success)`
    // doesn't reliably narrow this discriminated union — use an explicit
    // type-predicate guard instead (narrows correctly regardless of mode).
    if (!isImportSuccess(result)) {
      setImportError(result.error);
      return;
    }
    if (isDirty && !window.confirm("Discard unsaved changes and import this strategy?")) return;
    loadDefinition(result.definition);
    setShowImport(false);
    setImportText("");
    setImportError(null);
  }, [importText, isDirty, loadDefinition]);

  const handleSelectVersion = useCallback(
    async (version: number) => {
      if (!strategyId) return;
      setSelectedVersion(version);
      const existing = versions.find((v) => v.version === version);
      if (existing) loadDefinition(existing.definition);
    },
    [strategyId, versions, loadDefinition],
  );

  // Keyboard shortcuts: Cmd/Ctrl+S save draft, Cmd/Ctrl+Enter save & validate, Escape closes any open dialog.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        saveDraft();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        saveAndValidate();
      } else if (e.key === "Escape") {
        setShowTemplates(false);
        setShowImport(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveDraft, saveAndValidate]);

  return (
    <div className="flex flex-col gap-6">
      <div className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={sectionTitleClass}>Strategy Metadata</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowTemplates(true)} className={secondaryButtonClass}>
              Templates
            </button>
            <button type="button" onClick={handleExport} className={secondaryButtonClass}>
              Export
            </button>
            <button type="button" onClick={() => setShowImport(true)} className={secondaryButtonClass}>
              Import
            </button>
            <button type="button" onClick={saveDraft} disabled={saving} className={secondaryButtonClass}>
              Save Draft
            </button>
            {strategyId && (
              <button type="button" onClick={saveNewVersion} disabled={saving} className={secondaryButtonClass}>
                Save New Version
              </button>
            )}
            <button type="button" onClick={saveAndValidate} disabled={saving} className={primaryButtonClass}>
              Save &amp; Validate
            </button>
          </div>
        </div>
        <StrategyMetadataForm value={definition} onChange={setDefinition} />
        {status && <p className="text-xs text-slate-400">{status}</p>}
        {isDirty && <p className="text-xs text-amber-400">Unsaved changes.</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
        {/* Left column: chart + indicators */}
        <div className="flex flex-col gap-4">
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Chart</h2>
            <StrategyChart definition={definition} manualIndicators={manualIndicators} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Indicators (visualization only)</h2>
            <IndicatorPicker manualIndicators={manualIndicators} onChange={setManualIndicators} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Preview</h2>
            <StrategyPreview definition={definition} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Validation</h2>
            <StrategyValidationPanel result={validation} />
          </div>
        </div>

        {/* Right column: rules */}
        <div className="flex flex-col gap-4">
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Entry Rules</h2>
            <EntryRuleEditor direction={definition.direction} value={definition.entry} onChange={(entry) => setDefinition({ ...definition, entry })} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Exit Rules</h2>
            <ExitRuleEditor value={definition.exit} onChange={(exit) => setDefinition({ ...definition, exit })} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Position Sizing</h2>
            <PositionSizingEditor value={definition.positionSizing} onChange={(positionSizing) => setDefinition({ ...definition, positionSizing })} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Risk Configuration</h2>
            <RiskConfigEditor value={definition.risk} onChange={(risk) => setDefinition({ ...definition, risk })} />
          </div>
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>Trading Session</h2>
            <TradingSessionEditor value={definition.session} onChange={(session) => setDefinition({ ...definition, session })} />
          </div>
          {strategyId && versions.length > 0 && (
            <div className={sectionClass}>
              <h2 className={sectionTitleClass}>Versions</h2>
              <StrategyVersionSelector versions={versions} selectedVersion={selectedVersion} onSelect={handleSelectVersion} />
            </div>
          )}
        </div>
      </div>

      {showTemplates && (
        <Modal onClose={() => setShowTemplates(false)} title="Choose a template">
          <div className="flex flex-col gap-2">
            {STRATEGY_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.build)}
                className="text-left px-3 py-2.5 rounded-lg border border-slate-800 bg-slate-900 hover:border-violet-500/50 transition-all"
              >
                <div className="text-sm font-semibold text-slate-200">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal onClose={() => setShowImport(false)} title="Import strategy JSON">
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImportText(await file.text());
              }}
              className="text-xs text-slate-400"
            />
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              placeholder="Paste exported strategy JSON here…"
              className="bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-xs font-mono"
            />
            {importError && <p className="text-xs text-rose-400">{importError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowImport(false)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="button" onClick={handleImport} className={primaryButtonClass}>
                Import
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IndicatorPicker({
  manualIndicators,
  onChange,
}: {
  manualIndicators: IndicatorExpression[];
  onChange: (indicators: IndicatorExpression[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {listIndicators()
          .filter((d) => d.chartPane === "overlay")
          .map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                onChange([...manualIndicators, { type: "indicator", indicator: d.id, parameters: Object.fromEntries(d.parameters.map((p) => [p.name, p.default])) }])
              }
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:border-violet-500/50 transition-all"
            >
              + {d.label}
            </button>
          ))}
      </div>
      {manualIndicators.length > 0 && (
        <ul className="flex flex-col gap-1">
          {manualIndicators.map((ind, i) => (
            <li key={i} className="flex items-center justify-between text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
              <span>
                {getIndicatorDefinition(ind.indicator).label}({Object.values(ind.parameters).join(", ")})
              </span>
              <button type="button" onClick={() => onChange(manualIndicators.filter((_, idx) => idx !== i))} className="text-slate-600 hover:text-rose-400">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-950 border border-slate-800 rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-200">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
