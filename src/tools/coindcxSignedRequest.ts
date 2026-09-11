import crypto from "crypto";

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

export async function coindcxSignedPost<T>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { body, headers } = signBody(params);
  const res = await fetch(`${COINDCX_BASE_API}${path}`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinDCX request to ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
