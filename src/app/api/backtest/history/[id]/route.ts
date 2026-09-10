import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { deleteBacktestRun, getBacktestRun } from "@/db/repositories/backtestRunRepository";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const run = await getBacktestRun(id, user.id);
    if (!run) {
      return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
    }
    return NextResponse.json({ run });
  } catch (e) {
    console.error("Failed to load backtest run:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to load backtest run: " + message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const deleted = await deleteBacktestRun(id, user.id);
    if (!deleted) {
      return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to delete backtest run:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to delete backtest run: " + message }, { status: 500 });
  }
}
