import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { feedLive } from "@/lib/mt5/feed";
import { isLogin } from "@/lib/mt5/accountFiles";
import { mayUseLiveSync, mt5Accounts, setLink, syncMt5 } from "@/lib/mt5/sync";
import { accountById } from "@/lib/playbook/config";

// Live MT5 sync (src/lib/mt5/sync.ts).
// GET   → the accounts the PB_BarFeed expert has exported and what each is linked to.
// PATCH { login, accountId | null } → link a login to a prop account (or unlink), then sync.
// POST  → sync now.

const forbidden = () => NextResponse.json({ message: "Live MT5 sync isn't enabled for this account." }, { status: 403 });

async function view(userId: string) {
  return { feedLive: await feedLive(), accounts: await mt5Accounts(userId) };
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  if (!mayUseLiveSync(user.email)) return forbidden();
  try {
    return NextResponse.json(await view(user.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  if (!mayUseLiveSync(user.email)) return forbidden();
  try {
    const body = (await request.json()) as { login?: unknown; accountId?: unknown };
    const login = String(body.login ?? "");
    if (!isLogin(login)) throw appError("INVALID_INPUT", "Unknown MT5 login.");
    const accountId = body.accountId === null || body.accountId === "" ? null : String(body.accountId);
    if (accountId !== null && !accountById(accountId)) throw appError("INVALID_INPUT", "Unknown prop account.");
    await setLink(user.id, login, accountId);
    const sync = await syncMt5(user.id);
    return NextResponse.json({ ...(await view(user.id)), sync });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  if (!mayUseLiveSync(user.email)) return forbidden();
  try {
    const sync = await syncMt5(user.id);
    return NextResponse.json({ ...(await view(user.id)), sync });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
