-- =============================================================================
-- Platform admin flag — dedicated admin/developer authorisation
-- Migration: 20260821000000_platform_admin_flag.sql
--
-- Why:
--   DentGrow now has three separate sign-in entry points (staff /login,
--   patient /patient/login, admin /admin/login). The admin entry point needs a
--   server-side authorisation fact to check — a secret URL is not a security
--   boundary, and "the admin is whoever owns the dev clinic" is not something
--   the server can verify.
--
--   The obvious alternative — adding 'admin' to the user_role enum — was
--   rejected. owner@dentgrow.local is the DENTIST of "My Dental Clinic" (the
--   development/demo clinic that the Business Brain dashboard is allow-listed
--   to, lib/feature-flags.ts). Changing its role would strip that clinic access
--   and every RLS policy expressed in terms of auth_role() would stop matching
--   it. Admin is therefore an ADDITIVE capability layered on top of the
--   existing role, exactly as CLAUDE.md §16 prescribes ("add columns rather
--   than changing existing ones").
--
-- What this migration does:
--   1. Adds profiles.is_admin (boolean, default false) — nothing changes for
--      any existing account except the one grant in step 4.
--   2. Adds auth_is_admin(), the SECURITY DEFINER companion to auth_role() /
--      auth_clinic_id(), so future RLS policies can express admin access
--      without a self-referencing subquery on profiles.
--   3. Re-creates the profiles UPDATE policy so is_admin is pinned to its
--      pre-update value. Without this, the WITH CHECK added by
--      20260727000000 would leave the new column unconstrained and any
--      authenticated user could grant themselves admin with a single
--      `update profiles set is_admin = true where id = auth.uid()`.
--   4. Grants admin to owner@dentgrow.local, matched by email in auth.users.
--      Idempotent, and a no-op in any environment where that account does not
--      exist (e.g. a fresh local database — see supabase/seed.sql, which seeds
--      the account locally and then relies on this grant).
--
-- What this migration deliberately does NOT do:
--   - It does not change any profile's `role` or `clinic_id`.
--   - It does not touch credentials.
--   - It does not weaken any existing policy.
-- =============================================================================

-- ── 1. The flag ───────────────────────────────────────────────────────────────

alter table profiles
  add column if not exists is_admin boolean not null default false;

comment on column profiles.is_admin is
  'Platform admin / developer capability. Additive to `role` — an admin keeps '
  'its normal role and clinic. Gates the /admin portal and its dedicated '
  '/admin/login entry point. Never writable from the client: the profiles '
  'UPDATE policy pins it to its pre-update value.';

-- Admins are a handful of rows at most; a partial index keeps the lookup cheap
-- without carrying an entry for every ordinary profile.
create index if not exists idx_profiles_is_admin
  on profiles (id)
  where is_admin;

-- ── 2. auth_is_admin() ────────────────────────────────────────────────────────
-- Same shape as auth_role() / auth_clinic_id() (20260619000000): stable +
-- security definer + pinned search_path. SECURITY DEFINER matters here for the
-- same reason it does there — it bypasses RLS, so a policy on `profiles` can
-- call it without tripping "infinite recursion detected in policy". STABLE
-- matters because it makes the function see the statement-start snapshot, which
-- is what turns `is_admin = auth_is_admin()` in a WITH CHECK into a genuine
-- no-change assertion instead of a tautology.

create or replace function auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

comment on function auth_is_admin() is
  'True when the calling user holds the platform admin capability. Companion to '
  'auth_role() / auth_clinic_id(); safe to call from inside a profiles policy.';

revoke all on function auth_is_admin() from public;
grant execute on function auth_is_admin() to authenticated, service_role;

-- ── 3. Pin is_admin in the profiles UPDATE policy ─────────────────────────────
-- Re-states 20260727000000's policy verbatim and adds one clause. Dropping and
-- recreating is the only way to amend a policy's WITH CHECK.

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
    -- Admin capability is immutable from the client.
    and is_admin = (select auth_is_admin())
  );

comment on policy "profiles: update own profile" on profiles is
  'Self-service profile update. WITH CHECK pins id, clinic_id, role and '
  'is_admin to their pre-update values (read via the SECURITY DEFINER helpers, '
  'which see the statement-start snapshot), so a client can edit only '
  'non-authorisation fields such as full_name and signature_url. Prevents role '
  'escalation, admin escalation and cross-tenant reassignment. Does not apply '
  'to service_role, which is exempt from RLS and is used by the portal '
  'account-linking flow.';

-- ── 4. Grant admin to the DentGrow owner account ──────────────────────────────
-- Matched by email so the grant is environment-independent (the account has a
-- different uuid locally than on the hosted project). A no-op where the account
-- or its profile does not exist.

update profiles p
   set is_admin = true,
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'owner@dentgrow.local'
   and p.is_admin is distinct from true;
