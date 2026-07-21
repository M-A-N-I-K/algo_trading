import axios from "axios";
import { FUTURES_BASE_API, signParams } from "./binanceSignedRequest";

// Returns currently active futures positions from Binance (/fapi/v2/positionRisk),
// filtering out symbols with a zero position amount.
export function getPositions(symbol?: string) {
  const { params, headers } = signParams(symbol ? { symbol } : {});

  return axios
    .get(`${FUTURES_BASE_API}/fapi/v2/positionRisk`, { params, headers })
    .then((response) => {
      const activePositions = response.data.filter(
        (position: { positionAmt: string }) =>
          parseFloat(position.positionAmt) !== 0,
      );
      return activePositions;
    })
    .catch((error) => {
      console.error(error.response?.data ?? error.message);
    });
}
