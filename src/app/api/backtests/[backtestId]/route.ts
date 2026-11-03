import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { deleteBacktest, getBacktest } from "@/db/repositories/backtestRepository";

export async function GET(request: NextRequest, context: { params: Promise<{ backtestId: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { backtestId } = await context.params;
    const backtest = await getBacktest(backtestId, user.id);
    if (!backtest) throw appError("NOT_FOUND", "Backtest not found.");
    return NextResponse.json({ backtest });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ backtestId: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { backtestId } = await context.params;
    if (!(await deleteBacktest(backtestId, user.id))) throw appError("NOT_FOUND", "Backtest not found.");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
