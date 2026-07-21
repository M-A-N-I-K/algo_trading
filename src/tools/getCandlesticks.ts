import axios from "axios";
import { Candlestick } from "../types";

export function getCandleSticks(
  symbol: string,
  interval: string,
  startTime?: string,
  endTime?: string,
  limit = 10,
) {
  return axios
    .get<Candlestick[]>(`${process.env.BASE_API}/api/v3/klines`, {
      params: {
        symbol,
        interval,
        startTime,
        endTime,
        limit,
      },
    })
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      console.error(error.message);
    });
}
