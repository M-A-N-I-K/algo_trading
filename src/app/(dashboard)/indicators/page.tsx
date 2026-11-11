import { readFile } from "node:fs/promises";
import path from "node:path";
import { Callout } from "@/components/kit";
import IndicatorCard from "@/components/indicators/IndicatorCard";
import { INDICATORS } from "@/lib/indicators/catalog";

// The scripts live in /tradingview and /mt5 at the repo root, so the copy
// here is always the committed file.
async function loadCode(dir: "tradingview" | "mt5", file: string) {
  return readFile(path.join(process.cwd(), dir, file), "utf8");
}

export default async function IndicatorsPage() {
  const items = await Promise.all(
    INDICATORS.map(async (info) => ({
      info,
      code: await loadCode("tradingview", info.file),
      mt5Code: info.mt5File ? await loadCode("mt5", info.mt5File) : undefined,
    })),
  );
  const active = items.filter((x) => x.info.status === "playbook");
  const retired = items.filter((x) => x.info.status === "retired");

  return (
    <div className="flex flex-col gap-6">
      <Callout title="How to add one to TradingView">
        <ol className="list-decimal pl-5">
          <li>Click <span className="text-paper">Copy script</span> below.</li>
          <li>In TradingView, open <span className="text-paper">Pine Editor</span> at the bottom of the chart, then Open → New indicator.</li>
          <li>Select everything in the editor, paste over it, click <span className="text-paper">Save</span>, then <span className="text-paper">Add to chart</span>.</li>
          <li>Use a <span className="text-paper">1h</span> chart. The 4h ones build the app&apos;s UTC 4h candles from it. The panel at the top right says what to wait for next.</li>
        </ol>
        <p className="mt-2">
          For MT5: click <span className="text-paper">Copy MT5</span> or <span className="text-paper">Download .mq5</span>, save it in MT5&apos;s
          File → Open Data Folder → MQL5/Indicators, compile it in MetaEditor (F7), then drag it onto the chart.
        </p>
      </Callout>

      {active.map(({ info, code, mt5Code }) => (
        <IndicatorCard key={info.id} info={info} code={code} mt5Code={mt5Code} />
      ))}

      {retired.length > 0 && (
        <>
          <h2 className="mt-4 font-display text-[15px] font-semibold text-fog">Retired setups</h2>
          <p className="-mt-4 text-[13px] text-mist">These setups lost money on 6.5 years of MT5 data and were removed from the Playbook. Kept for reference only.</p>
          {retired.map(({ info, code }) => (
            <IndicatorCard key={info.id} info={info} code={code} />
          ))}
        </>
      )}

      <p className="text-xs text-mist">
        Alerts: create an alert on the indicator and pick &quot;Any alert() function call&quot; for entry messages with stop and target, or one of the
        named conditions. The MT5 versions read FundingPips&apos; own bars, the same data as the backtest. TradingView&apos;s feeds can differ slightly.
      </p>
    </div>
  );
}
