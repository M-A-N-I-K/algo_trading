import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { feedLive } from "@/lib/mt5/feed";
import { metaApiConfigured } from "@/lib/mt5/metaapi";
import { connectCloudAccount, disconnectCloudAccount, mayUseCloudSync, mt5Accounts, syncMt5 } from "@/lib/mt5/sync";
import { accountById } from "@/lib/playbook/config";

// MT5 accounts connected through MetaApi's cloud (src/lib/mt5/metaapi.ts).
// POST   { login, server, password, accountId? } → connect (the investor
//        password goes to MetaApi once and isn't stored), link, then sync.
// DELETE { login } → disconnect: removed from MetaApi and unlinked.

const forbidden = () =>
  NextResponse.json(
    { message: metaApiConfigured() ? "MT5 sync is off for this account. Add your sign-in email to MT5_SYNC_EMAILS in .env and restart the app." : "Cloud sync isn't set up: add METAAPI_TOKEN to .env and restart the app." },
    { status: 403 },
  );

async function view(userId: string) {
  return { feedLive: await feedLive(), cloudReady: metaApiConfigured(), accounts: await mt5Accounts(userId) };
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  if (!mayUseCloudSync(user.email)) return forbidden();
  try {
    const body = (await request.json()) as { login?: unknown; server?: unknown; password?: unknown; accountId?: unknown };
    const accountId = body.accountId ? String(body.accountId) : null;
    if (accountId !== null && !accountById(accountId)) throw appError("INVALID_INPUT", "Unknown prop account.");
    await connectCloudAccount(user.id, { login: String(body.login ?? "").trim(), server: String(body.server ?? ""), password: String(body.password ?? ""), accountId });
    const sync = await syncMt5(user.id, Date.now(), undefined, true);
    return NextResponse.json({ ...(await view(user.id)), sync });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  if (!mayUseCloudSync(user.email)) return forbidden();
  try {
    const body = (await request.json()) as { login?: unknown };
    await disconnectCloudAccount(user.id, String(body.login ?? ""));
    return NextResponse.json(await view(user.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
