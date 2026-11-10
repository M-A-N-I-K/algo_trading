import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Tag } from "@/components/kit";
import { signedNumber, toneClass } from "@/components/viz/format";
import { STRATEGY_GUIDES } from "@/guides";

const DIFFICULTY_TONE = { Beginner: "gain", Intermediate: "fees", Advanced: "loss" } as const;
const ORDER = { Beginner: 0, Intermediate: 1, Advanced: 2 };

// Every strategy's guide, easiest first.
export default function GuidesIndex() {
  const guides = [...STRATEGY_GUIDES].sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty]);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="max-w-[75ch]">
        <p className="text-[15px] leading-relaxed text-fog">
          Each guide walks through one strategy exactly as the app backtests it: the words you need, how to set up your chart, how to spot a trade step by step,
          where the stop and target go, and a checklist to tick before you place the order. Start with a Beginner one.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guides.map((g) => (
          <li key={g.key}>
            <Link
              href={`/guides/${g.key}`}
              className="group flex h-full flex-col gap-3 rounded-[10px] border border-rule bg-deck p-5 transition-colors hover:border-mist focus-visible:outline-2 focus-visible:outline-signal"
            >
              <div className="flex flex-wrap gap-1.5">
                <Tag tone={DIFFICULTY_TONE[g.difficulty]}>{g.difficulty}</Tag>
                <Tag>{g.style}</Tag>
              </div>
              <div>
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-paper">{g.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-fog">{g.tagline}</p>
              </div>
              <p className="text-[13px] text-mist">{g.timeframes}</p>
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-rule pt-3">
                <p className="text-[13px] text-fog">
                  Last backtest:{" "}
                  {g.backtest.rows.map((r, i) => (
                    <span key={`${r.symbol}-${r.timeframe}`}>
                      {i > 0 && " · "}
                      {r.symbol.replace("USDT", "")} <span className={`tabular-nums ${toneClass(r.returnPct)}`}>{signedNumber(r.returnPct, 1, "%")}</span>
                    </span>
                  ))}
                </p>
                <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-fog transition-transform group-hover:translate-x-0.5 group-hover:text-paper" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
