import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { runSignalScan } from "@/lib/signals/scanner";
import { rankSignals } from "@/lib/playbook/rules";
import { loadAccount, loadEntries } from "@/lib/playbook/store";

// GET /api/playbook/signals → new and running signals for the playbook's
// setups, best first, each sized and checked against the open trades.
// Shares the Signals page's scan, so the first call after a restart is slow.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const [scan, entries, account] = await Promise.all([runSignalScan(), loadEntries(user.id), loadAccount(user.id)]);
    const lastCandle = Object.fromEntries(scan.playbook.map((r) => [r.id, r.lastCloseTime]));
    return NextResponse.json({ asOf: scan.asOf, signals: rankSignals(scan.playbook, entries, Date.now(), account), lastCandle, errors: scan.errors });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
