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
 * @example formatDateTime("2026-06-19T10:30:00Z") → "19 Jun 2026, 10:30 AM"
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
