import crypto from "crypto";
import https from "https";
import axios from "axios";

export const COINDCX_BASE_API =
  process.env.COINDCX_BASE_API || "https://api.coindcx.com";

export function hasCoindcxCredentials(): boolean {
  return Boolean(process.env.COINDCX_API_KEY && process.env.COINDCX_SECRET_KEY);
}

// CoinDCX signs the JSON-encoded body (not a query string, unlike Binance):
// signature = HMAC-SHA256(secret, JSON.stringify(body_with_timestamp)).
// Returns the ready-to-send body string and headers for a signed request.
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

// The API key is IP-whitelisted, and the whitelist only holds an IPv4
// address. api.coindcx.com also resolves over IPv6, so on a dual-stack
// network Node would randomly connect over IPv6 and get a 401 "Invalid
// credentials". Pin every signed request to IPv4.
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

// Some CoinDCX endpoints (e.g. futures wallets) are GET but still require the
// signed params as a request body — fetch() drops bodies on GET, axios
// sends them, so every signed call goes through axios.
export async function coindcxSignedRequest<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { body, headers } = signBody(params);
  const res = await axios({
    method,
    url: `${COINDCX_BASE_API}${path}`,
    headers,
    data: body,
    httpsAgent: ipv4Agent,
    validateStatus: () => true,
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`CoinDCX request to ${path} failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return res.data as T;
}
