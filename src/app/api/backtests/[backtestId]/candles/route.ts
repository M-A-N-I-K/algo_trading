import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { prisma } from "@/db/client";
import { prismaCandleStore } from "@/db/repositories/candleRepository";
import type { BacktestConfiguration } from "@/domain/backtesting/runStrategyBacktest";

// The candles a completed backtest ran on (its range, without warm-up),
// read from the cache the run filled. Never calls Binance.
export async function GET(request: NextRequest, context: { params: Promise<{ backtestId: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { backtestId } = await context.params;
    const row = await prisma.backtest.findFirst({ where: { id: backtestId, userId: user.id }, select: { configuration: true } });
    if (!row) throw appError("NOT_FOUND", "Backtest not found.");
    const config = row.configuration as unknown as BacktestConfiguration;
    const candles = await prismaCandleStore.find(
      config.market.instrumentId,
      config.market.timeframe,
      new Date(config.range.from),
      new Date(config.range.to),
    );
    return NextResponse.json({ candles });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
