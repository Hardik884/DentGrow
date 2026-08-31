-- =============================================================================
-- Per-patient payment plan
-- Migration: 20260831000200_patient_payment_plan.sql
--
-- Why:
--   `revenue.outstanding` and the signals built on it treat every rupee owed the
--   same: a patient who has stopped paying reads identically to one paying
--   ₹5,000 a month against a ₹50,000 balance by prior agreement with the clinic.
--   That is a real false-positive risk in the Business Brain audit — the clinic
--   is told to "chase" money that is already being collected on schedule.
--
--   This closes it the same way `problem_dismissals` closes the alert-fatigue
--   gap: not by hiding the money (it is still genuinely owed and still shown as
--   outstanding everywhere it is today), but by giving staff a way to tell the
--   system a balance is MANAGED, so the Business Brain can size how much of the
--   total needs chasing versus how much is already on track.
--
-- Shape:
--   ONE nullable date, not a boolean-plus-date pair. A boolean `payment_plan_active`
--   would need something to unset it, and the honest failure mode of a forgotten
--   flag is "we said this was fine forever" — exactly the false-negative risk
--   `problem_dismissals`' severity-escalation guard exists to avoid for a
--   different reason. A date does the same job by construction: the plan is
--   "active" only while `payment_plan_until` is today or later, so a plan that
--   was never revisited simply expires back to ordinary outstanding rather than
--   silently suppressing a balance forever.
--
--   No separate table, unlike `problem_dismissals` or `reminder_logs`. Those
--   record EVENTS (a snooze, a sent message); this is a standing FACT about one
--   patient's arrangement with the clinic, the same shape as `notes` or
--   `emergency_contact_name` already on this row.
--
-- Idempotency:
--   `add column if not exists`, so re-running is a no-op.
-- =============================================================================

alter table patients
  add column if not exists payment_plan_until date;

comment on column patients.payment_plan_until is
  'If set and >= current date, this patient''s outstanding balance is under an '
  'agreed payment plan with the clinic. Read by the Business Brain to size how '
  'much of revenue.outstanding is unmanaged versus already being collected on '
  'schedule. The balance itself is unaffected — this changes what is flagged as '
  'needing attention, never what is owed.';
