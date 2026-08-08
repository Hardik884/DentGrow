/**
 * Quick-filter chip builders.
 *
 * Pure, server-safe helpers that produce the chip config consumed by the
 * shared <QuickFilters> client component. Each page passes its clinic-local
 * "today" so date ranges match the rest of the app (which filters on date).
 *
 * Each chip only lists the params it sets; <QuickFilters> clears every other
 * tracked key, so chips are mutually exclusive and their active state can be
 * derived by an exact URL comparison.
 */

import { getDateRangePresets } from "@/lib/utils";
import type { QuickFilterChip } from "@/components/shared/QuickFilters";

export interface QuickFilterConfig {
  trackKeys: string[];
  chips: QuickFilterChip[];
}

// ── Appointments ─────────────────────────────────────────────────────────────
export function appointmentsQuickFilters(today: string): QuickFilterConfig {
  const p = getDateRangePresets(today);
  return {
    trackKeys: ["status", "dateFrom", "dateTo", "timeFrom", "timeTo"],
    chips: [
      { label: "All", set: {} },
      { label: "Today", set: { dateFrom: p.today, dateTo: p.today } },
      { label: "Upcoming", set: { dateFrom: p.today } },
      { label: "Pending", set: { status: "scheduled" } },
      { label: "Completed", set: { status: "completed" } },
      { label: "Cancelled", set: { status: "cancelled" } },
      { label: "No-shows", set: { status: "no_show" } },
      { label: "This Week", set: { dateFrom: p.weekStart, dateTo: p.weekEnd } },
      { label: "This Month", set: { dateFrom: p.monthStart, dateTo: p.monthEnd } },
    ],
  };
}

// ── Treatments ───────────────────────────────────────────────────────────────
export function treatmentsQuickFilters(today: string): QuickFilterConfig {
  const p = getDateRangePresets(today);
  return {
    trackKeys: ["status", "dateFrom", "dateTo"],
    chips: [
      { label: "All", set: {} },
      { label: "Today", set: { dateFrom: p.today, dateTo: p.today } },
      { label: "This Week", set: { dateFrom: p.weekStart, dateTo: p.weekEnd } },
      { label: "This Month", set: { dateFrom: p.monthStart, dateTo: p.monthEnd } },
      { label: "In Progress", set: { status: "in_progress" } },
      { label: "Completed", set: { status: "completed" } },
    ],
  };
}

// ── Follow-up Appointments ─────────────────────────────────────────────────────
export function followUpsQuickFilters(today: string): QuickFilterConfig {
  const p = getDateRangePresets(today);
  return {
    trackKeys: ["status", "confirmation", "dateFrom", "dateTo"],
    chips: [
      { label: "All", set: {} },
      { label: "Today", set: { dateFrom: p.today, dateTo: p.today } },
      { label: "This Week", set: { dateFrom: p.weekStart, dateTo: p.weekEnd } },
      { label: "This Month", set: { dateFrom: p.monthStart, dateTo: p.monthEnd } },
      { label: "Pending", set: { status: "pending" } },
      { label: "Confirmed", set: { confirmation: "confirmed" } },
      { label: "Tentative", set: { confirmation: "tentative" } },
      { label: "Completed", set: { status: "completed" } },
    ],
  };
}

// ── Payments ─────────────────────────────────────────────────────────────────
export function paymentsQuickFilters(today: string): QuickFilterConfig {
  const p = getDateRangePresets(today);
  return {
    trackKeys: ["paymentType", "dateFrom", "dateTo"],
    chips: [
      { label: "All", set: {} },
      { label: "Today", set: { dateFrom: p.today, dateTo: p.today } },
      { label: "This Week", set: { dateFrom: p.weekStart, dateTo: p.weekEnd } },
      { label: "This Month", set: { dateFrom: p.monthStart, dateTo: p.monthEnd } },
      { label: "Treatment", set: { paymentType: "treatment" } },
      { label: "OPD", set: { paymentType: "opd" } },
    ],
  };
}

// ── Patients ─────────────────────────────────────────────────────────────────
export function patientsQuickFilters(): QuickFilterConfig {
  return {
    trackKeys: ["filter"],
    chips: [
      { label: "All", set: {} },
      { label: "New Patients", set: { filter: "new" } },
      { label: "Today's Visits", set: { filter: "visits-today" } },
      { label: "Active", set: { filter: "active" } },
      { label: "Inactive", set: { filter: "inactive" } },
    ],
  };
}

// ── Analytics ──────────────────────────────────────────────────────────────────
export function analyticsQuickFilters(today: string): QuickFilterConfig {
  const p = getDateRangePresets(today);
  return {
    trackKeys: ["from", "to"],
    chips: [
      { label: "Today", set: { from: p.today, to: p.today } },
      { label: "This Week", set: { from: p.weekStart, to: p.weekEnd } },
      { label: "This Month", set: { from: p.monthStart, to: p.monthEnd } },
      { label: "Last Month", set: { from: p.lastMonthStart, to: p.lastMonthEnd } },
      { label: "This Year", set: { from: p.yearStart, to: p.yearEnd } },
    ],
  };
}
