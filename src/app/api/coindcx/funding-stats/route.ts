import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const agg = await prisma.coindcxWalletTransaction.aggregate({
      where: { userId: user.id, stage: "funding" },
      _sum: { amount: true },
      _count: true,
    });

    return NextResponse.json({
      netFunding: agg._sum.amount ?? 0,
      eventCount: agg._count,
    });
  } catch (e) {
    console.error("Failed to load funding stats:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to load funding stats: " + message }, { status: 500 });
  }
}
