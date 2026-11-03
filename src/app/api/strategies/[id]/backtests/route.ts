import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { BacktestRequestError, runStrategyBacktest } from "@/domain/backtesting/runStrategyBacktest";
import { listBacktestsForStrategy } from "@/db/repositories/backtestRepository";
import { backtestDeps } from "@/lib/backtesting";

// A first run on a long range fetches its candles from Binance.
export const maxDuration = 300;

const RunBacktestSchema = z.object({
  version: z.number().int().positive(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  execution: z
    .object({
      initialCapital: z.number().positive().optional(),
      feeRate: z.number().min(0).max(0.05).optional(),
      slippagePercent: z.number().min(0).max(0.05).optional(),
      maxLeverage: z.number().positive().max(125).optional(),
      minRiskReward: z.number().positive().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    return NextResponse.json({ backtests: await listBacktestsForStrategy(id, user.id) });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const parsed = RunBacktestSchema.safeParse(await request.json());
    if (!parsed.success) throw appError("INVALID_INPUT", "Invalid backtest settings.", parsed.error.issues);

    const { version, from, to, execution } = parsed.data;
    const outcome = await runStrategyBacktest(
      { userId: user.id, strategyId: id, version, range: { from: new Date(from), to: new Date(to) }, execution },
      backtestDeps,
    );
    return NextResponse.json(outcome, { status: 201 });
  } catch (err) {
    if (err instanceof BacktestRequestError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: err.code, message: err.message, details: err.issues }, { status });
    }
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
