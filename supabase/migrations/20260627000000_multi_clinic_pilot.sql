-- =============================================================================
-- DentGrow — Multi-Clinic Pilot
-- Migration: 20260627000000_multi_clinic_pilot.sql
--
-- Purpose:
--   Enable the two-clinic pilot on the EXISTING single-tenant architecture.
--   No new databases, no new Supabase projects, no duplicated tables.
--   Every clinic's data stays isolated through the existing clinic_id +
--   RLS architecture (auth_clinic_id()).
--
-- What this migration does:
--   1. Adds clinics.dentist_name — the clinic's primary dentist display name.
--      Populated from data (never hardcoded in the application).
--   2. Seeds the two pilot clinics (idempotent — safe to re-run).
--   3. Seeds a clinic_settings row for each so AI prompts, scheduling, and
--      queue estimation have a source of truth per clinic.
--
-- Notes:
--   - "Clinic B" is a temporary name and will be renamed later. The app never
--     hardcodes either name — all UI reads from the clinics table.
--   - Fixed UUIDs are used so the seed is idempotent and so staff/patient
--     profiles can be assigned to a stable clinic_id.
--   - created_at is set explicitly so the login/signup dropdown can order
--     "Dr. Liying's Dental Care" before "Clinic B".
-- =============================================================================

-- 1. dentist_name column ------------------------------------------------------

alter table clinics
  add column if not exists dentist_name text;

comment on column clinics.dentist_name is
  'Primary dentist display name for the clinic (e.g. "Dr. Liying"). '
  'Shown in the dentist/receptionist dashboard dentist-name section. '
  'NULL/empty is valid (clinic has no named dentist yet). Never hardcoded in app code.';

-- 2. Seed clinics -------------------------------------------------------------

insert into clinics (id, name, dentist_name, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'Dr. Liying''s Dental Care', 'Dr. Liying', '2026-06-27 00:00:00+00'),
  ('22222222-2222-2222-2222-222222222222', 'Clinic B',                   null,         '2026-06-27 00:00:01+00')
on conflict (id) do update
  set name         = excluded.name,
      dentist_name = excluded.dentist_name;

-- 3. Seed clinic_settings (one-to-one with clinics) ---------------------------
-- clinic_name is required (NOT NULL). Keep it in sync with clinics.name.
-- clinic_hours / timezone use sensible defaults; dentists can edit later.

insert into clinic_settings (
  clinic_id,
  clinic_name,
  average_appointment_duration,
  timezone,
  clinic_hours
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Dr. Liying''s Dental Care',
    30,
    'Asia/Kolkata',
    '{
      "monday":    { "open": "09:00", "close": "18:00", "is_open": true },
      "tuesday":   { "open": "09:00", "close": "18:00", "is_open": true },
      "wednesday": { "open": "09:00", "close": "18:00", "is_open": true },
      "thursday":  { "open": "09:00", "close": "18:00", "is_open": true },
      "friday":    { "open": "09:00", "close": "18:00", "is_open": true },
      "saturday":  { "open": "10:00", "close": "14:00", "is_open": true },
      "sunday":    { "open": null,    "close": null,    "is_open": false }
    }'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Clinic B',
    30,
    'Asia/Kolkata',
    '{
      "monday":    { "open": "09:00", "close": "18:00", "is_open": true },
      "tuesday":   { "open": "09:00", "close": "18:00", "is_open": true },
      "wednesday": { "open": "09:00", "close": "18:00", "is_open": true },
      "thursday":  { "open": "09:00", "close": "18:00", "is_open": true },
      "friday":    { "open": "09:00", "close": "18:00", "is_open": true },
      "saturday":  { "open": "10:00", "close": "14:00", "is_open": true },
      "sunday":    { "open": null,    "close": null,    "is_open": false }
    }'::jsonb
  )
on conflict (clinic_id) do update
  set clinic_name = excluded.clinic_name;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
