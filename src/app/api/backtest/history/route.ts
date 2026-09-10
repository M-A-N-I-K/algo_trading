import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { listBacktestRunsForUser } from "@/db/repositories/backtestRunRepository";

// Lightweight list for the History panel — excludes the `results` JSON
// blob, which is only fetched for the single run the user clicks on (see
// [id]/route.ts).
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const runs = await listBacktestRunsForUser(user.id);
    return NextResponse.json({ runs });
  } catch (e) {
    console.error("Failed to list backtest history:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to load backtest history: " + message }, { status: 500 });
  }
}
