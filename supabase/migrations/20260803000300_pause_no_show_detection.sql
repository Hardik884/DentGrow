-- =============================================================================
-- Ship no-show detection PAUSED, pending backlog review
-- Migration: 20260803000300_pause_no_show_detection.sql
--
-- 20260803000100 schedules `dentgrow-no-show-detection` hourly. On the pilot
-- database its FIRST run would sweep the entire backlog in one pass: 23
-- appointments dating back to 19 June are still sitting in `scheduled`, and
-- every one of them would flip to `no_show` within the hour.
--
-- That is the rule working exactly as specified — nobody ever checked those
-- patients in, so they ARE no-shows. But it is a bulk edit to six weeks of
-- clinical records on a live clinic, and it deserves a human looking at the
-- list first. Going forward the job only ever touches one day at a time, so
-- this concern applies to the first run and never again.
--
-- The job is left REGISTERED but inactive rather than unscheduled, so it stays
-- visible in `cron.job` and re-enabling is a single statement with no need to
-- recreate the schedule.
--
-- To review the backlog before enabling:
--
--     select id, scheduled_at, patient_id
--     from   appointments
--     where  status = 'scheduled'
--       and  deleted_at is null
--       and  scheduled_at < current_date
--     order  by scheduled_at;
--
-- To enable (after review):
--
--     select cron.alter_job(
--       (select jobid from cron.job where jobname = 'dentgrow-no-show-detection'),
--       active := true
--     );
--
-- Prefer a follow-up migration over running that by hand, so every environment
-- ends up in the same state and a local `db reset` does not silently disagree
-- with production.
-- =============================================================================

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'dentgrow-no-show-detection';

  if v_jobid is null then
    -- Nothing to pause. Not an error: this migration must not break a database
    -- where the schedule was never created (pg_cron unavailable, for instance).
    raise notice 'pause_no_show_detection: job not found; nothing to pause.';
    return;
  end if;

  perform cron.alter_job(v_jobid, active := false);
  raise notice 'pause_no_show_detection: job % is now INACTIVE.', v_jobid;
end $$;
