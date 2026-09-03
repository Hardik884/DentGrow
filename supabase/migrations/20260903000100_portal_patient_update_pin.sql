-- =============================================================================
-- Fix the patient-portal UPDATE policy on `patients`
-- Migration: 20260903000100_portal_patient_update_pin.sql
--
-- WHAT WAS WRONG
--   20260701000001_patient_portal_profile_update.sql created:
--
--     create policy "patients: portal update own profile"
--       on patients for update
--       using      (id = auth_patient_id() and deleted_at is null)
--       with check (id = auth_patient_id() and deleted_at is null);
--
--   Its own comment says clinical and system fields "must remain immutable
--   from the portal" and that the policy "acts as a defense-in-depth guard."
--   It does not. `id = auth_patient_id()` is a column the caller never changes,
--   so the WITH CHECK asserts nothing about the rest of the row. Every other
--   column is unconstrained.
--
--   Two consequences, and the first is the serious one:
--
--   1. CROSS-TENANT MOVE. auth_patient_id() resolves through
--      patient_portal_links, which carries no clinic_id — so it keeps returning
--      the same patient_id no matter what clinic_id says. A portal account
--      holding nothing but the public anon key could therefore run
--      `update patients set clinic_id = '<some other clinic>' where id = <self>`
--      and move their own record into another tenant. Every policy on
--      appointments, treatments, payments and follow-ups is expressed in terms
--      of the patient's clinic, so the record's whole security context follows
--      it across.
--
--   2. CLINICAL FIELD EDITS. name, date_of_birth, gender and the free-text
--      clinical `notes` were all writable from the portal, as were the derived
--      counters (total_visits, last_visit) and the soft-delete marker. A
--      patient could rewrite the clinician's notes on their own chart, which is
--      a clinical-record integrity failure, not a privacy one.
--
--   The Server Action was never the problem: updatePortalProfile
--   (actions/portal-link.ts) sends exactly four fields. But CLAUDE.md §13.10 is
--   explicit that application checks are a UX convenience and RLS is the
--   guarantee, and this policy was not providing one.
--
-- THE FIX
--   Pin every column the portal has no business changing, the same way
--   20260727000000 pinned id/clinic_id/role on `profiles`.
--
--   WITH CHECK cannot see the OLD row, so the pre-update values are read back
--   through a `stable security definer` helper. Both properties are load-bearing
--   and are the same ones that migration relied on:
--
--     SECURITY DEFINER — the lookup runs as the table owner, so reading
--       `patients` from inside a `patients` policy does not recurse through RLS.
--     STABLE — the function is evaluated against the snapshot taken at
--       statement start, so it returns the row as it was BEFORE this UPDATE.
--       That is what makes `name = <old name>` a genuine no-change assertion
--       rather than a tautology comparing the new row to itself.
--
--   The comparison is done as a single jsonb object rather than a dozen
--   `col = old.col` clauses. That is not a stylistic choice: with individual
--   comparisons, a NULL on either side yields NULL and the whole WITH CHECK
--   collapses to NULL, which RLS treats as a failure — so `address = null`
--   would block a legitimate edit. `jsonb_build_object` renders NULL as a JSON
--   null and `=` on jsonb compares it correctly.
--
-- WHAT REMAINS EDITABLE
--   phone, address, emergency_contact_name, emergency_contact_phone,
--   updated_at — exactly the set updatePortalProfile writes today, and exactly
--   the set the original migration said it intended to allow.
--
-- SCOPE
--   `to authenticated` only. service_role is exempt from RLS, so the portal
--   account-linking flow and the cascade in softDeletePatient (both of which
--   legitimately write pinned columns through the admin client) are untouched.
-- =============================================================================

-- =============================================================================
-- 1. THE PRE-UPDATE SNAPSHOT
-- =============================================================================

create or replace function auth_patient_pinned_fields()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'clinic_id',          p.clinic_id,
    'name',               p.name,
    'date_of_birth',      p.date_of_birth,
    'gender',             p.gender,
    'notes',              p.notes,
    'total_visits',       p.total_visits,
    'last_visit',         p.last_visit,
    'deleted_at',         p.deleted_at,
    'payment_plan_until', p.payment_plan_until
  )
  from patients p
  where p.id = auth_patient_id();
$$;

comment on function auth_patient_pinned_fields() is
  'The columns of the calling portal user''s own patient row that the portal may '
  'NOT change, as they stood at statement start. STABLE + SECURITY DEFINER so a '
  'patients policy can read patients without recursing through RLS and still '
  'sees the pre-UPDATE values. Used only by the "patients: portal update own '
  'profile" WITH CHECK.';

-- The helper reads a patient row as the owner, so it must not be callable
-- directly. `anon` cannot resolve auth_patient_id() to anything, but revoking
-- is cheaper than reasoning about that every time the auth model changes.
revoke all on function auth_patient_pinned_fields() from public;
revoke all on function auth_patient_pinned_fields() from anon;

-- =============================================================================
-- 2. THE POLICY
-- =============================================================================

drop policy if exists "patients: portal update own profile" on patients;

create policy "patients: portal update own profile"
  on patients for update
  to authenticated
  using (
    id = (select auth_patient_id())
    and deleted_at is null
  )
  with check (
    id = (select auth_patient_id())
    and deleted_at is null
    -- Every column not in the editable set must be byte-identical to the value
    -- it had when this statement began.
    and jsonb_build_object(
      'clinic_id',          clinic_id,
      'name',               name,
      'date_of_birth',      date_of_birth,
      'gender',             gender,
      'notes',              notes,
      'total_visits',       total_visits,
      'last_visit',         last_visit,
      'deleted_at',         deleted_at,
      'payment_plan_until', payment_plan_until
    ) = (select auth_patient_pinned_fields())
  );

comment on policy "patients: portal update own profile" on patients is
  'Portal self-service edit of contact details ONLY: phone, address and the two '
  'emergency-contact fields. WITH CHECK pins clinic_id (so a patient cannot move '
  'their record into another clinic), the clinical fields name/date_of_birth/'
  'gender/notes, the derived counters, deleted_at and payment_plan_until to '
  'their pre-update values. Applies to authenticated sessions only; service_role '
  'is exempt from RLS and is what the portal-linking and cascade flows use.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
