import axios from "axios";
import crypto from "crypto";

const FUTURES_BASE_API =
  process.env.BINANCE_FUTURES_API || "https://fapi.binance.com";

function sign(queryString: string) {
  return crypto
    .createHmac("sha256", process.env.BINANCE_SECRET_KEY as string)
    .update(queryString)
    .digest("hex");
}

// Returns currently active futures positions from Binance (/fapi/v2/positionRisk),
// filtering out symbols with a zero position amount.
export function getPositions(symbol?: string) {
  const params: Record<string, string | number> = { timestamp: Date.now() };
  if (symbol) params.symbol = symbol;

  const queryString = new URLSearchParams(
    params as Record<string, string>,
  ).toString();
  const signature = sign(queryString);

  return axios
    .get(`${FUTURES_BASE_API}/fapi/v2/positionRisk`, {
      params: { ...params, signature },
      headers: {
        "X-MBX-APIKEY": process.env.BINANCE_API_KEY,
      },
    })
    .then((response) => {
      const activePositions = response.data.filter(
        (position: { positionAmt: string }) =>
          parseFloat(position.positionAmt) !== 0,
      );
      console.log(activePositions);
      return activePositions;
    })
    .catch((error) => {
      console.error(error.response?.data ?? error.message);
    });
}
