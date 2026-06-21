-- =============================================================================
-- DentGrow — Patient Self-Registration Support
-- Migration: 20260621000001_patient_self_registration.sql
--
-- Context:
--   The original portal onboarding flow blocked new patients who had no
--   pre-existing patient record. Self-registering users were told to "contact
--   the clinic" even though they should be able to register and book online.
--
-- Change summary:
--   1. Add patients.is_self_registered (boolean, default false).
--      Marks patient records that were auto-created during portal sign-up
--      (as opposed to records entered by clinic staff).
--      Staff can use this flag to identify patients who need demographic
--      enrichment (DOB, address, etc.).
--
--   2. Add patients.portal_registered_at (timestamptz, nullable).
--      Timestamp of when the patient first completed portal setup.
--      Useful for analytics: "new online patients this month".
--
--   3. Update the partial unique index on (clinic_id, phone) to remain correct
--      after self-registration inserts.
--      The existing index from schema_patches already covers this — no change
--      needed. Verified here.
--
-- Application-level changes (already applied to actions/portal-link.ts):
--   - linkPortalAccount() now supports two paths:
--       A. Phone matches existing record  → link user_id to it (unchanged).
--       B. No match and confirmNew=true   → create new patients row with
--          is_self_registered=true, then link.
--   - When no match is found and confirmNew is NOT set, the action returns a
--     {status: "not_found"} sentinel so the client can prompt for a name
--     before creating the record — prevents accidental duplicates.
--
-- RLS impact:
--   - Inserts on patients for self-registration go through the service-role
--     admin client (createAdminClient), which bypasses RLS.
--     No new RLS policies are required.
--   - Reads: auth_patient_id() still resolves correctly for self-registered
--     patients because the portal_links row is created atomically with the
--     patient row. Rollback removes both on failure.
--
-- Invariants preserved:
--   - patient_portal_links.user_id  UNIQUE (one account per patient record)
--   - patient_portal_links.patient_id UNIQUE (one account per patient record)
--   - patients (clinic_id, phone) partial unique WHERE deleted_at IS NULL
--     AND phone IS NOT NULL — race-condition guard in application code also
--     present.
-- =============================================================================

-- =============================================================================
-- 1. Add is_self_registered column
-- =============================================================================

alter table patients
  add column if not exists is_self_registered boolean not null default false;

comment on column patients.is_self_registered is
  'True when the patient record was auto-created during portal self-registration '
  '(linkPortalAccount with confirmNew=true). False for records created by staff. '
  'Use to identify patients who may need demographic enrichment.';

-- =============================================================================
-- 2. Add portal_registered_at column
-- =============================================================================

alter table patients
  add column if not exists portal_registered_at timestamptz;

comment on column patients.portal_registered_at is
  'Set when the patient first completes portal account setup. '
  'NULL for patients who have never used the portal.';

-- =============================================================================
-- 3. Index: fast lookup of self-registered patients per clinic
--    (used by staff dashboard "new online patients" view)
-- =============================================================================

create index if not exists idx_patients_self_registered
  on patients (clinic_id, portal_registered_at)
  where deleted_at is null
    and is_self_registered = true;

-- =============================================================================
-- 4. Verify the partial unique index on (clinic_id, phone) exists.
--    Created in 20260619000001_dentgrow_schema_patches.sql as
--    uq_patients_clinic_phone_active. This migration documents the dependency.
-- =============================================================================

-- No DDL needed — the index was created in schema_patches:
--   create unique index uq_patients_clinic_phone_active
--     on patients (clinic_id, phone)
--     where deleted_at is null and phone is not null;
--
-- This index ensures that a concurrent self-registration with the same phone
-- on the same clinic will fail with a unique violation (caught by the
-- application-level race-condition guard in _createAndLinkNewPatient).
