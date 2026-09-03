-- =============================================================================
-- RETENTION POLICIES AND PURGE
-- Migration: 20260903000500_retention_policies.sql
--
-- WHAT WAS MISSING
--   Nothing in OraMedha was ever deleted. Not queue entries from eighteen
--   months ago, not the reminder log for a patient who left, not the webhook
--   log table nothing has ever written to. "Retention: None" was the honest
--   answer for every table in the audit's data inventory, and it was correct.
--
--   Keeping data forever is a cost and a liability at the same time: the table
--   grows, and every row is one more row in the next breach.
--
-- THE LINE THIS MIGRATION DRAWS, AND WILL NOT CROSS
--   CLINICAL AND AUDIT RECORDS ARE NOT PURGED. Not by this migration, not by
--   the job it creates, not by a timer.
--
--   patients, appointments, treatments, payments, follow_ups, consents,
--   patient_teeth, tooth_history, appointment_history, consent_audit,
--   treatment_history and data_consent_records are all deliberately absent from
--   the policy table below, and the purge function has no code path that could
--   reach them.
--
--   The reasoning is not squeamishness. A clinic has professional
--   record-keeping duties measured in years and set by its own regulator, not
--   by this schema. An audit trail exists precisely to outlive the thing it
--   describes. And a generic retention timer firing on a clinical table is the
--   kind of automation that destroys evidence quietly, at scale, and is
--   discovered afterwards. Whatever the eventual clinical retention period
--   turns out to be, it will be applied by a deliberate, reviewed, per-clinic
--   process — not by this cron job.
--
-- PRODUCT DEFAULT ≠ LEGAL REQUIREMENT
--   Every number below is a PRODUCT DEFAULT: an engineering judgement about how
--   long operational data stays useful. None of them is a legal position, and
--   the table says so in a column rather than in a comment somewhere else, so
--   nobody can read a value out of this schema and take it as advice.
--
--   → REQUIRES LEGAL CONFIRMATION before any of these are relied upon as
--     compliance with anything. See docs/RETENTION.md.
--
-- THE MECHANISM
--   `run_retention_purge(p_dry_run)` walks the enabled policies and, for each,
--   counts (dry run) or deletes (live) the rows older than its window. It
--   defaults to a DRY RUN: a function whose default behaviour is to delete is a
--   function that eventually deletes something by accident.
--
--   It is idempotent — the window is computed from now() and the WHERE clause
--   is the whole condition, so running it twice removes nothing extra — and it
--   is safe to retry, because a failed run has deleted a prefix of what it
--   would have deleted and the next run continues from there.
-- =============================================================================

-- =============================================================================
-- 1. POLICY TABLE
-- =============================================================================

create table retention_policies (
  -- A stable key the purge function switches on. Not a table name: one table
  -- can have two policies (queue entries by status), and a policy can outlive a
  -- table rename.
  key           text        primary key,

  -- What this policy covers, in words, for whoever reads the table directly.
  description   text        not null,

  -- Days to keep. NULL means "keep indefinitely" and is how a policy is
  -- neutralised without deleting the row and losing the record that it existed.
  retain_days   integer     check (retain_days is null or retain_days > 0),

  -- Off means the purge skips it entirely, regardless of retain_days.
  enabled       boolean     not null default true,

  -- Whether this number has been confirmed by anyone qualified to confirm it.
  -- FALSE for everything shipped here. It exists so the distinction between
  -- "we picked this" and "this is required" survives contact with the next
  -- person to read the table.
  legally_confirmed boolean not null default false,

  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table retention_policies is
  'How long each category of OPERATIONAL data is kept. Clinical and audit '
  'records are deliberately absent — they are never purged on a timer. Every '
  'retain_days here is a product default, not a legal requirement; '
  'legally_confirmed says which (currently: none).';

comment on column retention_policies.retain_days is
  'Days to keep. NULL = keep indefinitely, which is how a policy is switched '
  'off without losing the record that it exists.';

comment on column retention_policies.legally_confirmed is
  'FALSE means nobody qualified has confirmed this period. Shipped false for '
  'every row on purpose.';

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Readable by any signed-in staff member: a clinic is entitled to know how long
-- its data is kept, and hiding the policy would make that unanswerable. No
-- write policy — changing a retention period is a deliberate act performed by a
-- migration or the service role, not a UI toggle.

alter table retention_policies enable row level security;

create policy "retention_policies: staff read"
  on retention_policies for select
  to authenticated
  using ((select auth_role()) in ('dentist', 'receptionist'));

revoke all on retention_policies from anon;
grant select on retention_policies to authenticated;
grant select, insert, update on retention_policies to service_role;

-- =============================================================================
-- 2. THE POLICIES
-- =============================================================================
--
-- Only categories that are genuinely eligible. Read the reason on each; the
-- reason is what makes the number reviewable.

insert into retention_policies (key, description, retain_days) values
  ('queue_entries_completed',
   'Finished queue entries (status = completed). The live queue resets daily; '
   'a completed entry from last quarter tells nobody anything and the row '
   'records that a named patient was physically present at a clinic on a date.',
   90),

  ('reminder_logs',
   'Records that a WhatsApp reminder was sent. Exists only to suppress '
   'duplicate messages across page refreshes, so its usefulness expires with '
   'the reminder. The `kind` column leaks clinical context '
   '(payment_reminder, recall_invitation) for as long as the row survives.',
   365),

  ('webhook_logs',
   'Inbound n8n webhook payloads. Debugging material. Nothing has ever written '
   'to this table, so the policy is pre-emptive rather than reactive.',
   90),

  ('metric_history',
   'Business Brain daily aggregates: (clinic_id, metric_key, date, value). '
   'Contains no patient identifier of any kind. Kept long because trend '
   'analysis is the entire point of the table and three years is two full '
   'year-on-year comparisons.',
   1095),

  ('problem_dismissals',
   'Snoozed Business Brain findings, which carry their own expires_at. This '
   'clears the rows once the snooze itself is long past.',
   90),

  ('phi_access_log',
   'The record of who READ a patient record. A security log, so the window is '
   'set by how long an investigation might reasonably reach back — two years, '
   'comfortably beyond the 180 days Indian log-retention direction asks for. '
   'Shortening this makes a future breach harder to scope, which is the exact '
   'situation it was created for.',
   730),

  ('deleted_treatment_documents',
   'Documents a dentist REMOVED (deleted_at set). The grace period exists so a '
   'radiograph deleted by mistake can be restored; after it, the row and its '
   'storage object are cleared by the application job, which is the only thing '
   'that can reach object storage.',
   90);

-- =============================================================================
-- 3. THE PURGE
-- =============================================================================
--
-- security definer because it must set app.purge_context, which is what the
-- append-only triggers on phi_access_log and the consent/treatment audit tables
-- check before permitting a DELETE. search_path is pinned, as it must be on any
-- security definer function, so a caller cannot shadow a table with their own.
--
-- Returns a jsonb report: one entry per policy with the row count it removed
-- (or would remove). A purge job that returns nothing cannot be monitored, and
-- an unmonitored purge job is how a broken one runs unnoticed for a year.

create or replace function run_retention_purge(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  policy   record;
  affected integer;
  cutoff   timestamptz;
  report   jsonb := '[]'::jsonb;
begin
  -- Transaction-local, so it cannot leak into an unrelated statement on a
  -- pooled connection.
  perform set_config('app.purge_context', 'retention', true);

  for policy in
    select key, retain_days
      from retention_policies
     where enabled = true
       and retain_days is not null
     order by key
  loop
    cutoff   := now() - make_interval(days => policy.retain_days);
    affected := 0;

    -- An explicit CASE rather than dynamic SQL built from the key. The set of
    -- purgeable tables is then fixed at migration time and visible here: a new
    -- row in retention_policies cannot, by itself, cause a table to be deleted
    -- from. That is the property that keeps a clinical table unreachable.
    case policy.key

      when 'queue_entries_completed' then
        if p_dry_run then
          select count(*) into affected
            from queue_entries
           where status = 'completed' and checked_in_at < cutoff;
        else
          delete from queue_entries
           where status = 'completed' and checked_in_at < cutoff;
          get diagnostics affected = row_count;
        end if;

      when 'reminder_logs' then
        if p_dry_run then
          select count(*) into affected from reminder_logs where sent_at < cutoff;
        else
          delete from reminder_logs where sent_at < cutoff;
          get diagnostics affected = row_count;
        end if;

      when 'webhook_logs' then
        if p_dry_run then
          select count(*) into affected from webhook_logs where received_at < cutoff;
        else
          delete from webhook_logs where received_at < cutoff;
          get diagnostics affected = row_count;
        end if;

      when 'metric_history' then
        if p_dry_run then
          select count(*) into affected
            from metric_history where metric_date < cutoff::date;
        else
          delete from metric_history where metric_date < cutoff::date;
          get diagnostics affected = row_count;
        end if;

      when 'problem_dismissals' then
        if p_dry_run then
          select count(*) into affected
            from problem_dismissals where created_at < cutoff;
        else
          delete from problem_dismissals where created_at < cutoff;
          get diagnostics affected = row_count;
        end if;

      when 'phi_access_log' then
        if p_dry_run then
          select count(*) into affected
            from phi_access_log where occurred_at < cutoff;
        else
          delete from phi_access_log where occurred_at < cutoff;
          get diagnostics affected = row_count;
        end if;

      when 'deleted_treatment_documents' then
        -- Counted here, removed by the application job: the storage OBJECT has
        -- to go first, and Postgres cannot reach object storage. Deleting the
        -- row from here would orphan the file permanently.
        select count(*) into affected
          from treatment_documents
         where deleted_at is not null and deleted_at < cutoff;

      else
        -- A policy key with no implementation. Reported rather than ignored, so
        -- adding a row without adding a branch is visible in the job output
        -- instead of silently doing nothing.
        report := report || jsonb_build_object(
          'key', policy.key,
          'status', 'no-implementation',
          'rows', 0
        );
        continue;
    end case;

    report := report || jsonb_build_object(
      'key', policy.key,
      'status', case
                  when policy.key = 'deleted_treatment_documents' then 'counted-only'
                  when p_dry_run then 'dry-run'
                  else 'purged'
                end,
      'cutoff', cutoff,
      'rows', affected
    );
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'ran_at', now(),
    'policies', report
  );
end;
$$;

comment on function run_retention_purge(boolean) is
  'Applies retention_policies to OPERATIONAL tables only. Defaults to a DRY '
  'RUN — a function whose default is to delete eventually deletes something by '
  'accident. Clinical and audit tables are unreachable from here: the CASE is '
  'explicit, so a new policy row cannot by itself cause a delete. '
  'Idempotent and safe to retry.';

-- Not callable from any browser session.
revoke all on function run_retention_purge(boolean) from public;
revoke all on function run_retention_purge(boolean) from anon, authenticated;
grant execute on function run_retention_purge(boolean) to service_role;

-- =============================================================================
-- 4. SCHEDULING
-- =============================================================================
--
-- Deliberately NOT scheduled by this migration.
--
-- The other two jobs in this schema (metric-history, no-show detection) were
-- scheduled from a migration because they are additive: the worst outcome of an
-- unnoticed run is a duplicated aggregate. This one deletes. Turning it on
-- before anyone has looked at a dry run against real data would mean the first
-- evidence of a wrong number is missing rows.
--
-- → REQUIRES MANUAL CONFIGURATION. The intended sequence is in
--   docs/RETENTION.md: run the endpoint in dry-run mode, read the counts,
--   then schedule it. The application endpoint is
--   POST /api/cron/retention-purge.

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
