-- =============================================================================
-- Recording that an appointment was booked to fulfil a follow-up
-- Migration: 20260802000100_appointment_follow_up_origin.sql
--
-- The problem:
--   Creating a follow-up with a time auto-creates an appointment
--   (actions/follow-ups.ts). That appointment carries the right patient, and
--   nothing else — no trace of why it exists. On its detail page the clinic sees
--   a visit with no treatments and no payments, which reads as a fresh start
--   even when the patient owes thousands from the visit that prompted it. The
--   financial picture looks fragmented because the record genuinely is.
--
-- Why an existing column will not do:
--   `follow_ups.appointment_id` already exists but means the ORIGINATING
--   appointment — the visit that prompted the recall. Today it is reused to
--   point at the auto-created appointment, but only when there was no
--   originating one, so the same column means two different things depending on
--   how the follow-up was raised, and neither reading is recoverable from the
--   other.
--
--   Direction matters here. The follow-up points BACK at what caused it; this
--   column points FORWARD to the visit booked to satisfy it. Two relationships,
--   two columns.
--
-- Shape:
--   Nullable — almost every appointment is booked directly and has no follow-up
--   behind it. ON DELETE SET NULL so removing a follow-up never removes a real
--   appointment: the visit happened whatever became of the recall that prompted
--   it.
--
-- Backwards compatibility:
--   Additive and NULL for every existing row. Nothing reads it unless it is set,
--   so no existing appointment, payment or balance changes.
-- =============================================================================

alter table appointments
  add column if not exists follow_up_id uuid
  references follow_ups (id) on delete set null;

comment on column appointments.follow_up_id is
  'The follow-up this appointment was booked to fulfil, when it was created '
  'from one. NULL for directly-booked appointments. The mirror of '
  'follow_ups.appointment_id, which points the other way at the visit that '
  'PROMPTED the follow-up.';

-- Find the appointment that fulfils a given follow-up. Partial, because the
-- overwhelming majority of appointments are booked directly and indexing their
-- NULLs would cost writes for rows the query never wants.
create index if not exists idx_appointments_follow_up
  on appointments (follow_up_id)
  where follow_up_id is not null;
