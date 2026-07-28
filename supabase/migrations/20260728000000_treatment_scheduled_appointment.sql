-- =============================================================================
-- Scheduled Treatments — treatments.scheduled_appointment_id
-- Migration: 20260728000000_treatment_scheduled_appointment.sql
--
-- Problem:
--   A treatment is "scheduled" when the patient has accepted it, it was
--   deliberately NOT performed during the visit at which it was recorded, and
--   it is booked for a specific future appointment.
--
--     consultation today, root canal booked for next Tuesday  -> scheduled
--     filling being done during today's appointment           -> NOT scheduled
--     treatment completed today                               -> NOT scheduled
--     planned, but no actual future appointment               -> NOT scheduled
--
--   The schema could not express this. `treatments.appointment_id` is NOT NULL
--   and records the visit at which the treatment was PROPOSED — it is the same
--   column whether the work happened then or was deferred, so it carries no
--   information about a future booking.
--
--   Every available proxy is wrong. A pending `follow_ups` row is a recall or
--   review, not a booking for this treatment, and a treatment can be booked
--   with no follow-up at all. "The patient has some future appointment" says
--   nothing about whether THIS treatment is what that appointment is for.
--   Inferring from either would report accepted work as booked (or unbooked)
--   on no evidence.
--
-- Solution:
--   An explicit, nullable FK to the appointment at which the treatment is to be
--   performed. NULL means "not booked" — which is a real measurement, not an
--   assumption.
--
--   ON DELETE SET NULL is deliberate: if the future appointment is deleted the
--   treatment is genuinely no longer booked, and the column should say so
--   rather than dangle. (Cancellation is a status change, not a delete, and is
--   handled by the reader — see below.)
--
--   The CHECK encodes the rule directly: a treatment cannot be "scheduled for"
--   the very visit at which it was recorded. Work done during the current visit
--   leaves this column NULL.
--
-- What this migration does NOT do:
--   It does not backfill. There is no data to backfill from — that is precisely
--   the information the schema was missing. Every existing row becomes NULL,
--   i.e. "no booking recorded".
--
--   It does not populate the column either. Until `actions/treatments.ts` and
--   the treatment form let a dentist record which future appointment a planned
--   treatment is booked for, every planned treatment will read as unbooked and
--   `treatment.accepted_pending_scheduling` will over-report. Adding that write
--   path is the required follow-up.
--
-- Reader semantics (lib/business-brain/metrics-repository.ts):
--   scheduled = scheduled_appointment_id IS NOT NULL
--               AND the linked appointment is not soft-deleted
--               AND its status is 'scheduled' or 'checked_in'
--                   (a cancelled/no-show/completed booking no longer holds the
--                    work, so it needs re-booking)
--               AND its scheduled_at is still in the future
--                   (a 'scheduled' appointment whose time has passed is stale
--                    and must not count as booked)
-- =============================================================================

alter table treatments
  add column if not exists scheduled_appointment_id uuid
    references appointments(id) on delete set null;

comment on column treatments.scheduled_appointment_id is
  'The FUTURE appointment at which this treatment is to be performed. NULL when '
  'the treatment is being done during the visit that recorded it, is already '
  'complete, or has not been booked. Distinct from appointment_id, which is the '
  'visit at which the treatment was proposed.';

-- A treatment cannot be scheduled for the visit that recorded it: that is the
-- current visit, not a future booking.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'treatments'::regclass
      and conname  = 'chk_treatment_scheduled_is_future_visit'
  ) then
    alter table treatments
      add constraint chk_treatment_scheduled_is_future_visit
      check (
        scheduled_appointment_id is null
        or scheduled_appointment_id <> appointment_id
      );
  end if;
end $$;

-- Partial: only booked treatments are ever looked up by this column.
create index if not exists idx_treatments_scheduled_appointment
  on treatments (scheduled_appointment_id)
  where scheduled_appointment_id is not null;
