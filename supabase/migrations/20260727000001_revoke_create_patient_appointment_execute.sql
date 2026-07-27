-- =============================================================================
-- Revoke Client EXECUTE on create_patient_appointment()
-- Migration: 20260727000001_revoke_create_patient_appointment_execute.sql
--
-- Problem:
--   create_patient_appointment(uuid, timestamptz, text) was added in
--   20260619000001_dentgrow_schema_patches.sql:136 as the SECURITY DEFINER
--   booking path for the patient portal, and granted to `authenticated`
--   (:235) so a Server Action could call it.
--
--   The application then moved away from it. 20260621000002 FIX-B documents
--   the pivot, and actions/appointments.ts:342 now inserts directly using an
--   admin client for portal users. A repo-wide search confirms there is no
--   `.rpc("create_patient_appointment")` call site anywhere — the only
--   remaining references are a comment (actions/appointments.ts:339) and a
--   type declaration (types/database.types.ts:779).
--
--   The GRANT, however, was never withdrawn. Because Supabase exposes every
--   public-schema function as a PostgREST RPC endpoint, any logged-in portal
--   user can still call it directly from the browser:
--
--     POST /rest/v1/rpc/create_patient_appointment
--
--   The function runs SECURITY DEFINER (it bypasses RLS by design) and
--   validates only what was known in June 2026: portal ownership,
--   availability_rules, and slot conflicts. Everything added since is invisible
--   to it — in particular it never consults `unavailable_dates` or
--   `consultancy_schedules`, both introduced in 20260706000000. A patient can
--   therefore book onto a clinic holiday or into an external-consultation block
--   that the current Server Action path (lib/scheduling/slots.ts) correctly
--   refuses. It is a live, unvalidated write path around the application's
--   own booking rules.
--
-- Solution — revoke EXECUTE, retain the function:
--   The function is deliberately preserved in full (definition, business logic
--   and comment untouched) for future reuse — a mobile client, an external
--   integration, or a later portal revision may want a database-side booking
--   primitive. Removing the privilege, not the function, is the least
--   destructive change that closes the hole: nothing is dropped, and restoring
--   it later is a one-line GRANT once its validation has been brought up to
--   date.
--
--   IMPORTANT — the PUBLIC default grant:
--     Revoking from `authenticated` alone would NOT close this hole.
--     PostgreSQL grants EXECUTE on every newly created function to PUBLIC
--     automatically, and `authenticated` is a member of PUBLIC, so the
--     implicit grant would keep the RPC endpoint fully callable. The revoke
--     from PUBLIC below is the load-bearing statement; the explicit revokes
--     from anon/authenticated remove the redundant grant recorded in
--     20260619000001:235.
--
--   service_role retains EXECUTE. It is a trusted, server-only credential
--   (SUPABASE_SERVICE_ROLE_KEY, never exposed to the browser per CLAUDE.md
--   §13.9), so this keeps the function immediately usable from a future
--   server-side integration while removing it entirely from the client-
--   reachable attack surface. The grant is issued after the PUBLIC revoke
--   because service_role may have been relying on the PUBLIC grant.
--
-- Scope:
--   No table, policy, column or function body is modified. This migration
--   changes privileges only.
--
-- Application impact: none.
--   There is no call site to break. actions/appointments.ts continues to use
--   its existing direct-insert path, which validates against availability,
--   unavailable_dates and consultancy_schedules.
--
-- To re-enable for a future client-facing integration:
--   grant execute on function create_patient_appointment(uuid, timestamptz, text)
--     to authenticated;
--   -- but first extend the function to honour unavailable_dates and
--   -- consultancy_schedules, or it will reintroduce this bypass.
-- =============================================================================

-- Load-bearing: removes the implicit grant PostgreSQL created with the function.
revoke all on function create_patient_appointment(uuid, timestamptz, text)
  from public;

-- Removes the explicit grant from 20260619000001:235 and any anon exposure.
revoke all on function create_patient_appointment(uuid, timestamptz, text)
  from anon;

revoke all on function create_patient_appointment(uuid, timestamptz, text)
  from authenticated;

-- Retained for future server-side reuse. service_role is never client-exposed.
grant execute on function create_patient_appointment(uuid, timestamptz, text)
  to service_role;

comment on function create_patient_appointment is
  'SECURITY DEFINER booking function for patient portal. '
  'Validates portal ownership, availability rules, and slot conflicts before inserting. '
  'RETAINED FOR FUTURE USE — not called by the application as of 2026-07-27; '
  'actions/appointments.ts books directly. EXECUTE revoked from public/anon/authenticated '
  'in 20260727000001 because the PostgREST RPC endpoint allowed portal users to bypass '
  'the Server Action booking path. Its validation predates unavailable_dates and '
  'consultancy_schedules (20260706000000) and must be updated to honour both before '
  'EXECUTE is granted to any client-facing role again. service_role retains EXECUTE.';
