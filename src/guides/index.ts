import { StrategyGuide } from "./types";
import { extremeOrderBlockGuide } from "./extremeOrderBlock";
import { sessionLondonBosGuide } from "./sessionLondonBos";
import { smartMoneyConceptsGuide } from "./smartMoneyConcepts";
import { macd200EmaSrGuide } from "./macd200EmaSr";
import { macdSmaAtrGuide } from "./macdSmaAtr";
import { perfectEntryGuide } from "./perfectEntry";
import { liquiditySweepGuide } from "./liquiditySweep";
import { liquidityReversalGuide } from "./liquidityReversal";
import { liquidityReversalMtfGuide } from "./liquidityReversalMtf";
import { topDownGuide } from "./topDown";
import { nyOpenFvgGuide } from "./nyOpenFvg";
import { vwapGuide } from "./vwap";
import { srSweepTrendlineGuide } from "./srSweepTrendline";

export type { StrategyGuide, GuideStep, GuideDiagram, GuideBacktestRow, DiagramTone } from "./types";

// One guide per coded strategy (src/strategies/registry.ts). Adding a
// strategy without a guide fails src/guides/tests/guides.test.ts.
export const STRATEGY_GUIDES: StrategyGuide[] = [
  sessionLondonBosGuide,
  macd200EmaSrGuide,
  macdSmaAtrGuide,
  extremeOrderBlockGuide,
  perfectEntryGuide,
  liquiditySweepGuide,
  liquidityReversalGuide,
  liquidityReversalMtfGuide,
  topDownGuide,
  nyOpenFvgGuide,
  vwapGuide,
  smartMoneyConceptsGuide,
  srSweepTrendlineGuide,
];

export function getGuide(key: string): StrategyGuide | undefined {
  return STRATEGY_GUIDES.find((g) => g.key === key);
}
