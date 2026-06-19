-- =============================================================================
-- DentGrow — Queue RLS Fix
-- Migration: 20260619000002_dentgrow_queue_rls_fix.sql
--
-- FIX: queue_entries had no patient-facing RLS policy.
--      Without one, authenticated portal users with a valid session could
--      query all queue entries for the clinic, leaking other patients'
--      waiting position and appointment metadata.
--
-- Solution:
--   Add a SELECT policy for the patient role that restricts reads to
--   only the queue entry linked to their own patient_id (via portal link).
--   Staff (dentist + receptionist) retain full clinic-scoped read access.
-- =============================================================================

-- ── Patient read policy: own queue entry only ─────────────────────────────────
-- Uses auth_patient_id() helper (defined in initial schema) to resolve
-- the calling user's patient_id via patient_portal_links.
-- Returns no rows if the user has no portal link.

create policy "queue_entries: patient read own entry"
  on queue_entries for select
  using (patient_id = auth_patient_id());

-- ── Staff read policies (explicit SELECT) ─────────────────────────────────────
-- The initial schema had no explicit SELECT policy on queue_entries for staff,
-- relying on default permissive behaviour. Make these explicit for clarity
-- and correctness.

create policy "queue_entries: dentist read clinic"
  on queue_entries for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

create policy "queue_entries: receptionist read clinic"
  on queue_entries for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

-- ── Staff write policies ──────────────────────────────────────────────────────
-- Check that existing write policies exist; add missing ones.

-- INSERT: receptionist and dentist can add queue entries
create policy "queue_entries: staff insert"
  on queue_entries for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() in ('dentist', 'receptionist')
  );

-- UPDATE: receptionist and dentist can update queue entries (advance, skip)
create policy "queue_entries: staff update"
  on queue_entries for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() in ('dentist', 'receptionist')
  );
