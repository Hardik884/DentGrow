-- =============================================================================
-- DentGrow — Consultancy refinements
-- Migration: 20260707000000_consultancy_refinements.sql
--
-- Changes:
--   1. consultancy_income.external_clinic / description become optional
--      (nullable) — the record form only requires date + amount.
--   2. consultancy_schedules moves from a recurring weekly block (day_of_week)
--      to a single specific date. A block now removes slots only for the exact
--      date + time range entered, not every matching weekday.
-- =============================================================================

-- 1. Optional clinic name / description on consultancy income --------------------

alter table consultancy_income
  alter column external_clinic drop not null,
  alter column description     drop not null;

-- 2. Consultancy schedules: weekly day_of_week → specific date -------------------

-- Existing rows used weekly recurrence semantics that no longer apply.
delete from consultancy_schedules;

drop index if exists consultancy_schedules_clinic_dow_idx;

alter table consultancy_schedules
  drop column if exists day_of_week,
  add column if not exists date date not null;

create index if not exists consultancy_schedules_clinic_date_idx
  on consultancy_schedules (clinic_id, date)
  where is_active;

comment on table consultancy_schedules is
  'Specific-date time ranges when the dentist consults externally. Overlapping '
  'appointment slots on that exact date are removed for all booking channels.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
