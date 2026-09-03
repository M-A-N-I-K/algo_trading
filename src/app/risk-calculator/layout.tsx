import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Risk Calculator // AuraJournal",
  description: "A professional risk-management calculator for position sizing, risk/reward, daily loss limits, drawdown protection, and expectancy.",
};

export default function RiskCalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
