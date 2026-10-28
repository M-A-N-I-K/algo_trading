import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { fetchCoindcxFuturesBalance } from "@/lib/coindcxSync";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  if (!process.env.COINDCX_API_KEY || !process.env.COINDCX_SECRET_KEY) {
    return NextResponse.json(
      { error: "CoinDCX API credentials are not configured on the server." },
      { status: 400 },
    );
  }

  try {
    const balance = await fetchCoindcxFuturesBalance();
    const syncedAt = new Date();

    await prisma.user.update({
      where: { id: user.id },
      data: { coindcxBalance: balance, coindcxBalanceSyncedAt: syncedAt },
    });

    return NextResponse.json({ coindcxBalance: balance, coindcxBalanceSyncedAt: syncedAt.toISOString() });
  } catch (e) {
    console.error("CoinDCX balance sync error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to sync CoinDCX balance: " + message }, { status: 500 });
  }
}
