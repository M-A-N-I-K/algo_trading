"use client";

import { Wallet } from "lucide-react";
import { AccountSettings, STYLE_DESCRIPTIONS, STYLE_LABELS, TradingStyle } from "@/lib/riskCalculator";
import { NumberField, SectionCard } from "./shared";

interface AccountStyleSectionProps {
  account: AccountSettings;
  tradingStyle: TradingStyle;
  onAccountChange: (patch: Partial<AccountSettings>) => void;
  onApplyPreset: (style: TradingStyle) => void;
}

const STYLES: TradingStyle[] = ["scalping", "day", "swing", "custom"];

export default function AccountStyleSection({ account, tradingStyle, onAccountChange, onApplyPreset }: AccountStyleSectionProps) {
  return (
    <SectionCard title="Account & Trading Style" icon={<Wallet size={16} className="text-primary" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberField
          label="Starting / Current Capital"
          value={account.capital}
          onChange={(v) => onAccountChange({ capital: v ?? 0 })}
          prefix={account.currency === "INR" ? "₹" : undefined}
          suffix={account.currency === "USDT" ? "USDT" : undefined}
          step={100}
          min={0}
          placeholder="100000"
          tooltip="The capital your risk % and daily loss limits are calculated against."
        />
        <NumberField
          label="Current Account Balance / Equity"
          value={account.currentEquity}
          onChange={(v) => onAccountChange({ currentEquity: v ?? 0 })}
          prefix={account.currency === "INR" ? "₹" : undefined}
          suffix={account.currency === "USDT" ? "USDT" : undefined}
          step={100}
          min={0}
          placeholder="100000"
          tooltip="Your live balance right now — can differ from starting capital after open P&L."
        />
      </div>

      <NumberField
        label="Maximum Drawdown Allowed"
        value={account.maxDrawdownPct}
        onChange={(v) => onAccountChange({ maxDrawdownPct: v })}
        suffix="%"
        step={0.5}
        min={0}
        optional
        placeholder="10"
        tooltip="The maximum % of capital you're willing to lose before stopping entirely. Leave blank to disable drawdown tracking."
      />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Trading Style</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onApplyPreset(style)}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                tradingStyle === style
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {STYLE_DESCRIPTIONS[tradingStyle]} <span className="italic">Suggested starting settings — customize according to your tested strategy.</span>
        </p>
      </div>
    </SectionCard>
  );
}
