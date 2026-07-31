-- =============================================================================
-- End of service on the queue entry
-- Migration: 20260801000000_queue_service_end.sql
--
-- What this makes answerable:
--   "Are we running late because appointments overrun, or because everyone
--   arrives at once?" — two of the most common complaints in a clinic, with
--   opposite responses, and currently indistinguishable.
--
--   queue_entries already records when a patient ARRIVED (checked_in_at) and
--   when they were CALLED IN (called_at). Nothing records when they were
--   finished with, so actual appointment duration cannot be measured at all —
--   only the duration someone typed in when booking.
--
--   With this column, actual = completed_at - called_at, and the Diagnosis
--   Engine's `service_time_distribution` discriminator stops being permanently
--   unanswerable.
--
-- Nullable, deliberately:
--   NULL means "not recorded", which is a real and permanent state for every
--   entry that already exists and for any clinic that closes its day without
--   advancing the queue. There is no honest backfill — inventing an end time
--   from updated_at would fabricate the exact quantity being measured, and the
--   measurement is worthless if it cannot be trusted. Old rows stay unknown, and
--   the engine already treats unknown as unknown rather than as zero.
--
-- Why here and not on appointments:
--   appointments.updated_at moves whenever anything about the row is edited, so
--   a note added a week later would silently redate the appointment's end. This
--   column is written once, when the queue entry is closed, and never touched
--   again.
--
--   The cost is that an appointment never checked into the queue has no end
--   time. That is the same limitation arrival timing already carries, it is
--   visible rather than hidden, and a clinic that does not use the queue has no
--   arrival data to compare against anyway.
-- =============================================================================

alter table queue_entries
  add column if not exists completed_at timestamptz;

comment on column queue_entries.completed_at is
  'When the patient was finished with, set once as the queue entry is closed. '
  'With called_at this gives actual appointment duration, which the scheduled '
  'duration_minutes cannot. NULL means not recorded — never backfilled, since a '
  'guessed end time would fabricate the measurement it exists to provide.';

-- Consistency guard: a service cannot end before it began. Written by a server
-- action rather than a user, so this catches a code defect, not bad input.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'queue_entries'::regclass
      and conname  = 'chk_queue_completed_after_called'
  ) then
    alter table queue_entries
      add constraint chk_queue_completed_after_called
      check (completed_at is null or called_at is null or completed_at >= called_at);
  end if;
end $$;
