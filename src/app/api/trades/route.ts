import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { linkedRisk, parsePlaybookAccountId } from "@/lib/playbook/journalLink";

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

    // A prop-account trade: quantity is the platform's lots, so risk comes
    // from the contract size, not entry−stop × quantity.
    let playbookAccountId: string | null;
    try {
      playbookAccountId = parsePlaybookAccountId(data.playbookAccountId);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const stop = data.stopLoss !== undefined && data.stopLoss !== null ? parseFloat(data.stopLoss) : null;
    const risk = playbookAccountId
      ? linkedRisk(data.symbol, parseFloat(data.entryPrice), stop, parseFloat(data.quantity))
      : data.initialRiskAmount !== undefined && data.initialRiskAmount !== null ? parseFloat(data.initialRiskAmount) : null;

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
          stopLoss: stop,
          initialRiskAmount: risk,
          playbookAccountId
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
        strategy: data.strategy || user.defaultStrategy,
        notes: data.notes || "",
        stopLoss: stop,
        initialRiskAmount: risk,
        playbookAccountId,
        userId: user.id
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    console.error("POST Trades error:", e);
    return NextResponse.json({ error: "Failed to save trade: " + e.message }, { status: 500 });
  }
}
