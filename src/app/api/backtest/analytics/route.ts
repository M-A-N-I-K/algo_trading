import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { listBacktestRunsWithMetricsForUser } from "@/db/repositories/backtestRunRepository";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const runs = await listBacktestRunsWithMetricsForUser(user.id);
    return NextResponse.json({ runs });
  } catch (e) {
    console.error("Failed to load backtest analytics:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to load backtest analytics: " + message }, { status: 500 });
  }
}
