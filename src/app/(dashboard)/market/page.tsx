"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import CandlestickChart from "@/components/charts/CandlestickChart";
import { Candle, Instrument, Timeframe } from "@/domain/market-data/types";
import { fetchJson } from "@/lib/apiClient";

// Only the timeframes the demo seed actually populates (src/db/seed.ts) are
// offered here — showing the other supported timeframes would just render
// an empty chart on a fresh dev DB.
const SEEDED_TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "1d", label: "1 Day" },
  { value: "5m", label: "5 Minutes" },
];

const RANGE_PRESETS = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
  { label: "All", days: 3650 },
];

export default function MarketPage() {
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [rangeDays, setRangeDays] = useState(365);

  const instrumentsQuery = useQuery({
    queryKey: ["instruments"],
    queryFn: () => fetchJson<{ instruments: Instrument[] }>("/api/instruments"),
  });

  const instruments = instrumentsQuery.data?.instruments ?? [];
  const activeInstrumentId = instrumentId ?? instruments[0]?.id ?? null;
  const activeInstrument = instruments.find((i) => i.id === activeInstrumentId) ?? null;

  const from = useMemo(() => new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString(), [rangeDays]);

  const candlesQuery = useQuery({
    queryKey: ["candles", activeInstrumentId, timeframe, rangeDays],
    queryFn: () =>
      fetchJson<{ instrument: Instrument; candles: Candle[] }>(
        `/api/instruments/${activeInstrumentId}/candles?timeframe=${timeframe}&from=${encodeURIComponent(from)}&limit=3000`,
      ),
    enabled: !!activeInstrumentId,
  });

  const candles = candlesQuery.data?.candles ?? [];
  const isDemoData = candles.length > 0 && candles.every((c) => c.isDemo);

  return (
    <div className="flex flex-col gap-6">
      <Card className="glass border-slate-800">
        <CardContent className="flex flex-col md:flex-row md:items-end gap-4 p-5">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Symbol</label>
            <select
              value={activeInstrumentId ?? ""}
              onChange={(e) => setInstrumentId(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            >
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.symbol} · {i.exchange}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            >
              {SEEDED_TIMEFRAMES.map((tf) => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date Range</label>
            <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs font-semibold">
              {RANGE_PRESETS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setRangeDays(r.days)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    rangeDays === r.days ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {isDemoData && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-500">
          <Info size={14} /> This chart is showing synthetic demo data, not live market prices.
        </div>
      )}

      <Card className="glass border-slate-800 overflow-hidden">
        <CardContent className="p-2">
          {instrumentsQuery.isLoading ? (
            <div className="h-[500px] flex items-center justify-center text-slate-500 text-sm">Loading instruments…</div>
          ) : instrumentsQuery.isError ? (
            <div className="h-[500px] flex flex-col items-center justify-center gap-2 text-rose-400 text-sm">
              <AlertTriangle size={20} />
              {(instrumentsQuery.error as Error).message}
            </div>
          ) : instruments.length === 0 ? (
            <div className="h-[500px] flex items-center justify-center text-slate-500 text-sm text-center px-6">
              No instruments found. Run <code className="mx-1 px-1.5 py-0.5 bg-slate-900 rounded">pnpm run db:seed</code> to load demo instruments and candles.
            </div>
          ) : candlesQuery.isLoading ? (
            <div className="h-[500px] flex items-center justify-center text-slate-500 text-sm">Loading candles…</div>
          ) : candlesQuery.isError ? (
            <div className="h-[500px] flex flex-col items-center justify-center gap-2 text-rose-400 text-sm">
              <AlertTriangle size={20} />
              {(candlesQuery.error as Error).message}
            </div>
          ) : candles.length === 0 ? (
            <div className="h-[500px] flex items-center justify-center text-slate-500 text-sm">
              No candles for {activeInstrument?.symbol} on {timeframe} in this range.
            </div>
          ) : (
            <CandlestickChart candles={candles} height={500} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
