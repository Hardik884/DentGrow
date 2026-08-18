-- =============================================================================
-- DentGrow — Queue change signal (fixes the portal's frozen queue position)
-- Migration: 20260818000200_queue_signals.sql
--
-- THE BUG
--   /portal/queue tells the patient "your position updates automatically in
--   real time". It did not. The portal subscribes to queue_entries, and RLS
--   correctly restricts a patient to their OWN row
--   (`queue_entries: patient read own entry`). Supabase Realtime enforces RLS
--   per subscriber, so when the patient AHEAD of them is completed, the
--   waiting patient receives no event at all — "Ahead of you", "Est. wait" and
--   "Now seeing" stay frozen at whatever the page was server-rendered with.
--   Only a change to their own row ever woke the page up.
--
-- THE FIX
--   A clinic-level signal row that patients ARE allowed to read, carrying no
--   patient data — just "something in this clinic's queue changed, and this is
--   the version number". The portal subscribes to that and re-reads its own
--   position through the existing getQueueStatus() server action, which
--   already aggregates safely via a service-role read.
--
-- WHY A TABLE AND NOT WIDER RLS
--   Widening queue_entries visibility would leak other patients' rows to the
--   portal. This table contains no PHI: clinic_id, a counter, a timestamp.
--   Knowing "the queue moved" is already implied by the page's purpose.
--
-- WHY A STATEMENT-LEVEL TRIGGER
--   It fires once per statement rather than once per row, so advancing the
--   queue (which rewrites several rows) produces a handful of signals instead
--   of one per row, and skipping — which renumbers every entry behind the
--   skipped patient in a single bulk UPDATE — produces exactly one. It also
--   cannot be forgotten by a future code path the way an explicit call in a
--   Server Action can, including the pg_cron no-show job.
-- =============================================================================

create table if not exists queue_signals (
  clinic_id     uuid primary key references clinics(id) on delete cascade,
  queue_version bigint      not null default 1,
  updated_at    timestamptz not null default now()
);

comment on table queue_signals is
  'One row per clinic. Bumped whenever queue_entries changes, so portal '
  'patients (whom RLS stops from seeing any other queue row) still get a '
  'realtime nudge to re-read their own position. Contains no patient data.';

-- ── Bump function ──────────────────────────────────────────────────────────
-- SECURITY DEFINER because no role is granted write access to queue_signals;
-- the trigger is the only writer.
create or replace function bump_queue_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into queue_signals (clinic_id, queue_version, updated_at)
  select distinct clinic_id, 1, now() from changed_rows
  on conflict (clinic_id) do update
    set queue_version = queue_signals.queue_version + 1,
        updated_at    = now();
  return null;
end;
$$;

comment on function bump_queue_signal is
  'Statement-level trigger: bumps queue_signals for every clinic touched by '
  'the statement. Reads the transition table aliased as changed_rows.';

drop trigger if exists trg_queue_signal_insert on queue_entries;
create trigger trg_queue_signal_insert
  after insert on queue_entries
  referencing new table as changed_rows
  for each statement execute function bump_queue_signal();

drop trigger if exists trg_queue_signal_update on queue_entries;
create trigger trg_queue_signal_update
  after update on queue_entries
  referencing new table as changed_rows
  for each statement execute function bump_queue_signal();

drop trigger if exists trg_queue_signal_delete on queue_entries;
create trigger trg_queue_signal_delete
  after delete on queue_entries
  referencing old table as changed_rows
  for each statement execute function bump_queue_signal();

-- ── Who may read a clinic's signal ─────────────────────────────────────────
-- The clinic of the authenticated portal patient, resolved through their
-- portal link. Mirrors auth_patient_id()'s shape; STABLE + SECURITY DEFINER so
-- it can see patients/patient_portal_links regardless of the caller's RLS.
create or replace function auth_patient_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.clinic_id
  from patient_portal_links l
  join patients p on p.id = l.patient_id
  where l.user_id = auth.uid()
$$;

comment on function auth_patient_clinic_id is
  'Clinic of the authenticated portal patient, or NULL when the user has no '
  'portal link. Used only to scope queue_signals reads.';

alter table queue_signals enable row level security;

-- Calls are wrapped in scalar subselects so they are evaluated once per query
-- (InitPlan) rather than per row — same reasoning as
-- 20260818000000_rls_initplan_optimization.sql.
drop policy if exists "queue_signals: staff read own clinic" on queue_signals;
create policy "queue_signals: staff read own clinic"
  on queue_signals for select
  using (clinic_id = (select auth_clinic_id()));

drop policy if exists "queue_signals: portal patient read own clinic" on queue_signals;
create policy "queue_signals: portal patient read own clinic"
  on queue_signals for select
  using (clinic_id = (select auth_patient_clinic_id()));

-- Read-only for every client role. No insert/update/delete policy exists, so
-- all writes are denied; only bump_queue_signal() (security definer) writes.
grant select on queue_signals to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table queue_signals;

-- Seed a row per existing clinic so the first subscriber has something to
-- watch; the trigger keeps it current from then on.
insert into queue_signals (clinic_id)
select id from clinics
on conflict (clinic_id) do nothing;
