-- =============================================================================
-- Baseline Role Grants for PostgREST Roles
-- Migration: 20260727000002_baseline_role_grants.sql
--
-- Problem this fixes:
--   The migration history creates 18 tables and 8 views, enables RLS on all of
--   them, and defines 79 policies — but it never issues a single table-level
--   GRANT. Until now that went unnoticed because the pilot database was built
--   by pasting SQL into the Supabase dashboard, where the project's ambient
--   default privileges hand DML to anon / authenticated / service_role as a
--   side effect of object creation.
--
--   Those defaults are environment state, not repository state. Provisioning a
--   database purely from this migration history produces:
--
--     select count(*) from information_schema.role_table_grants
--     where table_schema = 'public' and grantee = 'authenticated'
--       and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
--     -- 0
--
--   `authenticated` ends up holding only REFERENCES, TRIGGER and TRUNCATE, so
--   every application query fails with:
--
--     ERROR: permission denied for table profiles
--
--   The result is a database that looks correct — right tables, right policies,
--   RLS on everywhere — and in which the application cannot read or write a
--   single row. This was verified empirically against a clean `supabase db reset`.
--
-- Why this is safe, and why it is not a loosening of security:
--   In the Supabase model, table GRANTs are a coarse gate that says "this role
--   may address this relation at all"; Row Level Security is what decides which
--   rows it actually sees. RLS is enabled on all 18 tables here and every policy
--   predicate is rooted in auth.uid() / auth_clinic_id() / auth_patient_id().
--
--   Granting DML therefore restores the intended baseline without widening
--   access: `anon` has no auth.uid(), so it satisfies no policy and continues to
--   see zero rows. This migration adds no policy and changes no policy.
--
-- Scope note — functions are deliberately excluded:
--   Supabase's stock bootstrap also runs
--     alter default privileges ... grant execute on functions to anon, authenticated;
--   That is precisely how create_patient_appointment() ended up callable by every
--   logged-in user (see 20260727000001). Default privileges below therefore cover
--   TABLES and SEQUENCES only. Function EXECUTE must be granted explicitly, per
--   function, as a conscious decision.
--
-- Idempotency:
--   GRANT is naturally idempotent, so this is a no-op wherever the privileges
--   already exist — including the pilot database, where it can be marked applied
--   during migration repair without changing anything.
-- =============================================================================

-- ── Schema access ─────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

-- ── Existing tables and views ─────────────────────────────────────────────────
-- RLS is the row-level gate; these grants only permit the relation to be addressed.
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- ── Future objects ────────────────────────────────────────────────────────────
-- Ensures a table added by a later migration is reachable without every author
-- having to remember to write a GRANT. Applies to objects created by `postgres`,
-- which is the role the CLI runs migrations as.
--
-- FUNCTIONS ARE INTENTIONALLY OMITTED — see the scope note above.
alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;

-- ── Re-assert the function privilege posture ──────────────────────────────────
-- `grant ... on all tables` above cannot touch functions, but this migration is
-- the natural place to restate the invariant established in 20260727000001:
-- no client-facing role holds EXECUTE on the portal booking function.
revoke all on function create_patient_appointment(uuid, timestamptz, text)
  from public, anon, authenticated;

grant execute on function create_patient_appointment(uuid, timestamptz, text)
  to service_role;
