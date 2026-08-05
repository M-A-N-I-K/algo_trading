// import axios from "axios";
import { getCandleSticks } from "./tools/getCandlesticks";
// import { getPositions } from "./tools/getPositions";
// const app = express();
// const port = 5000;

// function pingBinance() {
//   axios
//     .get(`${process.env.BASE_API}/api/v3/ping`)
//     .then((response) => {
//       console.log(response.data);
//     })
//     .catch((error) => {
//       console.error(error);
//     });
// }

// pingBinance();
getCandleSticks("XRPUSDT", "15m").then((data) => console.log("CURRENT DATA", data));;
// getPositions().then((data) => console.log("CURRENT POSITIONS", data));

// app.get("/", (req, res) => {
//   res.send("Hello World!");
// });

// app.listen(port, () => {
//   return console.log(`Express is listening at http://localhost:${port}`);
// });
