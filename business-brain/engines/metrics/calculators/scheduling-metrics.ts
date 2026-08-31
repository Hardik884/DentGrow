/**
 * Metrics Engine — Scheduling calculators (trailing window)
 *
 * Rates and lead time over the trailing window, rather than the daily counts in
 * `appointment-metrics.ts`.
 *
 * Rates are what make attrition comparable and benchmarkable — industry no-show
 * runs around 10%, and a count cannot be measured against that. They also remove
 * the small-denominator problem the daily signals compensate for with sample
 * guards: two cancellations out of four booked is a crisis, out of forty it is
 * noise, and only a rate can tell those apart.
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";
import { median, statusRate } from "../support/windows";

/**
 * Cancellation rate over the trailing window.
 *
 * WITHHELD when the window is absent (the repository supplied no range) or
 * empty (no appointments at all, so there is no denominator).
 */
export function cancellationRate30d(s: ClinicDataSnapshot): Metric | null {
  const window = s.trailingWindow;
  if (window === undefined) return null;
  const value = statusRate(window, "cancelled");
  if (value === null) return null;
  return buildMetric(
    MetricKey.SCHEDULING_CANCELLATION_RATE_30D,
    value,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

/**
 * Distinct patients who failed to attend TWICE OR MORE in the trailing window.
 *
 * Answers a question no rate can: is the clinic's attrition spread across its
 * whole patient base, or concentrated in a handful of people? A 12% no-show rate
 * made of twelve different patients is a reminder-process problem; the same 12%
 * made of three patients missing four appointments each is three conversations.
 * The responses are different, and the rate is identical.
 *
 * Counts `no_show` only, never cancellations. A patient who cancels with notice
 * released a slot the clinic could refill and is not the same problem — the
 * schedule_attrition pattern already keeps that distinction, and blurring it
 * here would put well-behaved patients on a list about non-attendance.
 *
 * Counts PATIENTS, not missed appointments, because the action is per-person: a
 * list of three names is something a receptionist can work, and the same number
 * expressed as "nine missed appointments" is not.
 *
 * WITHHELD when the window is absent. An empty window legitimately yields 0 —
 * appointments existed to miss and nobody missed two.
 */
export function repeatNonAttenders30d(s: ClinicDataSnapshot): Metric | null {
  const window = s.trailingWindow;
  if (window === undefined) return null;

  const missesByPatient = new Map<string, number>();
  for (const appointment of window.appointments) {
    if (appointment.status !== "no_show") continue;
    missesByPatient.set(
      appointment.patientId,
      (missesByPatient.get(appointment.patientId) ?? 0) + 1,
    );
  }

  let repeat = 0;
  for (const misses of missesByPatient.values()) {
    if (misses >= 2) repeat += 1;
  }

  return buildMetric(
    MetricKey.SCHEDULING_REPEAT_NON_ATTENDERS_30D,
    repeat,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

/** No-show rate over the trailing window. Withheld on the same conditions. */
export function noShowRate30d(s: ClinicDataSnapshot): Metric | null {
  const window = s.trailingWindow;
  if (window === undefined) return null;
  const value = statusRate(window, "no_show");
  if (value === null) return null;
  return buildMetric(MetricKey.SCHEDULING_NO_SHOW_RATE_30D, value, s.clinicId, s.date, s.asOf);
}

/**
 * Median days between an appointment being booked and its scheduled time,
 * across the trailing window.
 *
 * The clearest read on demand pressure. Near zero means the clinic is living
 * hand-to-mouth on walk-ins; a lengthening lead time means demand is outrunning
 * capacity — the discriminator that separates `capacity_ceiling` from
 * `demand_supply_mismatch`, both of which currently rest on undetermined
 * hypotheses.
 *
 * Median, not mean: one appointment booked six months out would drag a mean far
 * from anything the clinic recognises.
 *
 * NEGATIVE lead times are excluded. OraMedha supports backdated data entry
 * (clinic migrations), which creates appointment rows whose `createdAt` is after
 * the visit they describe. Those are historical records, not booking behaviour,
 * and including them would understate real lead time.
 *
 * WITHHELD when the window is absent, or when no appointment in it has a usable
 * lead time.
 */
export function bookingLeadTimeDays(s: ClinicDataSnapshot): Metric | null {
  const window = s.trailingWindow;
  if (window === undefined) return null;

  const leadTimes: number[] = [];
  for (const appointment of window.appointments) {
    const booked = Date.parse(appointment.createdAt);
    const scheduled = Date.parse(appointment.scheduledAt);
    if (Number.isNaN(booked) || Number.isNaN(scheduled)) continue;
    const days = (scheduled - booked) / 86_400_000;
    if (days < 0) continue;
    leadTimes.push(days);
  }

  if (leadTimes.length === 0) return null;
  const value = Math.round(median(leadTimes) * 10) / 10;
  return buildMetric(
    MetricKey.SCHEDULING_BOOKING_LEAD_TIME_DAYS,
    value,
    s.clinicId,
    s.date,
    s.asOf,
  );
}
