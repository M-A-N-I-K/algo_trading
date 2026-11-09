import { readFile } from "node:fs/promises";
import path from "node:path";
import { Callout } from "@/components/kit";
import IndicatorCard from "@/components/indicators/IndicatorCard";
import { INDICATORS } from "@/lib/indicators/catalog";

// The scripts live in /tradingview at the repo root, so the copy here is
// always the committed file.
async function loadCode(file: string) {
  return readFile(path.join(process.cwd(), "tradingview", file), "utf8");
}

export default async function IndicatorsPage() {
  const items = await Promise.all(INDICATORS.map(async (info) => ({ info, code: await loadCode(info.file) })));

  return (
    <div className="flex flex-col gap-6">
      <Callout title="How to add one to TradingView">
        <ol className="list-decimal pl-5">
          <li>Click <span className="text-paper">Copy script</span> below.</li>
          <li>In TradingView, open <span className="text-paper">Pine Editor</span> at the bottom of the chart, then Open → New indicator.</li>
          <li>Select everything in the editor, paste over it, click <span className="text-paper">Save</span>, then <span className="text-paper">Add to chart</span>.</li>
          <li>Use the <span className="text-paper">1h</span> timeframe. The panel at the top right says what to wait for next.</li>
        </ol>
      </Callout>

      {items.map(({ info, code }) => (
        <IndicatorCard key={info.id} info={info} code={code} />
      ))}

      <p className="text-xs text-mist">
        Alerts: create an alert on the indicator and pick &quot;Any alert() function call&quot; for entry messages with stop and target, or one of the
        named conditions. Levels on your broker&apos;s feed can differ slightly from the backtest&apos;s Binance data.
      </p>
    </div>
  );
}
