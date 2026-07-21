import crypto from "crypto";

export const FUTURES_BASE_API =
  process.env.BINANCE_FUTURES_API || "https://fapi.binance.com";

// Adds a timestamp and HMAC-SHA256 signature to `params` for Binance's
// signed endpoints, and returns the API key header to send alongside them.
export function signParams(params: Record<string, string | number>) {
  const withTimestamp: Record<string, string | number> = {
    ...params,
    timestamp: Date.now(),
  };
  const queryString = new URLSearchParams(
    withTimestamp as Record<string, string>,
  ).toString();
  const signature = crypto
    .createHmac("sha256", process.env.BINANCE_SECRET_KEY as string)
    .update(queryString)
    .digest("hex");

  return {
    params: { ...withTimestamp, signature },
    headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY as string },
  };
}
