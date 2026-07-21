import axios from "axios";
import { FUTURES_BASE_API, signParams } from "./binanceSignedRequest";

// Cancels an active futures order (DELETE /fapi/v1/order). Identify the
// order with either `orderId` or `origClientOrderId` — at least one is required.
export function cancelOrder(
  symbol: string,
  orderId?: number,
  origClientOrderId?: string,
) {
  if (orderId === undefined && !origClientOrderId) {
    return Promise.reject(
      new Error("cancelOrder requires either orderId or origClientOrderId"),
    );
  }

  const params: Record<string, string | number> = { symbol };
  if (orderId !== undefined) params.orderId = orderId;
  if (origClientOrderId) params.origClientOrderId = origClientOrderId;

  const { params: signedParams, headers } = signParams(params);

  return axios
    .delete(`${FUTURES_BASE_API}/fapi/v1/order`, {
      params: signedParams,
      headers,
    })
    .then((response) => response.data)
    .catch((error) => {
      console.error(error.response?.data ?? error.message);
    });
}
