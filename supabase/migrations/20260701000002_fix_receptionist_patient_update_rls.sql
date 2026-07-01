-- =============================================================================
-- Fix Receptionist and Dentist Patient Update RLS Policies
-- Migration: 20260701000002_fix_receptionist_patient_update_rls.sql
--
-- Problem:
--   Both the receptionist and dentist UPDATE policies on patients table from
--   migration 20260619000001 have incomplete WITH CHECK clauses. The USING
--   clauses correctly filter for active records (deleted_at IS NULL), but the
--   WITH CHECK clauses only verify clinic_id and role, not deleted_at.
--
--   In PostgreSQL RLS:
--     - USING clause: determines which existing rows can be selected/updated
--     - WITH CHECK clause: validates the updated row satisfies the policy
--
--   For UPDATE operations, both matter. The WITH CHECK must ensure that after
--   the update, the row still satisfies all the conditions that make it valid
--   for the user to see and modify.
--
--   Current policies:
--     Dentist:
--       USING:      clinic_id = ... AND role = ... AND deleted_at IS NULL
--       WITH CHECK: clinic_id = ... AND role = ...  (MISSING deleted_at IS NULL!)
--
--     Receptionist:
--       USING:      clinic_id = ... AND role = ... AND deleted_at IS NULL
--       WITH CHECK: clinic_id = ... AND role = ...  (MISSING deleted_at IS NULL!)
--
--   The missing deleted_at check in WITH CHECK means that even though we're
--   not modifying deleted_at, the policy doesn't explicitly verify the updated
--   row's deleted_at status. This causes RLS to reject the UPDATE because the
--   policy validation is incomplete.
--
-- Solution:
--   Recreate both policies with WITH CHECK clauses that mirror USING, ensuring
--   both clauses properly validate deleted_at IS NULL. This aligns with the
--   pattern used in the portal update policy added in
--   20260701000001_patient_portal_profile_update.sql.
--
-- =============================================================================

-- ── Fix Dentist Policy ────────────────────────────────────────────────────────
drop policy if exists "patients: dentist update" on patients;

create policy "patients: dentist update"
  on patients for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  );

comment on policy "patients: dentist update" on patients is
  'Allows dentists to update patient records. Both USING and WITH CHECK clauses '
  'enforce clinic scoping and active-record filtering (deleted_at IS NULL).';

-- ── Fix Receptionist Policy ───────────────────────────────────────────────────
drop policy if exists "patients: receptionist update" on patients;

create policy "patients: receptionist update"
  on patients for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

comment on policy "patients: receptionist update" on patients is
  'Allows receptionists to update patient demographic fields. Both USING and '
  'WITH CHECK clauses enforce clinic scoping and active-record filtering (deleted_at IS NULL). '
  'Clinical operations (delete) remain dentist-only.';

-- =============================================================================
-- Verification Query
-- =============================================================================
-- Run this as a dentist or receptionist user to verify the policy works:
--
-- UPDATE patients
-- SET phone = '+91 98765 43210'
-- WHERE id = '<some-patient-id-in-your-clinic>'
--   AND clinic_id = auth_clinic_id()
--   AND deleted_at IS NULL;
--
-- Expected: 1 row updated (if the patient exists and belongs to your clinic)
-- =============================================================================

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
