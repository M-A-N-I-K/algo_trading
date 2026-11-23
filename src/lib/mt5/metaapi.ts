import { randomBytes } from "node:crypto";
import { appError } from "@/lib/errors";
import type { Mt5AccountInfo, Mt5Deal, Mt5OpenPosition } from "./accountFiles";

// MT5 accounts connected through MetaApi (metaapi.cloud): it runs an MT5
// terminal in its cloud, logged in with the account's investor (read-only)
// password, so trades sync without the MT5 app running here. The mappers turn
// its deals, positions and account info into the shapes the PB_BarFeed export
// gives (accountFiles.ts), so sync.ts treats both sources the same.
//
// Needs METAAPI_TOKEN, an API token from app.metaapi.cloud/token. Times from
// MetaApi are already UTC.

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const clientApi = (region: string) => `https://mt-client-api-v1.${/^[a-z0-9-]+$/.test(region) ? region : "new-york"}.agiliumtrade.ai`;

export const metaApiConfigured = () => !!process.env.METAAPI_TOKEN?.trim();

// ---- mappers (pure) ------------------------------------------------------

export interface ApiDeal {
  id: string;
  type: string;
  entryType?: string;
  symbol?: string;
  time: string;
  volume?: number;
  price?: number;
  commission?: number;
  swap?: number;
  profit: number;
  positionId?: string;
  reason?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ApiPosition {
  id: string;
  type: string;
  symbol: string;
  time: string;
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  volume: number;
  swap?: number;
  unrealizedProfit?: number;
  profit?: number;
}

export interface ApiAccountInfo {
  login: number | string;
  server: string;
  broker?: string;
  name?: string;
  currency?: string;
  balance?: number;
  equity?: number;
  type?: string;
}

const price = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n !== 0 ? n : null);
const amount = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

function dealType(t: string): Mt5Deal["type"] {
  if (t === "DEAL_TYPE_BUY") return "buy";
  if (t === "DEAL_TYPE_SELL") return "sell";
  if (t === "DEAL_TYPE_BALANCE") return "balance";
  if (t === "DEAL_TYPE_CREDIT") return "credit";
  if (t.startsWith("DEAL_TYPE_COMMISSION")) return "commission";
  return "other";
}

const ENTRY: Record<string, Mt5Deal["entry"]> = { DEAL_ENTRY_IN: "in", DEAL_ENTRY_OUT: "out", DEAL_ENTRY_INOUT: "inout", DEAL_ENTRY_OUT_BY: "out_by" };

export function dealFromApi(d: ApiDeal): Mt5Deal | null {
  const time = new Date(d.time);
  if (!d.id || Number.isNaN(time.getTime())) return null;
  return {
    ticket: String(d.id),
    positionId: d.positionId ? String(d.positionId) : "",
    time,
    type: dealType(d.type ?? ""),
    entry: ENTRY[d.entryType ?? ""] ?? "",
    symbol: d.symbol ?? "",
    volume: amount(d.volume),
    price: price(d.price),
    stopLoss: price(d.stopLoss),
    takeProfit: price(d.takeProfit),
    commission: amount(d.commission),
    swap: amount(d.swap),
    fee: 0,
    profit: amount(d.profit),
    reason: (d.reason ?? "").replace(/^DEAL_REASON_/, "").toLowerCase(), // sl, tp, so, client…
  };
}

export function positionFromApi(p: ApiPosition): Mt5OpenPosition | null {
  const openTime = new Date(p.time);
  if (!p.id || Number.isNaN(openTime.getTime()) || !Number.isFinite(p.openPrice)) return null;
  return {
    positionId: String(p.id),
    symbol: p.symbol,
    side: p.type === "POSITION_TYPE_SELL" ? "SHORT" : "LONG",
    openTime,
    volume: amount(p.volume),
    openPrice: p.openPrice,
    stopLoss: price(p.stopLoss),
    takeProfit: price(p.takeProfit),
    swap: amount(p.swap),
    // What's still open: realised parts are in the closing deals already.
    profit: amount(p.unrealizedProfit ?? p.profit),
    currentPrice: price(p.currentPrice),
  };
}

const MODES: Record<string, string> = { ACCOUNT_TRADE_MODE_DEMO: "demo", ACCOUNT_TRADE_MODE_REAL: "real", ACCOUNT_TRADE_MODE_CONTEST: "contest" };

export function infoFromApi(a: ApiAccountInfo, at: number): Mt5AccountInfo {
  return {
    login: String(a.login),
    server: a.server ?? "",
    company: a.broker ?? "",
    name: a.name ?? "",
    currency: a.currency ?? "",
    mode: MODES[a.type ?? ""] ?? "",
    balance: typeof a.balance === "number" ? a.balance : null,
    equity: typeof a.equity === "number" ? a.equity : null,
    writtenAt: at,
  };
}

// ---- REST client -----------------------------------------------------------

async function call<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const token = process.env.METAAPI_TOKEN?.trim();
  if (!token) throw appError("INVALID_INPUT", "Cloud sync isn't set up: add METAAPI_TOKEN to .env and restart the app.");
  const res = await fetch(url, {
    ...init,
    headers: { "auth-token": token, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text.slice(0, 200) };
  }
  if (res.status >= 400) {
    const message = (body as { message?: string } | null)?.message ?? `MetaApi answered ${res.status}`;
    if (res.status === 401 || res.status === 403) throw appError("INVALID_INPUT", `MetaApi refused the token: ${message}`);
    if (res.status === 404) throw appError("NOT_FOUND", `MetaApi: ${message}`);
    if (res.status === 400) throw appError("INVALID_INPUT", `MetaApi: ${message}`);
    throw appError("INTERNAL_ERROR", `MetaApi: ${message}`);
  }
  return { status: res.status, body: body as T, headers: res.headers };
}

export interface CloudAccountState {
  state: string; // DEPLOYED, DEPLOYING, UNDEPLOYED…
  connectionStatus: string; // CONNECTED, DISCONNECTED, DISCONNECTED_FROM_BROKER
  region: string;
}

export async function readCloudAccount(id: string): Promise<CloudAccountState> {
  const { body } = await call<{ state?: string; connectionStatus?: string; region?: string }>(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}`);
  return { state: body.state ?? "", connectionStatus: body.connectionStatus ?? "", region: body.region ?? "" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Adds the account to MetaApi and deploys it. MetaApi checks the login with
 * the broker first, answering 202 until it's done; we wait up to ~2 minutes.
 * The password is sent to MetaApi only, never kept.
 */
export async function createCloudAccount(a: { login: string; server: string; password: string }): Promise<{ id: string; region: string }> {
  const transaction = randomBytes(16).toString("hex");
  const payload = JSON.stringify({ name: `MT5 ${a.login}`, login: a.login, password: a.password, server: a.server, platform: "mt5", magic: 0, manualTrades: true });
  const deadline = Date.now() + 120_000;
  let id = "";
  let state = "";
  for (;;) {
    const res = await call<{ id?: string; state?: string; message?: string }>(`${PROVISIONING}/users/current/accounts`, { method: "POST", body: payload, headers: { "transaction-id": transaction }, timeoutMs: 60_000 });
    if (res.status !== 202 && res.body.id) {
      id = res.body.id;
      state = res.body.state ?? "";
      break;
    }
    if (Date.now() > deadline) throw appError("INTERNAL_ERROR", "MetaApi is still checking the login with the broker. Try again in a few minutes.");
    const wait = Number(res.headers.get("retry-after"));
    await sleep(Math.min(Math.max(Number.isFinite(wait) ? wait * 1000 : 5_000, 2_000), 15_000));
  }
  if (state !== "DEPLOYED" && state !== "DEPLOYING") await call(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}/deploy`, { method: "POST" });
  const { region } = await readCloudAccount(id).catch(() => ({ region: "" }));
  return { id, region };
}

/** Removes the account from MetaApi, which stops it (and its billing). */
export async function removeCloudAccount(id: string): Promise<void> {
  try {
    await call(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (e) {
    if (!(e instanceof Error && "code" in e && (e as { code: string }).code === "NOT_FOUND")) throw e;
  }
}

/** Everything the sync needs from a connected account: its info, open positions and whole deal history. */
export async function fetchCloudAccount(id: string, region: string, now = Date.now()) {
  const base = `${clientApi(region)}/users/current/accounts/${encodeURIComponent(id)}`;
  const [info, positions] = await Promise.all([
    call<ApiAccountInfo>(`${base}/account-information`).then((r) => r.body),
    call<ApiPosition[]>(`${base}/positions`).then((r) => r.body),
  ]);
  const deals: ApiDeal[] = [];
  const from = new Date("2015-01-01T00:00:00Z").toISOString();
  const to = new Date(now + 86_400_000).toISOString();
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const page = (await call<ApiDeal[]>(`${base}/history-deals/time/${from}/${to}?offset=${offset}&limit=1000`)).body ?? [];
    deals.push(...page);
    if (page.length < 1000) break;
  }
  return {
    info: infoFromApi(info, now),
    deals: deals.map(dealFromApi).filter((d): d is Mt5Deal => d !== null),
    open: (positions ?? []).map(positionFromApi).filter((p): p is Mt5OpenPosition => p !== null),
  };
}
