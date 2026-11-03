// A step-by-step playbook for one coded strategy, written so a complete
// beginner can find, enter and manage its trades by hand. Every rule must
// match what the strategy's code does (src/strategies), so the backtest
// numbers describe the same trades the guide teaches.

export interface GuideStep {
  title: string;
  detail: string;
}

export type DiagramTone = "gain" | "loss" | "signal" | "fees" | "muted";

// A schematic long setup, drawn in a 100 × 100 box (x = time, y = price,
// higher y = higher price). Not to scale.
export interface GuideDiagram {
  caption: string;
  price: [number, number][];
  lines?: { points: [number, number][]; label: string; tone: DiagramTone }[];
  // Labels sit inside the zone's top-left corner, or top-right with labelAt "end".
  zones?: { x1: number; x2: number; y1: number; y2: number; label: string; tone: DiagramTone; labelAt?: "start" | "end" }[];
  // Labels sit above the line at its right end, or its left end with labelAt "start".
  levels?: { y: number; x1?: number; x2?: number; label: string; tone: DiagramTone; labelAt?: "start" | "end" }[];
  verticals?: { x: number; label: string }[];
  // Labels are centred over the point unless anchor says otherwise.
  marks?: { x: number; y: number; label: string; tone: DiagramTone; below?: boolean; anchor?: "start" | "middle" | "end" }[];
}

export interface GuideBacktestRow {
  symbol: string;
  timeframe: string;
  trades: number;
  winRatePct: number;
  profitFactor: number;
  returnPct: number;
  maxDrawdownPct: number;
}

export interface StrategyGuide {
  key: string; // the CODED_STRATEGIES key
  name: string;
  tagline: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  style: string;
  timeframes: string;
  markets: string;
  frequency: string;
  holdTime: string;
  direction: string;

  summary: string[];
  terms: { term: string; meaning: string }[];
  chartSetup: GuideStep[];
  long: GuideStep[];
  short: GuideStep[];
  entry: string;
  stop: string;
  target: string;
  manage: GuideStep[];
  skip: string[];
  mistakes: string[];
  example: { title: string; steps: string[] };
  diagram: GuideDiagram;
  checklist: string[];
  backtest: { period: string; settings: string; rows: GuideBacktestRow[]; verdict: string };
}
