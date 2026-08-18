"use client";

import { CalendarPicker } from "@/components/ui/calendar-picker";

interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange?: (from: string, to: string) => void;
}

/**
 * DateRangePicker
 *
 * Date range selector used by the analytics section.
 * Date range travels as URL search params (?from=&to=) — no state library.
 * Default range is last 30 days.
 */
export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  function handleFromChange(date: string) {
    onChange?.(date, to ?? "");
  }

  function handleToChange(date: string) {
    onChange?.(from ?? "", date);
  }

  return (
    <div className="flex items-center gap-2">
      <CalendarPicker
        value={from}
        onChange={handleFromChange}
        max={to}
        placeholder="From date"
        className="w-36"
        clearable
      />
      <span className="text-sm text-text-disabled">to</span>
      <CalendarPicker
        value={to}
        onChange={handleToChange}
        min={from}
        placeholder="To date"
        className="w-36"
        clearable
      />
    </div>
  );
}
