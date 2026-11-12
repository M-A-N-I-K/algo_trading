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
      code: info.file ? await loadCode("tradingview", info.file) : undefined,
      strategyCode: info.strategyFile ? await loadCode("tradingview", info.strategyFile) : undefined,
      mt5Code: info.mt5File ? await loadCode("mt5", info.mt5File) : undefined,
      eaCode: info.mt5EaFile ? await loadCode("mt5", info.mt5EaFile) : undefined,
    })),
  );
  const active = items.filter((x) => x.info.status === "playbook");
  const retired = items.filter((x) => x.info.status === "retired");

  return (
    <div className="flex flex-col gap-6">
      <Callout title="How to add one to TradingView">
        <ol className="list-decimal pl-5">
          <li>
            Click <span className="text-paper">Copy strategy</span> to backtest a setup in TradingView&apos;s Strategy Tester, or{" "}
            <span className="text-paper">Copy indicator</span> for the checkpoint marks and alerts.
          </li>
          <li>In TradingView, open <span className="text-paper">Pine Editor</span> at the bottom of the chart, then Open → New strategy (or New indicator).</li>
          <li>Select everything in the editor, paste over it, click <span className="text-paper">Save</span>, then <span className="text-paper">Add to chart</span>.</li>
          <li>
            Use the chart and settings each card gives. The strategy&apos;s results open in the <span className="text-paper">Strategy Tester</span> tab under
            the chart, and a panel at the bottom right shows them in R, like the app.
          </li>
        </ol>
        <p className="mt-2">
          For MT5: click <span className="text-paper">Copy MT5</span> or <span className="text-paper">Download .mq5</span>, save it in MT5&apos;s
          File → Open Data Folder → MQL5/Indicators, compile it in MetaEditor (F7), then drag it onto the chart. To backtest in MT5&apos;s
          Strategy Tester, use <span className="text-paper">Copy MT5 EA</span> instead and save it in MQL5/Experts.
        </p>
      </Callout>

      {active.map(({ info, code, strategyCode, mt5Code, eaCode }) => (
        <IndicatorCard key={info.id} info={info} code={code} strategyCode={strategyCode} mt5Code={mt5Code} eaCode={eaCode} />
      ))}

      {retired.length > 0 && (
        <>
          <h2 className="mt-4 font-display text-[15px] font-semibold text-fog">Retired setups</h2>
          <p className="-mt-4 text-[13px] text-mist">These setups lost money on 6.5 years of MT5 data and were removed from the Playbook. Kept for reference only.</p>
          {retired.map(({ info, code, strategyCode, mt5Code, eaCode }) => (
            <IndicatorCard key={info.id} info={info} code={code} strategyCode={strategyCode} mt5Code={mt5Code} eaCode={eaCode} />
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
