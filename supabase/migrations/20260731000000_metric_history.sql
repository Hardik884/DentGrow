-- =============================================================================
-- Metric history
-- Migration: 20260731000000_metric_history.sql
--
-- Why:
--   The Business Brain recomputes every history day from scratch on each run.
--   A dashboard load asks for 7 days of history, and each day is a full clinic
--   snapshot — roughly a hundred round trips to render one page, re-deriving six
--   days that can never change again.
--
--   It is also the only way to close the last accuracy gap. Snapshots are now
--   bounded to the date they describe (migration-independent, see
--   lib/business-brain/metrics-repository.ts), but status changes are not
--   versioned: a treatment cancelled tomorrow reads as cancelled in yesterday's
--   reconstruction. Storing each day's metrics AS MEASURED removes the question
--   entirely — a recorded fact needs no reconstruction.
--
-- Shape:
--   One row per clinic + date + metric key. Deliberately narrow: this stores
--   MEASUREMENTS, not the Metric domain object. Name, category and unit all live
--   in the engine's descriptor table and would go stale the moment a metric was
--   renamed; the key and the number are the only things that must survive.
--
--   `value` is double precision rather than numeric. These are already-rounded
--   measurements read for comparison and trend, never summed into money — the
--   ledger stays in numeric(10,2) where exactness is required.
--
-- Idempotency:
--   The primary key is (clinic_id, metric_date, metric_key), so re-running a day
--   is an upsert rather than a duplicate. That matters because a day may legibly
--   be written twice: once by a scheduled job and once by a backfill.
--
-- Deliberately NOT stored:
--   Signals and diagnoses. Those are derived from metrics by pure functions, so
--   persisting them would create a second source of truth that could disagree
--   with the engine after any threshold change. Metrics are the measurements;
--   everything downstream is recomputed from them.
-- =============================================================================

create table if not exists metric_history (
  clinic_id   uuid        not null references clinics(id) on delete cascade,
  -- The clinic-local business date the measurement describes, not the moment it
  -- was written. A backfill run today for last Tuesday stores last Tuesday.
  metric_date date        not null,
  -- The engine's MetricKey, e.g. 'revenue.outstanding'. Text rather than an enum:
  -- metrics are added most releases, and ALTER TYPE ... ADD VALUE cannot run in
  -- the same transaction as the code that uses it.
  metric_key  text        not null,
  value       double precision not null,
  -- The snapshot moment the measurement was taken at, carried through from the
  -- engine so a stored row can be traced back to the run that produced it.
  measured_at timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint metric_history_pkey primary key (clinic_id, metric_date, metric_key)
);

-- The access pattern is always "this clinic, this date range, ascending" — the
-- Diagnosis Engine walks a contiguous run of days looking for gaps. The primary
-- key already leads with (clinic_id, metric_date), so it serves that directly;
-- no second index is added, because one that is never chosen still costs a write
-- on every insert.

comment on table metric_history is
  'Daily Business Brain measurements, one row per clinic + date + metric key. '
  'Written by the metrics persistence job; read as history so past days are not '
  'recomputed. Stores measurements only — signals and diagnoses stay derived.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same tenancy rule as every other clinic-scoped table. Read is dentist-only,
-- matching Analytics and the Business Brain dashboard: this is business
-- performance data, which receptionists have no access to anywhere else.
--
-- There is NO write policy, by design. Rows are written by the service role from
-- a server action or scheduled job, never by a signed-in user — the same pattern
-- as appointment_history. A client that could write here could fabricate the
-- clinic's own history.

alter table metric_history enable row level security;

drop policy if exists "metric_history: dentist reads own clinic" on metric_history;
create policy "metric_history: dentist reads own clinic"
  on metric_history for select
  to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'dentist'::user_role
  );

grant select on metric_history to authenticated;
grant select, insert, update, delete on metric_history to service_role;
