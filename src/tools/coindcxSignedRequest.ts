import crypto from "crypto";
import axios from "axios";

export const COINDCX_BASE_API =
  process.env.COINDCX_BASE_API || "https://api.coindcx.com";

// CoinDCX signs the JSON-encoded body (not a query string, unlike Binance):
// signature = HMAC-SHA256(secret, JSON.stringify(body_with_timestamp)).
// Returns the ready-to-send body string and headers for a signed POST.
export function signBody(params: Record<string, unknown>) {
  const body = JSON.stringify({ ...params, timestamp: Date.now() });
  const signature = crypto
    .createHmac("sha256", process.env.COINDCX_SECRET_KEY as string)
    .update(body)
    .digest("hex");

  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-AUTH-APIKEY": process.env.COINDCX_API_KEY as string,
      "X-AUTH-SIGNATURE": signature,
    },
  };
}

const REQUEST_TIMEOUT_MS = 15_000;

export async function coindcxSignedPost<T>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { body, headers } = signBody(params);
  const res = await fetch(`${COINDCX_BASE_API}${path}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinDCX request to ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// A handful of CoinDCX endpoints (e.g. futures wallet transactions) are GET
// but still require the signed params as a request body — the fetch() spec
// silently drops bodies on GET, so this uses axios instead, which sends it.
export async function coindcxSignedGet<T>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { body, headers } = signBody(params);
  const res = await axios({
    method: "GET",
    url: `${COINDCX_BASE_API}${path}`,
    headers,
    data: body,
    validateStatus: () => true,
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`CoinDCX request to ${path} failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return res.data as T;
}
