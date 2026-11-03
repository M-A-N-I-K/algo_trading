import { NextRequest, NextResponse } from "next/server";
import { BacktestRunResult, createBacktestRun } from "@/db/repositories/backtestRunRepository";
import { loadCodedStrategy, runCodedBacktest, toRunResult } from "@/backtest/codedBacktest";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { CODED_STRATEGIES } from "@/strategies/registry";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const { strategy: strategyKey, symbol, interval, limit, initialBalance, minRiskRewardRatio } = await request.json();
    
    if (!strategyKey || !symbol || !interval || !limit) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (!CODED_STRATEGIES[strategyKey]) {
      return NextResponse.json({ error: `Unknown strategy key: ${strategyKey}` }, { status: 400 });
    }

    const symbols = symbol.split(",").map((s: string) => s.trim().toUpperCase());
    const limitNum = Number(limit) || 1000;
    const balanceNum = Number(initialBalance) || 10000;
    const minRrNum = minRiskRewardRatio !== undefined && minRiskRewardRatio !== "" ? Number(minRiskRewardRatio) : undefined;

    const results: BacktestRunResult[] = [];

    for (const sym of symbols) {
      const loaded = await loadCodedStrategy(strategyKey, sym, interval, limitNum);
      if (!loaded) continue;

      const result = runCodedBacktest(loaded.candles, loaded.strategy, {
        initialBalance: balanceNum,
        positionSizePercent: 1,
        minRiskRewardRatio: minRrNum,
      });
      results.push(toRunResult(sym, result));
    }

    // Persist every completed run (with at least one symbol's results) so
    // it can be compared against later from the History panel — never
    // block the response on this, but do surface the saved run's id so the
    // UI can refresh its history list without a second round trip.
    let savedRunId: string | null = null;
    if (results.length > 0) {
      try {
        const saved = await createBacktestRun({
          userId: user.id,
          strategyKey,
          strategyName: results[0].strategyName,
          symbols: symbols.join(","),
          interval,
          candleLimit: limitNum,
          initialBalance: balanceNum,
          minRiskRewardRatio: minRrNum,
          results,
        });
        savedRunId = saved.id;
      } catch (persistErr) {
        console.error("Failed to persist backtest run:", persistErr);
      }
    }

    return NextResponse.json({ results, savedRunId });
  } catch (e: any) {
    console.error("Backtest API execution failed:", e);
    return NextResponse.json({ error: "Backtest simulation failed: " + e.message }, { status: 500 });
  }
}
