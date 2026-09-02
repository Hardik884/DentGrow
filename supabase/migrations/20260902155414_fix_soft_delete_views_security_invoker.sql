-- =============================================================================
-- SECURITY: the soft-delete views must evaluate RLS as the CALLER
-- Migration: 20260902155414_fix_soft_delete_views_security_invoker.sql
--
-- WHAT WAS WRONG
--   20260619000000_dentgrow_initial_schema.sql:466-479 created six convenience
--   views over the soft-deletable tables:
--
--     active_patients · active_appointments · active_treatments
--     active_payments · active_follow_ups   · overdue_follow_ups
--
--   None of them was created `with (security_invoker = true)`. A view without
--   that option executes with the privileges of its OWNER, not its caller. The
--   owner here is `postgres`, which also owns every underlying table — and a
--   table owner is exempt from that table's Row Level Security unless the table
--   carries FORCE ROW LEVEL SECURITY, which none of them does.
--
--   20260727000002_baseline_role_grants.sql then (correctly, for tables) issued
--
--     grant select, insert, update, delete on all tables in schema public
--       to anon, authenticated, service_role;
--
--   "ALL TABLES" includes views, and PostgREST publishes every relation in the
--   `public` schema as a REST endpoint. Those three facts compose: querying one
--   of these views ran the underlying scan as the table owner, so none of the
--   137 RLS policies applied. The views stood entirely outside the security
--   model the rest of the schema is built on — defeating tenant isolation, role
--   separation and patient-record scoping simultaneously.
--
--   It was not read-only. All five are simple single-table views, so PostgreSQL
--   makes them auto-updatable (`information_schema.views.is_updatable = YES`),
--   and the grant above included UPDATE and DELETE. That DML likewise ran as the
--   owner.
--
-- WHY IT SURVIVED FOR SO LONG
--   `npm run db:lint` runs `supabase db lint`, which is plpgsql_check — a
--   FUNCTION BODY linter. It reports "No schema errors found" here and always
--   would; it cannot see this class of defect. The rule that catches it is
--   Supabase's database linter 0010_security_definer_view, which runs in the
--   hosted dashboard's Security Advisor — consider wiring
--   `supabase db advisors --linked --type security` into CI.
--
--   The concept was understood: 20260803000000_clinic_aware_overdue_view.sql
--   added `security_invoker = true` to overdue_follow_ups. But its own comment
--   reads "matching active_follow_ups and patient_treatments elsewhere in this
--   schema" — and that was mistaken for active_follow_ups, which never had it.
--   The belief that the fleet was already correct is what stopped anyone
--   looking at the other five.
--
--   No application code has ever selected from these views (verified across
--   actions/, lib/, app/, components/, business-brain/ and hooks/), so no test
--   and no user journey ever touched them.
--
-- THE FIX
--   ALTER VIEW ... SET (security_invoker = true) on all five. The view
--   DEFINITIONS are deliberately left untouched — this changes only whose
--   privileges the underlying scan runs with. Each view now evaluates the same
--   RLS policies as the base table it wraps, for the actual caller, which is
--   what the schema always intended.
--
--   The grants from 20260727000002 are intentionally left in place. With
--   security_invoker set, they mean exactly what they mean on the base tables:
--   permission to address the relation, with RLS deciding which rows.
--
--   Guarded by actions/__tests__/view-security-invoker.spec.ts, which asserts
--   the BEHAVIOUR (anon reads nothing; each view agrees with its base table per
--   caller; no cross-tenant or cross-role leak) rather than the catalog option.
--   ADD ANY NEW VIEW TO THAT SPEC'S LIST.
--
-- WHY NOT DROP THEM
--   Dropping was the alternative, since nothing reads them. Kept because
--   CLAUDE.md §13.14 explicitly names these views as the preferred way to
--   enforce the `deleted_at is null` rule, and adopting them is a live
--   architectural intention. A view that is safe is worth more than a view that
--   is gone. Removing them remains a separate, reversible decision.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It does not add FORCE ROW LEVEL SECURITY to the base tables. That is real
--   defence-in-depth against this whole class of defect and it is recommended —
--   but it also subjects the table OWNER to RLS, which affects migration-time
--   DML and needs its own review. It belongs in its own migration.
--
-- IDEMPOTENT
--   ALTER VIEW ... SET is idempotent, so re-running is a no-op. Guarded with
--   `if exists` so a database that has dropped a view instead does not fail.
-- =============================================================================

alter view if exists active_patients      set (security_invoker = true);
alter view if exists active_appointments  set (security_invoker = true);
alter view if exists active_treatments    set (security_invoker = true);
alter view if exists active_payments      set (security_invoker = true);
alter view if exists active_follow_ups    set (security_invoker = true);

-- Re-state the intent on each view so the reason is visible from psql \d+ and
-- from the generated types, not only in this file's history.

comment on view active_patients is
  'Patients excluding soft-deleted records. security_invoker = true: RLS on '
  '`patients` is evaluated as the CALLER. Never remove that option — without '
  'it this view runs as its owner and bypasses RLS entirely.';

comment on view active_appointments is
  'Appointments excluding soft-deleted records. security_invoker = true: RLS on '
  '`appointments` is evaluated as the CALLER. Never remove that option.';

comment on view active_treatments is
  'Treatments excluding soft-deleted records. security_invoker = true: RLS on '
  '`treatments` is evaluated as the CALLER. Never remove that option.';

comment on view active_payments is
  'Payments excluding soft-deleted records. security_invoker = true: RLS on '
  '`payments` is evaluated as the CALLER. Never remove that option.';

comment on view active_follow_ups is
  'Follow-ups excluding soft-deleted records. security_invoker = true: RLS on '
  '`follow_ups` is evaluated as the CALLER. Never remove that option.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
