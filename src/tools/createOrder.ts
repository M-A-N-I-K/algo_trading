import axios from "axios";
import { FUTURES_BASE_API, signParams } from "./binanceSignedRequest";

export type OrderSide = "BUY" | "SELL";

export type OrderType =
  | "LIMIT"
  | "MARKET"
  | "STOP"
  | "STOP_MARKET"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_MARKET"
  | "TRAILING_STOP_MARKET";

export interface CreateOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: number;
  price?: number;
  timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
  stopPrice?: number;
  reduceOnly?: boolean;
  closePosition?: boolean;
  newClientOrderId?: string;
}

// Places a new futures order (POST /fapi/v1/order).
export function createOrder(order: CreateOrderParams) {
  const params: Record<string, string | number> = {
    symbol: order.symbol,
    side: order.side,
    type: order.type,
  };
  if (order.quantity !== undefined) params.quantity = order.quantity;
  if (order.price !== undefined) params.price = order.price;
  if (order.timeInForce) params.timeInForce = order.timeInForce;
  if (order.stopPrice !== undefined) params.stopPrice = order.stopPrice;
  if (order.reduceOnly !== undefined)
    params.reduceOnly = order.reduceOnly.toString();
  if (order.closePosition !== undefined)
    params.closePosition = order.closePosition.toString();
  if (order.newClientOrderId) params.newClientOrderId = order.newClientOrderId;

  const { params: signedParams, headers } = signParams(params);

  return axios
    .post(`${FUTURES_BASE_API}/fapi/v1/order`, null, {
      params: signedParams,
      headers,
    })
    .then((response) => response.data)
    .catch((error) => {
      console.error(error.response?.data ?? error.message);
    });
}
