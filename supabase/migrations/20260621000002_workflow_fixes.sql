-- =============================================================================
-- DentGrow — Workflow Bug Fixes
-- Migration: 20260621000002_workflow_fixes.sql
--
-- Fixes:
--   FIX-A  Receptionist access to follow_ups (SELECT + INSERT + UPDATE)
--   FIX-B  Patient appointment cancel — allow portal update to 'cancelled'
--          (already covered by existing "appointments: portal update own" policy
--           since the WITH CHECK does not restrict status values; documented here)
--   FIX-C  Patient appointments INSERT — handled via admin client in Server Action;
--          no RLS change needed (documented here for audit trail)
-- =============================================================================

-- =============================================================================
-- FIX-A  RECEPTIONIST FOLLOW_UP ACCESS
--
-- Problem:  The schema patches left receptionist with no access to follow_ups.
--           However the application layer (createFollowUp, updateFollowUp,
--           getFollowUpsForPatient, getAllFollowUps) permits receptionist access
--           on creation and read. Without RLS policies the DB rejects these
--           queries with "new row violates row-level security policy".
--
-- Solution:
--   Add SELECT, INSERT, UPDATE policies for receptionist on follow_ups.
--   Receptionist cannot complete or cancel follow-ups (those are dentist-only
--   in the application layer, enforced at action level not RLS level).
-- =============================================================================

-- Receptionist can view all active follow-ups in their clinic.
create policy "follow_ups: receptionist select"
  on follow_ups for select
  using (
    clinic_id  = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at  is null
  );

-- Receptionist can create follow-ups for patients in their clinic.
create policy "follow_ups: receptionist insert"
  on follow_ups for insert
  with check (
    clinic_id  = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

-- Receptionist can update follow-ups (change due_date, notes, type).
create policy "follow_ups: receptionist update"
  on follow_ups for update
  using  (
    clinic_id  = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at  is null
  )
  with check (
    clinic_id  = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

-- =============================================================================
-- FIX-B  PATIENT APPOINTMENT INSERT — RLS DOCUMENTATION
--
-- The "appointments: portal insert own" policy was dropped in FIX-2 of
-- 20260619000001_dentgrow_schema_patches.sql. Patient portal appointment
-- creation now goes through the Next.js Server Action (createAppointment),
-- which validates availability, checks conflicts, and then inserts using the
-- Supabase admin (service-role) client. No RLS INSERT policy is needed for
-- patients on the appointments table.
--
-- The existing "appointments: portal update own" policy handles patient
-- cancellation (UPDATE to status='cancelled' for scheduled appointments).
-- =============================================================================

-- =============================================================================
-- FIX-C  RECEPTIONIST PAYMENTS READ ACCESS — already exists
--
-- The "payments: receptionist insert", "payments: receptionist read", and
-- "payments: receptionist update" policies were created in the initial schema
-- migration (20260619000000_dentgrow_initial_schema.sql). No action needed here.
-- =============================================================================

-- =============================================================================
-- END OF WORKFLOW FIXES MIGRATION
-- =============================================================================
