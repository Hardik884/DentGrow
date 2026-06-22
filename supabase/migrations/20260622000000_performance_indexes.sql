-- =============================================================================
-- DentGrow — Performance Indexes & Utility Functions
-- Migration: 20260622000000_performance_indexes.sql
--
-- Adds:
--   1. bulk_decrement_queue_positions() — replaces the per-row skip loop
--   2. idx_queue_clinic_date_position — speeds up skip/advance position queries
--   3. idx_follow_ups_clinic_status_due — speeds up overdue follow-up detection
--   4. idx_appointments_clinic_scheduled_at — covers the "today" dashboard query
-- =============================================================================

-- =============================================================================
-- 1. BULK QUEUE POSITION DECREMENT
--
-- Called by skipPatient() in queue.ts to shift all waiting entries ahead of
-- the skipped patient down by one position in a single UPDATE instead of
-- a per-row serial loop.
--
-- p_ids: array of queue_entry UUIDs to decrement
-- =============================================================================

create or replace function bulk_decrement_queue_positions(p_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update queue_entries
  set    position = position - 1
  where  id = any(p_ids);
$$;

comment on function bulk_decrement_queue_positions is
  'Decrements position by 1 for the given queue_entry rows in a single UPDATE. '
  'Used by skipPatient() to avoid an N+1 serial loop when reordering the queue.';

-- Grant to authenticated users so the server action can call it.
grant execute on function bulk_decrement_queue_positions(uuid[])
  to authenticated;

-- =============================================================================
-- 2. QUEUE POSITION INDEX
--
-- The skip and advance operations filter on:
--   clinic_id + queue_date + status + position
-- The existing idx_queue_clinic_date_status index covers the first three
-- columns. Adding a covering index that also includes position avoids a
-- heap-fetch for the MAX(position) and GT/LT position filter queries.
-- =============================================================================

create index if not exists idx_queue_clinic_date_status_position
  on queue_entries (clinic_id, queue_date, status, position);

comment on index idx_queue_clinic_date_status_position is
  'Covers queue position queries: advance, skip, MAX(position) lookups.';

-- =============================================================================
-- 3. FOLLOW-UPS OVERDUE INDEX
--
-- getOverdueFollowUps(), getFollowUpStats(), and getAllFollowUps(overdue)
-- all filter: clinic_id + status = pending + due_date < today
-- The existing idx_follow_ups_clinic_due_status covers this, but it is a
-- partial index predicate on status = pending only. This composite index
-- adds status as a regular column for the multi-status list queries.
-- =============================================================================

create index if not exists idx_follow_ups_clinic_status_due
  on follow_ups (clinic_id, status, due_date)
  where deleted_at is null;

comment on index idx_follow_ups_clinic_status_due is
  'Covers follow-up list queries filtered by clinic + status + due_date.';

-- =============================================================================
-- 4. APPOINTMENTS TODAY INDEX
--
-- The dashboard "today" query filters:
--   clinic_id + deleted_at IS NULL + scheduled_at BETWEEN startUtc AND endUtc
--
-- The existing idx_appointments_clinic_scheduled covers (clinic_id, scheduled_at)
-- with a partial predicate WHERE deleted_at IS NULL. This is already correct.
-- Verifying it exists; no new index needed.
--
-- idx_appointments_clinic_scheduled already exists from initial schema.
-- =============================================================================

-- =============================================================================
-- 5. PAYMENTS TODAY INDEX
--
-- getPaymentsToday() filters: clinic_id + payment_date = today + deleted_at IS NULL
-- The existing idx_payments_clinic_date covers (clinic_id, payment_date).
-- No new index needed.
-- =============================================================================

-- =============================================================================
-- 6. PROFILES LOOKUP INDEX
--
-- Every resolveSession() call does:
--   SELECT id, clinic_id, role FROM profiles WHERE id = $user_id
-- The profiles table PK (id) already covers this lookup via the primary key
-- index. No new index needed.
-- =============================================================================
