import { StrategyGuide } from "./types";
import { extremeOrderBlockGuide } from "./extremeOrderBlock";
import { sessionLondonBosGuide } from "./sessionLondonBos";
import { smartMoneyConceptsGuide } from "./smartMoneyConcepts";
import { macd200EmaSrGuide } from "./macd200EmaSr";
import { macdSmaAtrGuide } from "./macdSmaAtr";

export type { StrategyGuide, GuideStep, GuideDiagram, GuideBacktestRow, DiagramTone } from "./types";

// One guide per coded strategy (src/strategies/registry.ts). Adding a
// strategy without a guide fails src/guides/tests/guides.test.ts.
export const STRATEGY_GUIDES: StrategyGuide[] = [
  sessionLondonBosGuide,
  macd200EmaSrGuide,
  macdSmaAtrGuide,
  extremeOrderBlockGuide,
  smartMoneyConceptsGuide,
];

export function getGuide(key: string): StrategyGuide | undefined {
  return STRATEGY_GUIDES.find((g) => g.key === key);
}
