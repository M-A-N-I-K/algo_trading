"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { StrategyDefinition, StrategyVersionRecord } from "@/domain/strategies";
import { fetchJson } from "@/lib/apiClient";
import StrategyBuilder from "@/components/strategy-builder/StrategyBuilder";

interface StrategySummaryResponse {
  strategy: { id: string; name: string; status: string };
  version: StrategyVersionRecord | null;
}

export default function EditStrategyPage() {
  const params = useParams<{ strategyId: string }>();
  const strategyId = params.strategyId;

  const strategyQuery = useQuery({
    queryKey: ["strategy", strategyId],
    queryFn: () => fetchJson<StrategySummaryResponse>(`/api/strategies/${strategyId}`),
    enabled: !!strategyId,
  });

  const versionsQuery = useQuery({
    queryKey: ["strategy-versions", strategyId],
    queryFn: () => fetchJson<{ versions: StrategyVersionRecord[] }>(`/api/strategies/${strategyId}/versions`),
    enabled: !!strategyId,
  });

  if (strategyQuery.isLoading || versionsQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading strategy…</p>;
  }
  if (strategyQuery.isError || !strategyQuery.data?.version) {
    return <p className="text-sm text-rose-400">Strategy not found.</p>;
  }

  const initialDefinition: StrategyDefinition = strategyQuery.data.version.definition;
  const versions = versionsQuery.data?.versions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{strategyQuery.data.strategy.name || "Untitled Strategy"}</h1>
          <p className="text-sm text-slate-500">
            Status: <span className="font-semibold text-slate-300">{strategyQuery.data.strategy.status}</span>
          </p>
        </div>
      </div>
      <StrategyBuilder strategyId={strategyId} initialDefinition={initialDefinition} initialVersions={versions} />
    </div>
  );
}
