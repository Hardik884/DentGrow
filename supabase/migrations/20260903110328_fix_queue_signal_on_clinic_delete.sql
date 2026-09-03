-- =============================================================================
-- Let a clinic be deleted: don't bump a queue signal for a clinic that is going
-- Migration: 20260903110328_fix_queue_signal_on_clinic_delete.sql
--
-- WHAT WAS WRONG (pre-existing, from 20260818000200_queue_signals.sql)
--   Deleting a clinic cascades to queue_entries. That fires
--   trg_queue_signal_delete, whose function inserts a queue_signals row for
--   every clinic_id in the deleted set — including the clinic that is, in the
--   same statement, being deleted. queue_signals.clinic_id references
--   clinics(id), so the insert fails and the whole delete aborts:
--
--     ERROR: insert or update on table "queue_signals" violates foreign key
--            constraint "queue_signals_clinic_id_fkey"
--     DETAIL: Key (clinic_id)=(...) is not present in table "clinics".
--     CONTEXT: SQL statement "insert into queue_signals ..."
--              PL/pgSQL function bump_queue_signal()
--
--   So any clinic that has ever had a queue entry could not be deleted at all.
--   Nothing in the product deletes a clinic today, which is why it went
--   unnoticed; it surfaced when the Business Brain integration suites started
--   running for the first time and could no longer clean up their own fixtures.
--
-- THE FIX
--   Bump the signal only for clinics that still exist. A queue signal exists to
--   invalidate a live subscriber's cache; a clinic that is being deleted has no
--   subscribers to notify, so skipping it loses nothing.
--
--   For every ordinary INSERT/UPDATE/DELETE on queue_entries the clinic is
--   present and the EXISTS is true, so normal queue behaviour — including the
--   realtime invalidation the whole table exists for — is unchanged.
--
-- WHAT THIS DOES NOT FIX
--   A clinic that has rows in an append-only table (phi_access_log,
--   data_consent_records, data_consent_notices, treatment_history) still cannot
--   be deleted: those cascade too, and the append-only trigger refuses the
--   cascaded DELETE outside a retention purge. That is arguably correct — an
--   audit trail should outlive the thing it audits — but it means tenant
--   offboarding needs a deliberate procedure that purges those rows through the
--   declared purge path first, and a decision about whether it should. That is a
--   product and retention question, not a bug to patch here.
--
-- SECURITY DEFINER is preserved: no role is granted write access to
-- queue_signals, and this function is the only writer.
-- =============================================================================

create or replace function bump_queue_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into queue_signals (clinic_id, queue_version, updated_at)
  select distinct r.clinic_id, 1, now()
  from   changed_rows r
  -- Skip a clinic that no longer exists: this statement is the cascade from
  -- `delete from clinics`, and inserting a signal for it would violate
  -- queue_signals_clinic_id_fkey and abort the delete.
  where  exists (select 1 from clinics c where c.id = r.clinic_id)
  on conflict (clinic_id) do update
    set queue_version = queue_signals.queue_version + 1,
        updated_at    = now();
  return null;
end;
$$;

comment on function bump_queue_signal() is
  'Bumps queue_signals.queue_version once per statement for each affected '
  'clinic, so portal and staff subscribers can invalidate. Skips clinics that '
  'no longer exist, which is what makes `delete from clinics` possible: the '
  'cascade into queue_entries fires this trigger, and a signal for the '
  'disappearing clinic would violate its own foreign key.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
