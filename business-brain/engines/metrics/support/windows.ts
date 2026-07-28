/**
 * Metrics Engine — trailing-window helpers
 *
 * Shared by the revenue and treatment calculators so "the last 30 days" means
 * exactly one thing. Two calculators disagreeing by a day would make production
 * and average case value quietly inconsistent with each other.
 *
 * All arithmetic is on "YYYY-MM-DD" strings via the shared calendar helpers —
 * no `Date`, no timezone, no clock. ISO dates compare correctly as strings,
 * which is what makes the window filters safe.
 */

import type { ClinicDataSnapshot, PaymentSnapshot, TreatmentSnapshot } from "../../../repositories";
import { addDays } from "../../../utils";

/**
 * Inclusive first day of a trailing window ending on `date`.
 * A 30-day window ending 2026-07-28 starts on 2026-06-29 — 30 days inclusive.
 */
export function windowStart(date: string, days: number): string {
  return addDays(date, -(days - 1));
}

/** The "YYYY-MM-DD" part of an ISO timestamp. */
export function datePart(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Treatments completed inside the trailing window, dated by `performedAt`.
 * A completed treatment with no `performedAt` is excluded: without a date it
 * cannot be attributed to a window.
 */
export function completedInWindow(
  s: ClinicDataSnapshot,
  days: number,
): readonly TreatmentSnapshot[] {
  const from = windowStart(s.date, days);
  return s.treatments.filter(
    (t) =>
      t.status === "completed" &&
      t.performedAt !== null &&
      datePart(t.performedAt) >= from &&
      datePart(t.performedAt) <= s.date,
  );
}

/** Payments received inside the trailing window. */
export function paymentsInWindow(
  s: ClinicDataSnapshot,
  days: number,
): readonly PaymentSnapshot[] {
  const from = windowStart(s.date, days);
  return s.payments.filter((p) => p.paymentDate >= from && p.paymentDate <= s.date);
}
