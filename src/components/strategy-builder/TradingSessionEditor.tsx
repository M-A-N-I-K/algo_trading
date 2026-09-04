"use client";

import { DayOfWeek, TradingSession } from "@/domain/strategies";

interface TradingSessionEditorProps {
  value?: TradingSession;
  onChange: (value: TradingSession | undefined) => void;
}

const ALL_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const DAY_LABELS: Record<DayOfWeek, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri" };

const DEFAULT_SESSION: TradingSession = { days: ALL_DAYS, sessionType: "REGULAR" };

const inputClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500";

export default function TradingSessionEditor({ value, onChange }: TradingSessionEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? DEFAULT_SESSION : undefined)} />
        Restrict trading session
      </label>

      {value && (
        <div className="flex flex-col gap-3 pl-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">From</span>
            <input
              type="time"
              value={value.startTime ?? ""}
              onChange={(e) => onChange({ ...value, startTime: e.target.value || undefined })}
              className={inputClass}
            />
            <span className="text-xs text-slate-500">to</span>
            <input type="time" value={value.endTime ?? ""} onChange={(e) => onChange({ ...value, endTime: e.target.value || undefined })} className={inputClass} />

            <select value={value.sessionType} onChange={(e) => onChange({ ...value, sessionType: e.target.value as "REGULAR" | "CUSTOM" })} className={inputClass}>
              <option value="REGULAR">Regular session</option>
              <option value="CUSTOM">Custom session</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {ALL_DAYS.map((day) => {
              const active = value.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    onChange({ ...value, days: active ? value.days.filter((d) => d !== day) : [...value.days, day] })
                  }
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                    active ? "bg-violet-600 border-violet-500 text-white" : "bg-slate-900 border-slate-800 text-slate-500"
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={!!value.dateRange}
              onChange={(e) => onChange({ ...value, dateRange: e.target.checked ? { from: "", to: "" } : undefined })}
            />
            Limit to date range
          </label>
          {value.dateRange && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={value.dateRange.from}
                onChange={(e) => onChange({ ...value, dateRange: { from: e.target.value, to: value.dateRange?.to ?? "" } })}
                className={inputClass}
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={value.dateRange.to}
                onChange={(e) => onChange({ ...value, dateRange: { from: value.dateRange?.from ?? "", to: e.target.value } })}
                className={inputClass}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
