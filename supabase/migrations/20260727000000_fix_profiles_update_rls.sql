-- =============================================================================
-- Fix profiles UPDATE RLS Policy — Privilege Escalation / Tenant Escape
-- Migration: 20260727000000_fix_profiles_update_rls.sql
--
-- Problem:
--   The policy created in 20260619000000_dentgrow_initial_schema.sql:687 is:
--
--     create policy "profiles: update own profile"
--       on profiles for update
--       using (id = auth.uid());          -- no WITH CHECK
--
--   In PostgreSQL, an UPDATE policy with a USING clause and no WITH CHECK
--   re-uses USING to validate the NEW row. Here USING only asserts
--   `id = auth.uid()` — a column the attacker never changes. Every other
--   column is therefore unconstrained, so any authenticated user holding the
--   public anon key can run:
--
--     update profiles
--        set role = 'dentist', clinic_id = '<another clinic>'
--      where id = auth.uid();
--
--   This is not merely a row-scoping bug. profiles is the root of the entire
--   authorisation model: auth_clinic_id() and auth_role() both read from it,
--   and every other table's RLS policy is expressed in terms of those two
--   functions. A single successful UPDATE therefore grants the caller the
--   dentist role inside an arbitrary tenant, defeating both role separation
--   and clinic isolation everywhere at once.
--
--   CLAUDE.md §13.10 designates RLS as the security guarantee (application
--   role checks are explicitly "a UX convenience"), so nothing upstream is
--   currently mitigating this.
--
-- Solution:
--   Recreate the policy with an explicit WITH CHECK that pins the three
--   identity-bearing columns to their pre-update values:
--
--     id         — the row must still belong to the caller
--     clinic_id  — tenant ownership cannot be transferred
--     role       — privilege level cannot be changed
--
--   The pre-update values are read via auth_clinic_id() and auth_role()
--   (20260619000000:625-640). Both are `stable security definer`, which gives
--   two properties this fix depends on:
--
--     1. SECURITY DEFINER runs as the table owner, so the lookup bypasses RLS.
--        A self-referencing subquery against profiles inside a profiles policy
--        would otherwise risk "infinite recursion detected in policy".
--     2. STABLE means the function is evaluated against the snapshot taken at
--        statement start, so it returns the row as it was BEFORE this UPDATE.
--        That is what makes `role = auth_role()` a genuine no-change assertion
--        rather than a tautology.
--
--   Columns deliberately left writable: full_name, signature_url, updated_at.
--   These carry no authorisation meaning and are the fields the application
--   actually edits (actions/signature.ts:128,168).
--
-- Why RLS and not a BEFORE UPDATE trigger:
--   A trigger fires for every role, including service_role. Portal account
--   setup (actions/portal-link.ts:313,419) legitimately upserts profiles with
--   role='patient' through the service-role admin client, and a trigger would
--   break that flow. RLS is not applied to service_role, so this fix constrains
--   exactly the untrusted path (the browser's anon key) and leaves trusted
--   server-side writes untouched — which is the correct boundary.
--
-- Note on INSERT:
--   profiles has no INSERT policy for any role, so RLS default-deny already
--   prevents a user from escalating by inserting a fresh profile row. No
--   INSERT policy is added here; doing so would widen the surface.
--
-- Behaviour preserved:
--   Legitimate self-service updates continue to work unchanged. Verified
--   against the only RLS-bound profile write in the codebase:
--     actions/signature.ts:128  update({ signature_url, updated_at })
--     actions/signature.ts:168  update({ signature_url: null, updated_at })
--   Both leave role and clinic_id untouched, so both satisfy WITH CHECK.
-- =============================================================================

drop policy if exists "profiles: update own profile" on profiles;

create policy "profiles: update own profile"
  on profiles for update
  to authenticated
  using (
    id = (select auth.uid())
  )
  with check (
    -- The row must still be the caller's own profile.
    id = (select auth.uid())
    -- Tenant ownership is immutable from the client.
    and clinic_id = (select auth_clinic_id())
    -- Privilege level is immutable from the client.
    and role = (select auth_role())
  );

comment on policy "profiles: update own profile" on profiles is
  'Self-service profile update. WITH CHECK pins id, clinic_id and role to their '
  'pre-update values (read via the SECURITY DEFINER helpers, which see the '
  'statement-start snapshot), so a client can edit only non-authorisation '
  'fields such as full_name and signature_url. Prevents role escalation and '
  'cross-tenant reassignment. Does not apply to service_role, which is exempt '
  'from RLS and is used by the portal account-linking flow.';
