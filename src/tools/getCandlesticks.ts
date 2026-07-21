import axios from "axios";

export function getCandleSticks(
  symbol: string,
  interval: string,
  startTime?: string,
  endTime?: string,
  limit = 10,
) {
  return axios
    .get(`${process.env.BASE_API}/api/v3/klines`, {
      params: {
        symbol,
        interval,
        startTime,
        endTime,
        limit,
      },
    })
    .then((response) => {
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.error(error.message);
    });
}
