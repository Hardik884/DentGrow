import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import type { AppointmentStatus, TreatmentStatus, FollowUpStatus } from "@/types";

// =============================================================================
// Tailwind class merging
// =============================================================================

/**
 * cn — merge Tailwind classes safely.
 * Combines clsx (conditional classes) + tailwind-merge (conflict resolution).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =============================================================================
// Date formatting
// =============================================================================

/**
 * formatDate — formats a date string or Date object for display.
 * Uses the LOCAL browser/Node timezone. Safe for date-only values (no time component).
 * @example formatDate("2026-06-19") → "19 Jun 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMM yyyy");
  } catch {
    return "—";
  }
}

/**
 * formatDateTime — formats a datetime string for display with time.
 * Renders in the browser/Node local timezone.
 * @example formatDateTime("2026-06-19T10:30:00Z") → "19 Jun 2026, 10:30 AM"
 *
 * Prefer formatDateTimeInTimezone() when displaying clinic appointment times
 * to ensure consistent rendering regardless of where the browser/server is located.
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMM yyyy, hh:mm a");
  } catch {
    return "—";
  }
}

/**
 * formatDateTimeInTimezone
 *
 * Renders a UTC timestamptz in a specific IANA timezone.
 * This is the correct function for displaying appointment times — it ensures
 * the same date and time is shown regardless of where the browser or server runs.
 *
 * Uses Intl.DateTimeFormat which is available in all modern browsers and Node.js.
 *
 * @example
 *   formatDateTimeInTimezone("2026-06-20T03:30:00Z", "Asia/Kolkata")
 *   // → "20 Jun 2026, 09:00 AM"  (09:00 IST = 03:30 UTC)
 */
export function formatDateTimeInTimezone(
  date: string | Date | null | undefined,
  timezone: string
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    // Fall back to local rendering if the timezone string is invalid
    return formatDateTime(date);
  }
}

/**
 * getTodayInTimezone
 *
 * Returns today's date as "YYYY-MM-DD" in the given IANA timezone.
 * Use this instead of `new Date().toISOString().split("T")[0]` whenever
 * the "current date" must match the clinic's local calendar.
 *
 * @example
 *   getTodayInTimezone("Asia/Kolkata")  // → "2026-06-20" (even if UTC shows 2026-06-19)
 */
export function getTodayInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // en-CA gives YYYY-MM-DD format
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

/**
 * getDayOfWeekInTimezone
 *
 * Returns the ISO day-of-week (0=Sunday…6=Saturday) for a "YYYY-MM-DD" date
 * string in the given IANA timezone, avoiding the UTC midnight shift bug where
 * `new Date("2026-06-20").getDay()` returns the PREVIOUS day's DOW for
 * timezones behind UTC.
 *
 * Correct: append T12:00:00 to avoid any timezone boundary crossing.
 */
export function getDayOfWeekInTimezone(date: string, timezone: string): number {
  try {
    // Parse as local noon to avoid DST/timezone boundary issues
    const d = new Date(`${date}T12:00:00`);
    const dayStr = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(d);
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[dayStr] ?? d.getDay();
  } catch {
    return new Date(`${date}T12:00:00`).getDay();
  }
}

/**
 * getNowMinutesInTimezone
 *
 * Returns the current time as total minutes-since-midnight in the given
 * IANA timezone. Used by getAvailableSlots to filter out past time slots.
 */
export function getNowMinutesInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now).slice(0, 5); // "HH:MM"
    const [h, m] = timeStr.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  } catch {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

/**
 * getUtcBoundariesForLocalDate
 *
 * Given a "YYYY-MM-DD" local date in the clinic timezone, returns the
 * UTC ISO strings for midnight-start and end-of-day, for use in Supabase
 * `gte`/`lte` queries against a `timestamptz` column.
 *
 * Example (Asia/Kolkata, UTC+5:30):
 *   getUtcBoundariesForLocalDate("2026-06-20", "Asia/Kolkata")
 *   // → { start: "2026-06-19T18:30:00.000Z", end: "2026-06-20T18:29:59.999Z" }
 */
export function getUtcBoundariesForLocalDate(
  localDate: string,
  timezone: string
): { start: string; end: string } {
  try {
    // Simplest correct approach: delegate to zonedDateToUTC which handles
    // the offset calculation via Intl. The intermediate Date objects and
    // formatter that were here were dead code.
    const midnightUTC = zonedDateToUTC(`${localDate}T00:00:00`, timezone);
    const endOfDayUTC = zonedDateToUTC(`${localDate}T23:59:59.999`, timezone);

    return {
      start: midnightUTC.toISOString(),
      end: endOfDayUTC.toISOString(),
    };
  } catch {
    // Fallback: use naive strings (acceptable if server is UTC)
    return {
      start: `${localDate}T00:00:00.000Z`,
      end: `${localDate}T23:59:59.999Z`,
    };
  }
}

/**
 * zonedDateToUTC
 *
 * Converts a wall-clock datetime string (no timezone suffix) interpreted in
 * `timezone` to a UTC Date object.
 *
 * This is the key function for the "store as UTC" pattern:
 *   User selects "2026-06-20 09:00 AM" in a clinic with timezone "Asia/Kolkata"
 *   → store as 2026-06-20T03:30:00.000Z (UTC)
 */
export function zonedDateToUTC(localDatetime: string, timezone: string): Date {
  // The trick: format a known UTC date in the target timezone and compare
  // to find the offset, then apply it.
  // We use a binary-search-free approach: create a Date treating the string
  // as UTC, then compute the difference between what Intl says the local time
  // is versus what we want.
  const naiveUtc = new Date(localDatetime.endsWith("Z") ? localDatetime : `${localDatetime}Z`);

  // Get what the target timezone says this UTC moment is
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(naiveUtc);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const tzYear = parseInt(get("year"));
  const tzMonth = parseInt(get("month")) - 1;
  const tzDay = parseInt(get("day"));
  const tzHour = parseInt(get("hour"));
  const tzMinute = parseInt(get("minute"));
  const tzSecond = parseInt(get("second"));

  // The difference between what TZ says and what we passed in tells us the offset
  const tzDate = new Date(Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond));

  // Parse the target local datetime
  const [datePart, timePart] = localDatetime.replace("Z", "").split("T");
  const [yr, mo, dy] = (datePart ?? "").split("-").map(Number);
  const timeParts = (timePart ?? "00:00:00").split(":");
  const hr = parseInt(timeParts[0] ?? "0");
  const mn = parseInt(timeParts[1] ?? "0");
  const sc = parseFloat(timeParts[2] ?? "0");
  const msVal = Math.round((sc % 1) * 1000);
  const targetLocal = new Date(Date.UTC(yr, (mo ?? 1) - 1, dy, hr, mn, Math.floor(sc), msVal));

  // Offset in ms = naiveUtc - tzDate  (how far off was our "naive UTC" from the real local time)
  const offsetMs = naiveUtc.getTime() - tzDate.getTime();

  return new Date(targetLocal.getTime() + offsetMs);
}

/**
 * formatTimeAgo — relative time display.
 * @example formatTimeAgo("2026-06-18T10:00:00Z") → "1 day ago"
 */
export function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "—";
  }
}

/**
 * formatTime — formats a time-only string.
 * @example formatTime("10:30:00") → "10:30 AM"
 */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  try {
    return format(new Date(`1970-01-01T${time}`), "hh:mm a");
  } catch {
    return "—";
  }
}

/**
 * calculateAge — derives age from date_of_birth.
 * Never stored in DB — always calculated at runtime.
 */
export function calculateAge(dateOfBirth: string | Date | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// =============================================================================
// Currency formatting
// =============================================================================

/**
 * formatCurrency — formats a numeric amount as currency.
 * @example formatCurrency(1234.5) → "₹1,234.50"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

// =============================================================================
// Status label helpers
// =============================================================================

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  checked_in: "Checked In",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

export const TREATMENT_STATUS_LABELS: Record<TreatmentStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  review:            "Review",
  cleaning:          "Cleaning",
  crown_check:       "Crown Check",
  root_canal_review: "Root Canal Review",
  implant_review:    "Implant Review",
  payment_reminder:  "Payment Reminder",
  consultation:      "Consultation",
  custom:            "Custom",
};

export const APPOINTMENT_SOURCE_LABELS = {
  walk_in: "Walk-in",
  phone_call: "Phone Call",
  website: "Website",
  referral: "Referral",
  other: "Other",
} as const;

export const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank Transfer",
} as const;

// =============================================================================
// Status badge variants (for use with StatusBadge component)
// =============================================================================

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

export function getAppointmentStatusVariant(status: AppointmentStatus): BadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "checked_in":
      return "warning";
    case "scheduled":
      return "default";
    case "cancelled":
    case "no_show":
      return "error";
    default:
      return "default";
  }
}
