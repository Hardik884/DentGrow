-- =============================================================================
-- Automatic no-show detection schedule (pg_cron + pg_net)
-- Migration: 20260803000100_no_show_detection_cron.sql
--
-- Why:
--   Receptionists currently mark a no-show by hand, which means it only
--   happens when someone remembers to, and "remembers to" degrades on a busy
--   day exactly when the record matters most for follow-up and analytics. The
--   business rule is mechanical — a `scheduled` appointment whose day has
--   fully ended without a check-in IS a no-show — so it belongs in a job, not
--   in someone's memory.
--
-- Why an HTTP call rather than SQL:
--   The transition also has to write appointment_history and defensively
--   close any stray queue entry, and it has to do it exactly the way every
--   other completion/status path in this app does (lib/appointments/history.ts,
--   the same conditional-UPDATE idempotency pattern used everywhere else).
--   Reproducing that in PL/pgSQL would create a second place status
--   transitions are defined; pg_net calls the application instead, so the
--   application stays the only place this logic lives.
--
-- Why hourly, and why per-clinic:
--   Clinics keep their own timezones (clinic_settings.timezone), so there is
--   no single UTC moment at which "today" has ended for all of them. Hourly
--   means every clinic is swept within an hour of its own local midnight. The
--   endpoint's WHERE clause (status = 'scheduled' AND scheduled_at < today's
--   local-midnight boundary) is itself the idempotency guard — a clinic
--   already fully processed simply matches zero rows on the next run, so
--   hourly costs almost nothing once caught up.
--
-- NOT gated behind the Business Brain's clinic allow-list: unlike
-- metric-history, this is a core production feature every clinic needs, not
-- a Business Brain enhancement. See app/api/cron/no-show-detection/route.ts.
--
-- Configuration:
--   Reuses the SAME Vault secrets as the metric-history job — 'app_base_url'
--   and 'cron_secret' (migration 20260731000100). No new secrets to manage.
--   With either absent the function no-ops and says so, same contract.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- =============================================================================
-- The job body
-- =============================================================================
create or replace function public.run_no_show_detection_job()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_base_url text;
  v_secret   text;
  v_request  bigint;
begin
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  -- Not configured for this environment. A notice, not an exception: an
  -- unconfigured database should provision and sit quiet, not fail hourly.
  if v_base_url is null or v_secret is null then
    raise notice 'run_no_show_detection_job: app_base_url or cron_secret missing from vault; skipping.';
    return;
  end if;

  -- pg_net is asynchronous — this queues the request and returns an id
  -- immediately. The response lands in net._http_response, which is where to
  -- look when the job appears to have run but nothing changed.
  select net.http_post(
    url     := v_base_url || '/api/cron/no-show-detection',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body          := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_request;

  raise notice 'run_no_show_detection_job: queued request %', v_request;
end;
$$;

comment on function public.run_no_show_detection_job() is
  'Asks the application to auto-mark scheduled appointments whose day has ended '
  'as no_show, for every clinic. Scheduled hourly by pg_cron. Reads its URL and '
  'bearer token from Vault; no-ops when either is absent.';

-- SECURITY DEFINER plus a Vault read means this must not be callable by users.
-- CREATE FUNCTION grants EXECUTE to PUBLIC implicitly, so it has to be revoked
-- explicitly — the same defect this project already fixed once, on
-- create_patient_appointment (migration 20260727000001).
revoke all on function public.run_no_show_detection_job() from public;
revoke all on function public.run_no_show_detection_job() from anon;
revoke all on function public.run_no_show_detection_job() from authenticated;

-- =============================================================================
-- The schedule
-- =============================================================================
-- Unscheduled first so re-running this migration replaces the job rather than
-- raising on a duplicate name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dentgrow-no-show-detection') then
    perform cron.unschedule('dentgrow-no-show-detection');
  end if;

  perform cron.schedule(
    'dentgrow-no-show-detection',
    -- 22 minutes past the hour: offset from metric-history's :07 so the two
    -- jobs don't contend for the same minute, and off :00 like every naive
    -- scheduler in the world.
    '22 * * * *',
    'select public.run_no_show_detection_job()'
  );
end $$;
