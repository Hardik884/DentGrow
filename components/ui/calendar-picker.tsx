"use client";

/**
 * CalendarPicker
 *
 * A modern, accessible date picker built for DentGrow with:
 * - Year range: 1900 → 2100 (supports elderly DOB, migrated historical records,
 *   and future scheduling)
 * - Searchable year selection via a scrollable dropdown
 * - Easy month + year switching with prev/next navigation
 * - Keyboard accessible (arrow keys, Tab, Enter, Escape)
 * - Mobile-friendly touch targets
 * - Popover or inline display mode
 * - Consistent with DentGrow's shadcn design system
 * - No external calendar library dependency
 *
 * Usage (controlled):
 *   <CalendarPicker value="2026-06-20" onChange={(v) => setDate(v)} />
 *
 * Usage (inline, no popover):
 *   <CalendarPicker value={date} onChange={setDate} inline />
 */

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Select } from "@/components/ui/select";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Year range: 1900 → 2100. Wide enough for:
// - Elderly patient DOB (100+ years old still supported)
// - Historical / migrated clinic records going back decades
// - Future scheduling with plenty of runway
const YEAR_START = 1900;
const YEAR_END = 2100;
const YEAR_OPTIONS = Array.from(
  { length: YEAR_END - YEAR_START + 1 },
  (_, i) => YEAR_START + i
);

// ── Types ────────────────────────────────────────────────────────────────────

interface CalendarPickerProps {
  /** ISO date string "YYYY-MM-DD" */
  value?: string;
  /** Called with "YYYY-MM-DD" when a date is selected */
  onChange?: (value: string) => void;
  /** Minimum selectable date as "YYYY-MM-DD" */
  min?: string;
  /** Maximum selectable date as "YYYY-MM-DD" */
  max?: string;
  /** Disable the entire picker */
  disabled?: boolean;
  /** Render inline without a popover trigger */
  inline?: boolean;
  /** Placeholder shown in the trigger when no date is selected */
  placeholder?: string;
  /** Additional class names for the trigger button (popover mode) */
  className?: string;
  /** ID for the trigger input (for aria/label association) */
  id?: string;
  /** Show a clear button in the trigger */
  clearable?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(str: string | undefined): Date | null {
  if (!str) return null;
  const d = new Date(`${str}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(str: string | undefined): string {
  if (!str) return "";
  const d = parseDate(str);
  if (!d) return str;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function toDateStr(year: number, month: number, day: number): string {
  return [
    year.toString(),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ── Year Selector ─────────────────────────────────────────────────────────────
// A scrollable list with the active year centered, replaces the browser
// <select> which cuts off at ~2016 on many platforms.

interface YearSelectorProps {
  year: number;
  onSelect: (y: number) => void;
  onClose: () => void;
}

function YearSelector({ year, onSelect, onClose }: YearSelectorProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll the selected year into the center of the list on open
  useEffect(() => {
    if (activeRef.current && listRef.current) {
      const list = listRef.current;
      const item = activeRef.current;
      const listMid = list.clientHeight / 2;
      const itemTop = item.offsetTop;
      list.scrollTop = itemTop - listMid + item.clientHeight / 2;
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-10 bg-surface rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-text-primary">Select Year</span>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
          aria-label="Close year selector"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain py-1"
        aria-label="Year"
      >
        {YEAR_OPTIONS.map((y) => {
          const isSelected = y === year;
          return (
            <button
              key={y}
              ref={isSelected ? activeRef : undefined}
              type="button"
              onClick={() => { onSelect(y); onClose(); }}
              aria-label={`Year ${y}${isSelected ? " (selected)" : ""}`}
              className={cn(
                "w-full px-4 py-1.5 text-sm text-left transition-colors",
                isSelected
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-text-primary hover:bg-surface"
              )}
            >
              {y}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Calendar Grid ────────────────────────────────────────────────────────────

interface CalendarGridProps {
  year: number;
  month: number;
  selected: string | undefined;
  min?: string;
  max?: string;
  onSelect: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
}

function CalendarGrid({
  year,
  month,
  selected,
  min,
  max,
  onSelect,
  onPrevMonth,
  onNextMonth,
  onYearChange,
  onMonthChange,
}: CalendarGridProps) {
  const [showYearSelector, setShowYearSelector] = useState(false);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date().toISOString().split("T")[0];

  // Build grid: leading blank cells + day cells
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: toDateStr(year, month, d) });
  }
  const totalCells = Math.ceil(cells.length / 7) * 7;
  while (cells.length < totalCells) {
    cells.push({ day: null, dateStr: null });
  }

  return (
    <div className="relative select-none w-72">
      {/* ── Year selector overlay ── */}
      {showYearSelector && (
        <YearSelector
          year={year}
          onSelect={onYearChange}
          onClose={() => setShowYearSelector(false)}
        />
      )}

      {/* ── Header: prev / month dropdown / year button / next ── */}
      <div className="flex items-center gap-1 mb-3 px-1">
        <button
          type="button"
          onClick={onPrevMonth}
          className="h-8 w-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Month dropdown. Styled down to a borderless label so it reads as
            part of the calendar header rather than a form control. */}
        <Select
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="flex-1 h-7 px-1.5 text-xs font-semibold border-0 bg-transparent hover:bg-surface hover:border-0 justify-center gap-1"
          aria-label="Select month"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i}>{name}</option>
          ))}
        </Select>

        {/* Year button — opens custom scrollable year selector */}
        <button
          type="button"
          onClick={() => setShowYearSelector(true)}
          className="w-16 text-xs font-semibold text-text-primary bg-transparent rounded-md hover:bg-surface px-1.5 py-0.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          aria-label={`Year ${year}. Click to change year`}
          aria-haspopup="listbox"
        >
          {year}
        </button>

        <button
          type="button"
          onClick={onNextMonth}
          className="h-8 w-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Month quick-jump strip (3-letter abbreviations) ── */}
      <div className="grid grid-cols-6 gap-0.5 mb-3 px-0.5">
        {MONTH_NAMES_SHORT.map((name, i) => (
          <button
            key={name}
            type="button"
            onClick={() => onMonthChange(i)}
            className={cn(
              "py-0.5 text-[10px] rounded transition-colors",
              i === month
                ? "bg-accent text-accent-foreground font-semibold"
                : "text-text-secondary hover:bg-surface hover:text-text-primary"
            )}
            aria-label={MONTH_NAMES[i]}
          >
            {name}
          </button>
        ))}
      </div>

      {/* ── Day-of-week headers ── */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((h) => (
          <div key={h} className="h-7 flex items-center justify-center text-[10px] font-medium text-text-disabled">
            {h}
          </div>
        ))}
      </div>

      {/* ── Day cells ── */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={`blank-${idx}`} className="h-9 w-full" />;
          }

          const isSelected = cell.dateStr === selected;
          const isToday = cell.dateStr === today;
          const isDisabled =
            (min != null && cell.dateStr < min) ||
            (max != null && cell.dateStr > max);

          return (
            <button
              key={cell.dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(cell.dateStr!)}
              className={cn(
                "h-9 w-full flex items-center justify-center text-xs rounded-md transition-colors",
                isSelected
                  ? "bg-accent text-accent-foreground font-semibold"
                  : isToday && !isSelected
                  ? "bg-surface text-text-primary font-semibold ring-1 ring-border"
                  : "text-text-primary hover:bg-surface",
                isDisabled && "opacity-30 cursor-not-allowed hover:bg-transparent"
              )}
              aria-label={`${MONTH_NAMES[month]} ${cell.day}, ${year}${isSelected ? " (selected)" : ""}${isToday ? " (today)" : ""}`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── CalendarPicker (exported) ────────────────────────────────────────────────

export function CalendarPicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  inline = false,
  placeholder = "Pick a date",
  className,
  id,
  clearable = false,
}: CalendarPickerProps) {
  const uid = useId();
  const triggerId = id ?? uid;

  // Derive initial view from value, or today
  const initialDate = parseDate(value) ?? new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [open, setOpen] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Portal-based positioning: track the trigger's exact viewport coords so the
  // popover renders via a portal on <body> and escapes any overflow:hidden ancestor.
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  // Keep view in sync when value changes externally
  useEffect(() => {
    const d = parseDate(value);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setPopoverPos(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setPopoverPos(null);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleSelect = useCallback(
    (dateStr: string) => {
      onChange?.(dateStr);
      if (!inline) setOpen(false);
    },
    [onChange, inline]
  );

  const handlePrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const grid = (
    <CalendarGrid
      year={viewYear}
      month={viewMonth}
      selected={value}
      min={min}
      max={max}
      onSelect={handleSelect}
      onPrevMonth={handlePrevMonth}
      onNextMonth={handleNextMonth}
      onYearChange={setViewYear}
      onMonthChange={setViewMonth}
    />
  );

  if (inline) {
    return <div className="p-2">{grid}</div>;
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <div className="relative flex items-center">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen((o) => {
              if (!o && triggerRef.current) {
                // Measure the trigger's position in the viewport so we can
                // portal-render the popover at the exact right spot, escaping
                // any overflow:hidden ancestor (e.g. the card's rounded-xl).
                const rect = triggerRef.current.getBoundingClientRect();
                const CALENDAR_WIDTH = 312; // ~w-72 (288) + padding (24)
                const top = rect.bottom + window.scrollY + 6;
                // Prefer left-aligned; flip right if it would overflow viewport.
                const fitsRight = rect.left + CALENDAR_WIDTH <= window.innerWidth - 8;
                let left = fitsRight
                  ? rect.left + window.scrollX
                  : rect.right + window.scrollX - CALENDAR_WIDTH;
                // Clamp so the popover never renders past the viewport edges on
                // narrow screens (e.g. a 320px-wide phone), regardless of where
                // the trigger sits.
                left = Math.max(8, Math.min(left, window.innerWidth - CALENDAR_WIDTH - 8));
                setPopoverPos({ top, left, minWidth: rect.width });
              } else if (o) {
                setPopoverPos(null);
              }
              return !o;
            });
          }}
          aria-haspopup="dialog"
          className={cn(
            "flex items-center gap-2 w-full h-9 px-3 py-2 rounded-lg border border-border",
            "bg-surface text-sm text-left transition-colors",
            "hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            !value && "text-text-disabled",
            value && "text-text-primary",
            open && "border-accent ring-2 ring-accent ring-offset-1",
            className
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-text-disabled" aria-hidden />
          <span className="flex-1 truncate">
            {value ? formatDisplay(value) : placeholder}
          </span>
        </button>

        {/* Clear button */}
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange?.(""); }}
            className="absolute right-2.5 h-5 w-5 flex items-center justify-center rounded text-text-disabled hover:text-text-primary transition-colors"
            aria-label="Clear date"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Popover — rendered in a portal on <body> so it escapes overflow:hidden ancestors */}
      {open && popoverPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Date picker"
          style={{
            position: "fixed",
            top: popoverPos.top - window.scrollY,
            left: popoverPos.left - window.scrollX,
            minWidth: popoverPos.minWidth,
          }}
          className={cn(
            "z-[9999] rounded-xl border border-border bg-surface shadow-lg p-3",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {grid}
        </div>,
        document.body
      )}
    </div>
  );
}
