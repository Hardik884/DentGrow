-- =============================================================================
-- Activate no-show detection
-- Migration: 20260809000000_activate_no_show_detection.sql
--
-- 20260803000300 shipped `dentgrow-no-show-detection` registered but inactive so
-- a human could review the backlog before its first sweep. This re-enables it.
--
-- ⚠️  FIRST-RUN NOTE: on any database that still has old appointments left in
--     `scheduled` with a past `scheduled_at`, the first hourly run will flip all
--     of them to `no_show` in one pass. That is the rule working as specified,
--     but it is a bulk edit to historical records. Review the backlog before
--     applying this to a live clinic:
--
--       select id, scheduled_at, patient_id
--       from   appointments
--       where  status = 'scheduled'
--         and  deleted_at is null
--         and  scheduled_at < current_date
--       order  by scheduled_at;
--
--     After the first run the job only ever touches one day at a time.
-- =============================================================================

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'dentgrow-no-show-detection';

  if v_jobid is null then
    -- Nothing to activate. Not an error: this migration must not break a database
    -- where the schedule was never created (pg_cron unavailable, for instance).
    raise notice 'activate_no_show_detection: job not found; nothing to activate.';
    return;
  end if;

  perform cron.alter_job(v_jobid, active := true);
  raise notice 'activate_no_show_detection: job % is now ACTIVE.', v_jobid;
end $$;
