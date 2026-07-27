-- =============================================================================
-- Enable Required PostgreSQL Extensions
-- Migration: 20260618000000_enable_required_extensions.sql
--
-- Problem this fixes:
--   20260619000000_dentgrow_initial_schema.sql:466-469 creates two GIN trigram
--   indexes that power partial-match patient search (CLAUDE.md §5.1: "Patient
--   search must support partial match on name and phone"):
--
--     create index idx_patients_name_trgm  on patients using gin (name  gin_trgm_ops);
--     create index idx_patients_phone_trgm on patients using gin (phone gin_trgm_ops);
--
--   The `gin_trgm_ops` operator class is supplied by the pg_trgm extension,
--   which that migration never creates. Both `create extension` lines in it
--   are commented out (:602 and :1087), and the note at :599 that says
--   "Must run before the trgm indexes" is itself placed AFTER them.
--
--   Consequence: applying the migration history to an empty database aborts
--   partway through the initial schema with
--     ERROR: operator class "gin_trgm_ops" does not exist for access method "gin"
--   No fresh environment could ever be provisioned from this repository.
--
-- Why this is a new, earlier migration rather than an edit:
--   An extension must exist BEFORE the index that uses its operator class, so
--   the fix cannot be appended as a later migration. Rather than rewrite
--   20260619000000 — which has already been applied by hand to the pilot
--   database — this migration is dated one day earlier so it sorts first in a
--   fresh run, while leaving the applied history byte-for-byte intact.
--
--   `if not exists` makes it a no-op wherever pg_trgm is already enabled
--   (which the pilot project must be, or its patient-search indexes could not
--   have been created), so it is safe to mark as already-applied during
--   migration repair. See supabase/REPAIR.md.
--
-- Schema placement:
--   Installed into the `extensions` schema, per Supabase convention — this is
--   what the commented-out line at 20260619000000:1087 intended, and it keeps
--   the `public` schema free of extension objects (Supabase's
--   `extension_in_public` database linter).
--
-- Note: gen_random_uuid(), used as the default for every primary key, is core
--   PostgreSQL from v13 onward and requires no extension. pgcrypto is not
--   needed.
-- =============================================================================

create schema if not exists extensions;

create extension if not exists pg_trgm with schema extensions;

comment on extension pg_trgm is
  'Trigram matching. Required by idx_patients_name_trgm and idx_patients_phone_trgm '
  '(20260619000000) for partial-match patient search.';
