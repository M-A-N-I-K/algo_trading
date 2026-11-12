// Turns the MT5 Strategy Tester reports listed in src/lib/testerReports/catalog.ts
// into the JSON the Tester reports page reads.
//   npx tsx src/backtest/importTesterReports.ts [folder with the .xlsx files]
// The folder defaults to MT5's Documents folder in its Wine prefix on macOS.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseTesterReport, type TesterMeta } from "../lib/mt5/testerReport";
import { TESTER_REPORTS } from "../lib/testerReports/catalog";

const dir = process.argv[2] ?? path.join(homedir(), "Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users/user/Documents");
const out = path.join(import.meta.dirname, "../data/tester-reports");

for (const info of TESTER_REPORTS) {
  if (info.parts) continue;
  const file = path.join(dir, info.file);
  if (!existsSync(file)) {
    console.log(`skip ${info.slug}: ${info.file} not found`);
    continue;
  }
  const { meta, trades } = parseTesterReport(readFileSync(file));
  const data = {
    slug: info.slug,
    meta,
    trades: trades.map((t) => ({ open: t.open, close: t.close, side: t.side, r: t.r, exit: t.exitReason })),
  };
  writeFileSync(path.join(out, `${info.slug}.json`), JSON.stringify(data) + "\n");
  console.log(`${info.slug}: ${trades.length} trades, ${meta.symbol} ${meta.period}`);
}

// Baskets: their parts' trades merged by close time.
for (const info of TESTER_REPORTS) {
  if (!info.parts) continue;
  const parts = info.parts.map((slug) => path.join(out, `${slug}.json`));
  if (!parts.every(existsSync)) {
    console.log(`skip ${info.slug}: a part hasn't been imported`);
    continue;
  }
  type Part = { meta: TesterMeta; trades: { open: string; close: string }[] };
  const data = parts.map((f) => JSON.parse(readFileSync(f, "utf8")) as Part);
  const trades = data.flatMap((d) => d.trades).sort((a, b) => a.close.localeCompare(b.close) || a.open.localeCompare(b.open));
  const first = data[0].meta;
  const meta: TesterMeta = {
    ...first,
    symbol: data.map((d) => d.meta.symbol).join(" + "),
    historyQuality: data.map((d) => d.meta.historyQuality).join(" / "),
    inputs: {},
  };
  writeFileSync(path.join(out, `${info.slug}.json`), JSON.stringify({ slug: info.slug, meta, trades }) + "\n");
  console.log(`${info.slug}: ${trades.length} trades from ${info.parts.length} reports`);
}
