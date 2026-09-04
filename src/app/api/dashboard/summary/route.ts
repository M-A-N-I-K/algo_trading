import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { prisma } from "@/db/client";

// Real counts only — strategies/backtests aren't wired to a builder/engine
// yet in this phase, so these are legitimately 0 on a fresh install. Per
// the product principle against fabricated results, this route never
// invents "best strategy" / win-rate / profit-factor numbers when no real
// backtest data exists.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const [strategyCount, backtestCount, tradingAccount] = await Promise.all([
      prisma.strategy.count({ where: { userId: user.id } }),
      prisma.backtest.count({ where: { userId: user.id } }),
      prisma.tradingAccount.findFirst({ where: { userId: user.id, isDefault: true } }),
    ]);

    return NextResponse.json({
      strategyCount,
      backtestCount,
      accountBalance: tradingAccount ? tradingAccount.balance.toString() : null,
    });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
