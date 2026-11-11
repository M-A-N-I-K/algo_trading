import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { runSignalScan } from "@/lib/signals/scanner";
import { rankSignals } from "@/lib/playbook/rules";
import { loadFeedSpecs } from "@/lib/mt5/feed";
import { forAccount, loadAccountsState, pickAccount } from "@/lib/playbook/store";

// GET /api/playbook/signals?account=<id> → new and running signals for the
// playbook's setups, best first, each sized for that account and checked
// against its open trades (and the other accounts' daily stops).
// Shares the Signals page's scan, so the first call after a restart is slow.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const accountId = pickAccount(request.nextUrl.searchParams.get("account")).id;
    const now = Date.now();
    // MT5's contract specs size the markets the app has no lot size for (FTSE 100).
    const [scan, state, specs] = await Promise.all([runSignalScan(), loadAccountsState(user.id, now), loadFeedSpecs(now)]);
    const { account, entries, stoppedElsewhere } = forAccount(state, accountId);
    const lastCandle = Object.fromEntries(scan.playbook.map((r) => [r.id, r.lastCloseTime]));
    return NextResponse.json({ asOf: scan.asOf, signals: rankSignals(scan.playbook, entries, now, account, stoppedElsewhere), lastCandle, specs, errors: scan.errors });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
