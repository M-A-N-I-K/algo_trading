"use client";

import { useQuery } from "@tanstack/react-query";
import { StrategyDefinition, StrategyDirection, StrategyType } from "@/domain/strategies";
import { SUPPORTED_TIMEFRAMES } from "@/domain/market-data/types";
import type { Instrument } from "@/domain/market-data/types";
import { fetchJson } from "@/lib/apiClient";

interface StrategyMetadataFormProps {
  value: StrategyDefinition;
  onChange: (value: StrategyDefinition) => void;
}

const STRATEGY_TYPE_LABELS: Record<StrategyType, string> = {
  TREND_FOLLOWING: "Trend Following",
  MOMENTUM: "Momentum",
  MEAN_REVERSION: "Mean Reversion",
  BREAKOUT: "Breakout",
  REVERSAL: "Reversal",
  CUSTOM: "Custom",
};

const DIRECTION_LABELS: Record<StrategyDirection, string> = {
  LONG_ONLY: "Long only",
  SHORT_ONLY: "Short only",
  LONG_AND_SHORT: "Long + Short",
};

const inputClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500 w-full";
const selectClass = inputClass;

export default function StrategyMetadataForm({ value, onChange }: StrategyMetadataFormProps) {
  const instrumentsQuery = useQuery({
    queryKey: ["instruments"],
    queryFn: () => fetchJson<{ instruments: Instrument[] }>("/api/instruments"),
  });
  const instruments = instrumentsQuery.data?.instruments ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-xs text-slate-500">Strategy name</label>
        <input
          type="text"
          value={value.metadata.name}
          onChange={(e) => onChange({ ...value, metadata: { ...value.metadata, name: e.target.value } })}
          placeholder="e.g. Opening Range Breakout"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-xs text-slate-500">Description</label>
        <textarea
          value={value.metadata.description}
          onChange={(e) => onChange({ ...value, metadata: { ...value.metadata, description: e.target.value } })}
          rows={2}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-slate-500">Market / Instrument</label>
        <select
          value={value.market.instrumentId ?? ""}
          onChange={(e) => {
            const instrument = instruments.find((i) => i.id === e.target.value);
            onChange({ ...value, market: { instrumentId: instrument?.id, symbol: instrument?.symbol ?? value.market.symbol } });
          }}
          className={selectClass}
        >
          <option value="">Select instrument…</option>
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.symbol} ({i.exchange})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-slate-500">Timeframe</label>
        <select value={value.timeframe} onChange={(e) => onChange({ ...value, timeframe: e.target.value as StrategyDefinition["timeframe"] })} className={selectClass}>
          {SUPPORTED_TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-slate-500">Strategy type</label>
        <select
          value={value.metadata.strategyType}
          onChange={(e) => onChange({ ...value, metadata: { ...value.metadata, strategyType: e.target.value as StrategyType } })}
          className={selectClass}
        >
          {(Object.keys(STRATEGY_TYPE_LABELS) as StrategyType[]).map((t) => (
            <option key={t} value={t}>
              {STRATEGY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-slate-500">Direction</label>
        <select value={value.direction} onChange={(e) => onChange({ ...value, direction: e.target.value as StrategyDirection })} className={selectClass}>
          {(Object.keys(DIRECTION_LABELS) as StrategyDirection[]).map((d) => (
            <option key={d} value={d}>
              {DIRECTION_LABELS[d]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
