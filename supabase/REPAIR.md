# Adopting the Supabase CLI on an existing database

**Read this before running `supabase db push` against any environment that already
has OraMedha's schema — in particular the pilot clinic's project.**

---

## Why this document exists

Every migration in `supabase/migrations/` up to and including
`20260724000000_xray_charges.sql` was applied **by hand**, pasted into the Supabase
SQL editor. There was no CLI, no `supabase/config.toml`, and therefore no
`supabase_migrations.schema_migrations` tracking table.

The CLI decides what to run by comparing the local migration filenames against the
rows in that tracking table. On a database where the table is empty or absent, the
CLI concludes that **nothing has ever been applied** and tries to run all 28
migrations from the beginning.

Against the pilot database that would mean re-running `create table`, `create type`
and `create policy` statements against objects that already exist. The push aborts
on the first conflict, and any migration containing destructive DML — notably
`20260707000000_consultancy_refinements.sql`, which starts with an unconditional
`delete from consultancy_schedules;` — is capable of destroying live data before it
fails.

The fix is to backfill the tracking table so it reflects reality. That is what
`supabase migration repair` does: it writes a row into `schema_migrations` **without
executing the SQL**.

---

## One-time reconciliation

### Step 0 — Back up first

Take a manual backup from the Supabase dashboard (Database → Backups) before
touching anything. Everything below is reversible, but this step makes that
guarantee real rather than theoretical.

### Step 1 — Link the project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

### Step 2 — Confirm the Postgres major version matches

```bash
# In the Supabase SQL editor:
show server_version;
```

If it is not 17, correct `major_version` in `supabase/config.toml`. A mismatch makes
local testing an unreliable proxy for production.

### Step 3 — Inspect what the CLI currently believes

```bash
npx supabase migration list
```

Expect every migration to show as **Local only** — that is the problem being fixed.
If some rows already appear as remote, only repair the ones that do not.

### Step 4 — Mark the already-applied history as applied

These 26 migrations describe schema that is **already live**. Marking them applied
records history without re-executing SQL.

```bash
npx supabase migration repair --status applied \
  20260618000000 \
  20260619000000 20260619000001 20260619000002 \
  20260620000000 \
  20260621000000 20260621000001 20260621000002 \
  20260622000000 \
  20260623000000 \
  20260627000000 \
  20260629000000 20260629000001 \
  20260701000000 20260701000001 20260701000002 \
  20260703000000 \
  20260706000000 \
  20260707000000 \
  20260710000000 20260710000001 \
  20260711000000 20260711000001 \
  20260712000000 \
  20260713000000 \
  20260724000000
```

Two of these need explanation:

- **`20260618000000_enable_required_extensions`** was written as part of this CLI
  migration and has never been run anywhere. It only issues
  `create extension if not exists pg_trgm`. The pilot database must already have
  `pg_trgm` enabled — its `idx_patients_name_trgm` / `idx_patients_phone_trgm`
  indexes could not otherwise exist — so marking it applied is accurate. If you
  would rather be certain, run `create extension if not exists pg_trgm with schema
  extensions;` in the SQL editor first; it is a no-op when already present.

- **`20260710000001`** and **`20260711000001`** are the renamed halves of the two
  duplicate-version pairs (see below). Their SQL was applied to the pilot database
  under the old filenames; only the version string changed.

### Step 5 — Verify the ledger

```bash
npx supabase migration list
```

All 26 should now show as applied on both sides. The only two remaining as
**Local only** should be `20260727000000` and `20260727000001`.

### Step 6 — Apply the two security migrations for real

These are the P0 fixes and they have **not** been applied anywhere yet. This is the
only step that executes SQL against production.

```bash
npx supabase db push
```

Expected output: three migrations applied — `20260727000000`, `20260727000001` and
`20260727000002`.

`20260727000002_baseline_role_grants.sql` is deliberately **pushed rather than
repaired**. Its `grant` statements are idempotent and the pilot database almost
certainly already holds those privileges (the application works, which it could not
without them), so applying it changes nothing there. What it does add is the
`alter default privileges` rules, so that a table created by a future migration is
reachable without the author having to remember a manual `GRANT` — which is worth
having in production too.

### Step 7 — Confirm the security fixes landed

```sql
-- Must return a non-null with_check expression:
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
from   pg_policy
where  polrelid = 'profiles'::regclass and polname = 'profiles: update own profile';

-- Must return no rows for anon/authenticated/public:
select grantee, privilege_type
from   information_schema.role_routine_grants
where  routine_name = 'create_patient_appointment';
```

---

## From this point on

Never edit the SQL editor directly again. The workflow is:

```bash
npm run db:new -- add_something    # create a timestamped migration file
# edit supabase/migrations/<ts>_add_something.sql
npm run db:reset                   # rebuild local DB from scratch and verify
npm run db:push                    # apply to the linked remote
```

`npm run db:reset` is the single most valuable habit here: it proves on every run
that the full history still builds an empty database correctly.

---

## Migration history problems fixed during the CLI adoption

| Problem | Resolution |
|---|---|
| **Duplicate version `20260710000000`** — `follow_up_confirmation_status` and `opd_payments` shared a version. `schema_migrations.version` is a primary key, so one would collide or be silently skipped. | `opd_payments` renamed to `20260710000001`. Both are independent (different tables), so the relative order is behaviour-neutral. |
| **Duplicate version `20260711000000`** — `dashboard_consultancy_toggle` and `patient_visit_consultation`. Same failure mode. | `patient_visit_consultation` renamed to `20260711000001`. Existing lexicographic order preserved. |
| **`pg_trgm` never created** — `20260619000000:466-469` builds two `gin_trgm_ops` indexes, but both `create extension` lines are commented out (`:602`, `:1087`). A fresh database aborted with *operator class "gin_trgm_ops" does not exist*. | New `20260618000000_enable_required_extensions.sql`, dated earlier so it sorts first. The already-applied initial migration was left byte-for-byte intact. |
| **No table-level GRANTs anywhere in the history** — 18 tables, 8 views, 79 policies, and not one `grant`. The pilot database works only because the Supabase dashboard's ambient default privileges granted DML as a side effect of object creation. A database built purely from the history gave `authenticated` only REFERENCES/TRIGGER/TRUNCATE, so every query failed with *permission denied for table profiles*. | New `20260727000002_baseline_role_grants.sql`, verified against a clean `db reset`. Adds no policy; RLS still gates every row (`anon` continues to see zero rows across all tables). |
| **No tracking table** — the CLI would re-run all 29 migrations against production. | This runbook (`migration repair`). |
| **Destructive DML in a migration** — `20260707000000` opens with `delete from consultancy_schedules;`. Harmless on an empty database (which is why `db reset` passes), genuinely dangerous if that migration is ever re-run against production. | Left in place: removing it would change the historical record, and it is required for the `add column date not null` that follows it. Neutralised by Step 4, which ensures it is never re-executed. **Do not run `db reset` against a linked remote.** |

## Known non-idempotent migrations

Several migrations use bare `create type` / `create policy` without a preceding
`drop ... if exists`, so they fail if executed twice. Under the CLI each migration
runs exactly once, so this is no longer a live problem — but it is the reason
Step 4 exists rather than "just run `db push` and see what happens".
