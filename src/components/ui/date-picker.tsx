"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarIcon, X } from "lucide-react";
import Calendar from "@/components/ui/calendar";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" });

// "yyyy-MM-dd" using local date parts (matches native <input type="date">'s
// value format, so callers can swap this in without touching filter logic).
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
}

export default function DatePicker({ value, onChange, placeholder = "Select date", minDate, maxDate }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIsoDate(value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all hover:border-slate-700 data-[popup-open]:border-violet-500 cursor-pointer"
      >
        <span className={selected ? "text-slate-200" : "text-slate-500"}>
          {selected ? DISPLAY_FORMAT.format(selected) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-slate-500 hover:text-white p-0.5 rounded"
              aria-label="Clear date"
            >
              <X size={13} />
            </span>
          )}
          <CalendarIcon size={14} className="text-slate-500" />
        </span>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={8} align="start">
          <PopoverPrimitive.Popup className="z-50 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl shadow-black/40 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Calendar
              selected={selected}
              minDate={fromIsoDate(minDate ?? "")}
              maxDate={fromIsoDate(maxDate ?? "")}
              onSelect={(date) => {
                onChange(toIsoDate(date));
                setOpen(false);
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
