-- =============================================================================
-- Clinic chair count
-- Migration: 20260730000000_clinic_chair_count.sql
--
-- Problem:
--   Capacity is measured as if every clinic has exactly one chair. A practice
--   with three chairs can genuinely deliver three appointments in the same hour,
--   but nothing in the schema records that, so:
--
--     - chair utilization reads roughly 3x too high and pins at its 100% cap,
--       which makes `near_full_capacity` fire on an ordinary day
--     - available capacity reads far too low, so `low_chair_utilization` and
--       `pipeline_stalled` see no free capacity where plenty exists
--     - `queue.maximumQueueLength` cannot be sized per clinic at all, because
--       the honest denominator is how many patients can be seen at once
--
-- Solution:
--   One integer on clinic_settings. Additive, defaulted to 1, so every existing
--   clinic keeps exactly today's behaviour until someone sets it.
--
--   NOT NULL with a default rather than nullable: "how many chairs" always has
--   an answer, and a NULL would force every reader to invent a fallback.
--
--   The CHECK matters more than it looks. A chair count of 0 would make open
--   capacity zero, and utilization is booked/open — a divide by zero that the
--   metrics engine would report as 0% for a clinic that is actually working.
--
-- Deliberately on clinic_settings, not clinics:
--   clinics is identity (name, contact). clinic_settings is operational
--   configuration, which is what this is, and it already holds
--   average_appointment_duration and clinic_hours.
--
-- Future note:
--   Per-chair scheduling (which chair an appointment occupies) would need a
--   separate operatories table and a column on appointments. This migration
--   deliberately stops short of that: a count is enough to measure capacity
--   correctly, and modelling individual chairs is only needed to assign them.
-- =============================================================================

alter table clinic_settings
  add column if not exists chair_count integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'clinic_settings'::regclass
      and conname  = 'chk_clinic_settings_chair_count_positive'
  ) then
    alter table clinic_settings
      add constraint chk_clinic_settings_chair_count_positive
      check (chair_count >= 1);
  end if;
end $$;

comment on column clinic_settings.chair_count is
  'Number of treatment chairs that can be occupied simultaneously. Multiplies '
  'the clinic''s open time into total treatable capacity. Defaults to 1; must be '
  'at least 1, since 0 would make capacity zero and utilization a divide by zero.';
