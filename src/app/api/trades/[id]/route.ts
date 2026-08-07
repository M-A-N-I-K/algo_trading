import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  context: { params: any }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const params = await context.params;
    const id = params.id;
    const { notes, strategy } = await request.json();

    // Verify ownership
    const trade = await prisma.trade.findFirst({
      where: { id, userId: user.id }
    });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 });
    }

    const updated = await prisma.trade.update({
      where: { id },
      data: {
        notes: notes !== undefined ? notes : trade.notes,
        strategy: strategy !== undefined ? strategy : trade.strategy
      }
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("API Trade PUT Error:", e);
    return NextResponse.json({ error: "Failed to update trade: " + e.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: any }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const params = await context.params;
    const id = params.id;

    // Verify ownership
    const trade = await prisma.trade.findFirst({
      where: { id, userId: user.id }
    });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 });
    }

    await prisma.trade.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("API Trade DELETE Error:", e);
    return NextResponse.json({ error: "Failed to delete trade: " + e.message }, { status: 500 });
  }
}
