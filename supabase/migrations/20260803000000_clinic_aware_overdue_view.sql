-- =============================================================================
-- Clinic-timezone-aware overdue_follow_ups
-- Migration: 20260803000000_clinic_aware_overdue_view.sql
--
-- The problem:
--   `overdue_follow_ups` compared due_date against Postgres's `current_date`,
--   which resolves in the DATABASE SESSION's timezone — not the clinic's. The
--   application layer already knows better: actions/follow-ups.ts resolves
--   "today" per clinic via clinic_settings.timezone for its own overdue
--   queries (todayForClinic / getTodayInTimezone), so this view was quietly
--   disagreeing with the very same file's other overdue logic about exactly
--   when a day rolls over — for any clinic whose local date briefly runs ahead
--   of or behind the session's default.
--
-- The fix:
--   Join clinic_settings and compare against "today" expressed in THAT
--   clinic's own timezone, falling back to Asia/Kolkata for a clinic with no
--   configured timezone (matching every other fallback in this codebase).
--
-- Not a behaviour change for the reported bug:
--   This does not touch WHICH follow-ups are pending vs completed — that is
--   fixed by allowing status to be set at creation (application layer, see
--   CreateFollowUpSchema.status). This migration only makes the DAY BOUNDARY
--   itself consistent with the rest of the app, closing a narrow, separate
--   timezone edge case the same review surfaced.
--
-- Also adds security_invoker = true, matching active_follow_ups and
-- patient_treatments elsewhere in this schema. The view previously ran with
-- the DEFINER's privileges rather than the caller's, silently bypassing RLS on
-- follow_ups for anyone who queried it directly. Currently unused by the
-- application (no app code selects from this view today), so this closes the
-- gap with no behavioural effect on anything running now.
-- =============================================================================

create or replace view overdue_follow_ups
with (security_invoker = true) as
  select f.*
  from   follow_ups f
  join   clinic_settings cs on cs.clinic_id = f.clinic_id
  where  f.deleted_at is null
    and  f.status     = 'pending'
    and  f.due_date   < (now() at time zone coalesce(cs.timezone, 'Asia/Kolkata'))::date;

comment on view overdue_follow_ups is
  'Pending follow-ups past their due date, evaluated in each clinic''s own '
  'timezone (clinic_settings.timezone) rather than the database session''s.';
