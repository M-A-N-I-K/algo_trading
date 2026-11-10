import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { deleteTrade, updateTrade } from "@/lib/playbook/store";

// PATCH /api/playbook/trades/:id → close a trade (exitPrice, profit,
// commission, swap, exitTime, exitReason; net P&L = profit + commission +
// swap), correct an open one (entryPrice, stopLoss, takeProfit, lots,
// entryTime), and/or set its mistakes and notes.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const { id } = await params;
    return NextResponse.json(await updateTrade(user.id, id, await request.json()));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/playbook/trades/:id → remove a trade logged by mistake.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const { id } = await params;
    await deleteTrade(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
