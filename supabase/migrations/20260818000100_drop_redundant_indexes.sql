-- =============================================================================
-- DentGrow — Drop redundant prefix indexes
-- Migration: 20260818000100_drop_redundant_indexes.sql
--
-- WHAT THIS CHANGES
--   Drops seven indexes whose column list is a strict LEFT PREFIX of another
--   index on the same table. A btree index on (a, b) already serves every
--   lookup that an index on (a) serves, so the narrower one earns nothing on
--   reads while still being maintained on every INSERT, UPDATE and DELETE.
--
-- WHY THESE SEVEN AND NOT OTHERS
--   Each pair below was confirmed against the live catalogue: same table, the
--   dropped index is non-unique, and NEITHER index is partial — so the wider
--   index covers the narrower one unconditionally. Unique indexes were
--   excluded (they enforce constraints, not just access paths), and partial
--   indexes were excluded (a different WHERE predicate means the wider index
--   may not cover the same rows). In particular none of the heavily-used
--   partial `... WHERE deleted_at IS NULL` indexes are touched.
--
-- READ IMPACT: none. Every query that used the dropped index can use the
-- covering index with the same leading columns.
-- WRITE IMPACT: seven fewer index entries to maintain per affected row change.
--   queue_entries loses two, and it is the most write-heavy table in the app —
--   advancing or skipping the queue rewrites several rows at a time.
--
-- Verified separately in the same session: the hot read paths (patient search,
-- today's appointments, queue-for-today, per-patient payments) all still choose
-- an index plan afterwards, so no new index is warranted alongside these drops.
-- =============================================================================

-- appointment_history (appointment_id) ⊂ (appointment_id, timestamp)
drop index if exists idx_appt_history_appointment_id;

-- consent_template_versions (template_id) ⊂ UNIQUE (template_id, version)
drop index if exists idx_consent_template_versions_template;

-- consent_templates (clinic_id) ⊂ UNIQUE (clinic_id, template_key)
drop index if exists idx_consent_templates_clinic;

-- profiles (clinic_id) ⊂ (clinic_id, role)
drop index if exists idx_profiles_clinic_id;

-- queue_entries (clinic_id, queue_date) ⊂ (clinic_id, queue_date, status, position)
drop index if exists idx_queue_clinic_date;

-- queue_entries (clinic_id, queue_date, status) ⊂ (clinic_id, queue_date, status, position)
drop index if exists idx_queue_clinic_date_status;

-- tooth_history (patient_tooth_id) ⊂ (patient_tooth_id, timestamp)
drop index if exists idx_tooth_history_patient_tooth_id;
