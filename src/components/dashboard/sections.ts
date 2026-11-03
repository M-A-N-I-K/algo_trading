// Dashboard sections the user can hide in Settings. Stored in
// User.hiddenKpiCards (the column predates the redesign; it now holds
// section keys). The P&L bridge at the top is always shown.
export const DASHBOARD_SECTIONS = [
  { key: "livePulse", label: "Live pulse" },
  { key: "equity", label: "Equity and drawdown" },
  { key: "ratios", label: "Key ratios" },
  { key: "rDistribution", label: "R-multiple distribution" },
  { key: "timing", label: "When you trade" },
  { key: "holdTime", label: "Hold time" },
  { key: "splits", label: "Long vs short and exit type" },
  { key: "symbols", label: "By symbol" },
  { key: "calendar", label: "Calendar" },
  { key: "recent", label: "Recent trades" },
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTIONS)[number]["key"];
