"use client";

import { RotateCcw, ShieldHalf } from "lucide-react";
import { Currency } from "@/lib/riskCalculator";

interface HeaderProps {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  onReset: () => void;
}

export default function RiskCalcHeader({ currency, onCurrencyChange, onReset }: HeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
          <ShieldHalf className="text-white" size={22} />
        </div>
        <div>
          <h1 className="font-Outfit text-xl sm:text-2xl font-extrabold tracking-tight">Trading Risk Calculator</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Turn your trading rules into a clear, practical risk-management system.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-xl border border-border bg-muted/40 p-1 text-xs font-semibold">
          {(["INR", "USDT"] as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCurrencyChange(c)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                currency === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "INR" ? "₹ INR" : "₮ USDT"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirm("Reset all settings to defaults? This clears your saved configuration.")) onReset();
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-muted/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>
    </header>
  );
}
