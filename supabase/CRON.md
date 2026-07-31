# Scheduled jobs

DentGrow schedules its own recurring work inside Postgres, using `pg_cron` to
fire and `pg_net` to call the application. There is no external scheduler and no
n8n involvement.

The application is called rather than the work being done in SQL because the
metrics are computed by the TypeScript engines. Reproducing them in PL/pgSQL
would create a second source of truth that silently disagrees with the engine
after any change, which is the one thing the Business Brain's architecture exists
to prevent.

---

## Jobs

| Name | Schedule | Calls | Purpose |
|---|---|---|---|
| `dentgrow-metric-history` | `7 * * * *` (hourly) | `POST /api/cron/metric-history` | Records each enabled clinic's last completed day into `metric_history` |

### Why hourly rather than daily

Clinics keep their own timezones, so there is no single moment at which
"yesterday" has ended everywhere — a daily UTC job leaves clinics east of it
permanently a day behind. Hourly means every clinic is recorded within an hour of
its own midnight. It is affordable because the endpoint skips any day already
stored, so after the first success each run costs one indexed lookup.

### Why this job matters when history already self-heals

The dashboard writes back any history day it had to measure, so gaps close on
first view. That buys speed but not accuracy: a day measured three weeks later
was still *reconstructed*, and reconstruction cannot recover status changes the
schema never versioned — a treatment cancelled since reads as cancelled in the
older day. Measuring the morning after removes that gap for good.

---

## Configuration

The job reads its target URL and bearer token from Vault at call time. They are
deliberately **not** baked into the migration: they differ per environment, and
`cron.job` would otherwise hold a plaintext credential in a table.

**Until both secrets exist the job no-ops and says so.** A fresh database
provisions cleanly and simply does not fire — it does not error hourly.

### 1. Set the secrets (once per environment)

```sql
select vault.create_secret('https://your-app.example.com', 'app_base_url');
select vault.create_secret('<a long random string>',       'cron_secret');
```

To rotate later, use `vault.update_secret` rather than creating a duplicate name.

### 2. Give the application the same token

`CRON_SECRET` in the app's environment must equal the `cron_secret` Vault value.
The endpoint compares them in constant time and **refuses to run at all when
`CRON_SECRET` is unset** — a missed deployment step must never be read as "no
authentication required".

### Local development

`app_base_url` must be reachable *from the database container*, which is not the
same as reachable from your shell:

```sql
select vault.create_secret('http://host.docker.internal:3000', 'app_base_url');
```

---

## Checking on it

```sql
-- Is the job registered and active?
select jobname, schedule, active from cron.job;

-- Did the last few runs succeed? (pg_cron's own log)
select job_pid, status, return_message, start_time
from cron.job_run_details
where jobname = 'dentgrow-metric-history'
order by start_time desc limit 10;

-- What did the application actually reply?
-- pg_net is ASYNCHRONOUS: run_metric_history_job() only queues the request, so
-- a "succeeded" row above means the call was queued, NOT that it worked.
-- This is the table to look at when the job appears to run but nothing lands.
select status_code, content, created
from net._http_response
order by id desc limit 10;

-- Fire it by hand, without waiting for the hour.
select public.run_metric_history_job();
```

### Common failures

| Symptom | Cause |
|---|---|
| `notice: ... missing from vault; skipping` | One or both secrets not set — see Configuration |
| `net._http_response` shows 401 | `CRON_SECRET` in the app does not match the `cron_secret` Vault value |
| `net._http_response` shows 503 | `CRON_SECRET` is not set in the app's environment at all |
| Job runs, no response rows | `app_base_url` unreachable from the database container |
| `status: recorded` never appears, always `already_recorded` | Working as intended — the day was already on record |

---

## Adding another job

1. Write the work as an application endpoint, authenticated with a bearer token.
2. Add a `security definer` function that reads its config from Vault and calls
   `net.http_post`. **Revoke `EXECUTE` from `public`, `anon` and `authenticated`
   explicitly** — `CREATE FUNCTION` grants it to `PUBLIC` implicitly, and this
   project has already had to fix that defect once (migration `20260727000001`).
3. Schedule it with `cron.schedule`, unscheduling any existing job of the same
   name first so the migration can be re-run.

`20260731000100_metric_history_cron.sql` is the worked example.
