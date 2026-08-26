import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const trades = await prisma.trade.findMany({
      where: { userId: user.id },
      orderBy: { time: "desc" }
    });
    return NextResponse.json(trades);
  } catch (e: any) {
    console.error("GET Trades error:", e);
    return NextResponse.json({ error: "Failed to load trades: " + e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const data = await request.json();
    if (!data.time || !data.symbol) {
      return NextResponse.json({ error: "Missing time or symbol" }, { status: 400 });
    }

    if (data.id) {
      // Update existing trade
      // Verify ownership
      const existing = await prisma.trade.findFirst({
        where: { id: data.id, userId: user.id }
      });
      if (!existing) {
        return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 });
      }

      const updated = await prisma.trade.update({
        where: { id: data.id },
        data: {
          time: new Date(data.time),
          balanceBefore: data.balanceBefore !== undefined ? data.balanceBefore : null,
          balanceAfter: data.balanceAfter !== undefined ? data.balanceAfter : null,
          pnl: parseFloat(data.pnl),
          symbol: data.symbol,
          side: data.side,
          quantity: parseFloat(data.quantity),
          entryPrice: parseFloat(data.entryPrice),
          exitPrice: parseFloat(data.exitPrice),
          strategy: data.strategy,
          notes: data.notes || "",
          stopLoss: data.stopLoss !== undefined && data.stopLoss !== null ? parseFloat(data.stopLoss) : null,
          initialRiskAmount: data.initialRiskAmount !== undefined && data.initialRiskAmount !== null ? parseFloat(data.initialRiskAmount) : null
        }
      });
      return NextResponse.json(updated);
    }

    // Create new trade
    const created = await prisma.trade.create({
      data: {
        time: new Date(data.time),
        balanceBefore: data.balanceBefore !== undefined ? data.balanceBefore : null,
        balanceAfter: data.balanceAfter !== undefined ? data.balanceAfter : null,
        pnl: parseFloat(data.pnl),
        symbol: data.symbol,
        side: data.side,
        quantity: parseFloat(data.quantity),
        entryPrice: parseFloat(data.entryPrice),
        exitPrice: parseFloat(data.exitPrice),
        strategy: data.strategy || "macd-200ema-sr",
        notes: data.notes || "",
        stopLoss: data.stopLoss !== undefined && data.stopLoss !== null ? parseFloat(data.stopLoss) : null,
        initialRiskAmount: data.initialRiskAmount !== undefined && data.initialRiskAmount !== null ? parseFloat(data.initialRiskAmount) : null,
        userId: user.id
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    console.error("POST Trades error:", e);
    return NextResponse.json({ error: "Failed to save trade: " + e.message }, { status: 500 });
  }
}
