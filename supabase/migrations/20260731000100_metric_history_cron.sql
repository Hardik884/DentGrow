-- =============================================================================
-- Metric history schedule (pg_cron + pg_net)
-- Migration: 20260731000100_metric_history_cron.sql
--
-- Why:
--   History already self-heals: the dashboard writes back any day it had to
--   measure, so gaps close on first view. That buys the speed but not the
--   accuracy. A day measured three weeks late was still RECONSTRUCTED, and
--   reconstruction cannot recover status changes the schema never versioned — a
--   treatment cancelled since reads as cancelled in the older day. Measuring a
--   day the morning after it ends removes that gap for good.
--
-- Why an HTTP call rather than SQL:
--   The metrics are computed by the TypeScript engines — twenty calculators
--   reading through the billing helpers. Reproducing them in PL/pgSQL would
--   create a second source of truth that silently disagrees with the engine
--   after any change, which is the one thing this architecture is built to
--   avoid. pg_net therefore calls the application, and the application stays the
--   only place a metric is defined.
--
-- Why hourly:
--   Clinics keep their own timezones, so there is no single moment at which
--   "yesterday" has ended everywhere. A daily UTC job would leave clinics east
--   of it permanently a day behind. Hourly means every clinic is recorded within
--   an hour of its own midnight, and the endpoint skips a day already stored, so
--   after the first success each run costs one indexed lookup.
--
-- Configuration:
--   The URL and secret are read from Vault at call time, NOT baked into the job.
--   A migration cannot know either — they differ per environment — and the
--   cron.job table would otherwise hold a plaintext credential.
--
--   Set them once per environment (see supabase/CRON.md):
--
--     select vault.create_secret('https://app.example.com', 'app_base_url');
--     select vault.create_secret('<random>',                'cron_secret');
--
--   With either secret absent the function no-ops and says so. A fresh local
--   database therefore provisions cleanly and simply does not fire, rather than
--   erroring every hour.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- =============================================================================
-- The job body
-- =============================================================================
create or replace function public.run_metric_history_job()
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
    raise notice 'run_metric_history_job: app_base_url or cron_secret missing from vault; skipping.';
    return;
  end if;

  -- pg_net is asynchronous — this queues the request and returns an id
  -- immediately. The response lands in net._http_response, which is where to
  -- look when the job appears to have run but nothing was recorded.
  select net.http_post(
    url     := v_base_url || '/api/cron/metric-history',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body          := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_request;

  raise notice 'run_metric_history_job: queued request %', v_request;
end;
$$;

comment on function public.run_metric_history_job() is
  'Asks the application to record each enabled clinic''s last completed day into '
  'metric_history. Scheduled hourly by pg_cron. Reads its URL and bearer token '
  'from Vault; no-ops when either is absent.';

-- SECURITY DEFINER plus a Vault read means this must not be callable by users.
-- CREATE FUNCTION grants EXECUTE to PUBLIC implicitly, so it has to be revoked
-- explicitly — the same defect this project already fixed once, on
-- create_patient_appointment (migration 20260727000001).
revoke all on function public.run_metric_history_job() from public;
revoke all on function public.run_metric_history_job() from anon;
revoke all on function public.run_metric_history_job() from authenticated;

-- =============================================================================
-- The schedule
-- =============================================================================
-- Unscheduled first so re-running this migration replaces the job rather than
-- raising on a duplicate name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dentgrow-metric-history') then
    perform cron.unschedule('dentgrow-metric-history');
  end if;

  perform cron.schedule(
    'dentgrow-metric-history',
    -- Seven minutes past the hour rather than on it: every naive scheduler in
    -- the world fires at :00, and this has no reason to join the crowd.
    '7 * * * *',
    'select public.run_metric_history_job()'
  );
end $$;
