"use client";

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
  // TODO: implement date range picker using shadcn/ui Calendar
  void from;
  void to;
  void onChange;

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="date"
        className="border rounded-md px-2 py-1 text-sm"
        defaultValue={from}
      />
      <span className="text-gray-400">to</span>
      <input
        type="date"
        className="border rounded-md px-2 py-1 text-sm"
        defaultValue={to}
      />
    </div>
  );
}
