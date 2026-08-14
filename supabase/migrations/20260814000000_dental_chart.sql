-- =============================================================================
-- DentGrow — Dental Chart
-- Migration: 20260814000000_dental_chart.sql
--
-- Purpose:
--   Per-tooth clinical charting (FDI numbering, adult + primary dentition),
--   with an append-only history trail, linked to the EXISTING treatments
--   table via an additive optional column rather than a parallel treatment
--   system. Follows the FIX-8 four-policy-per-table RLS pattern, the
--   appointment_history append-only/service-role-write pattern, and the
--   patient_treatments/receptionist_treatments column-exclusion-view pattern
--   already established in this schema.
--
-- What this migration adds:
--   1. dentition_type, tooth_status, tooth_history_action — native enums.
--   2. patient_teeth        — current per-tooth state, one row per
--                              (patient_id, dentition_type, tooth_number).
--   3. tooth_history        — append-only audit trail for patient_teeth,
--                              mirroring appointment_history. No client
--                              write policy; written by a service-role
--                              helper only.
--   4. treatments.tooth_number / treatments.dentition_type — additive,
--                              nullable columns. Existing treatments rows
--                              are untouched and remain valid with no tooth.
--   5. patient_dental_chart — portal-safe view (excludes the dentist-only
--                              `notes` column), following patient_treatments'
--                              precedent. Infrastructure only — no patient
--                              portal page reads it yet.
--
-- Access model (matches CLAUDE.md §3 role table — receptionist has no access
-- to clinical treatment detail, so the dental chart is dentist + patient
-- portal only; no receptionist policy is created, so RLS denies by default):
--   - dentist:   full CRUD on patient_teeth, read-only on tooth_history.
--   - patient:   read-only, own chart, via patient_dental_chart view.
--   - receptionist: no access (no policy defined = default deny under RLS).
-- =============================================================================

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

create type dentition_type as enum (
  'adult',
  'primary'
);

comment on type dentition_type is
  'Adult (permanent) vs primary (deciduous) dentition. Determines which FDI '
  'tooth-number range is valid for a given patient_teeth/treatments row.';

create type tooth_status as enum (
  'normal',
  'recommended',
  'planned',
  'in_progress',
  'completed',
  'missing'
);

comment on type tooth_status is
  'Chart state of a single tooth: normal (no issue), recommended (treatment '
  'recommended), planned (treatment planned), in_progress (treatment under '
  'way), completed (treatment completed), missing (extracted/missing).';

create type tooth_history_action as enum (
  'status_changed',
  'condition_updated',
  'note_added',
  'treatment_linked'
);

comment on type tooth_history_action is
  'Kind of change recorded against a tooth. Mirrors appointment_history_action.';

-- =============================================================================
-- 2. PATIENT_TEETH — current per-tooth state
-- =============================================================================

create table patient_teeth (
  id             uuid           primary key default gen_random_uuid(),
  clinic_id      uuid           not null references clinics (id)  on delete cascade,
  patient_id     uuid           not null references patients (id) on delete cascade,
  dentition_type dentition_type not null default 'adult',
  tooth_number   smallint       not null,
  status         tooth_status   not null default 'normal',
  condition      text,
  notes          text,
  updated_by     uuid           references profiles (id) on delete set null,
  deleted_at     timestamptz,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now(),

  constraint uq_patient_teeth_patient_dentition_tooth
    unique (patient_id, dentition_type, tooth_number),

  -- FDI numbering: adult quadrants 1-4 -> 11-18/21-28/31-38/41-48 (position
  -- digit 1-8); primary quadrants 5-8 -> 51-55/61-65/71-75/81-85 (position
  -- digit 1-5).
  constraint chk_patient_teeth_tooth_number_fdi check (
    (dentition_type = 'adult'
      and tooth_number in (11,12,13,14,15,16,17,18,
                            21,22,23,24,25,26,27,28,
                            31,32,33,34,35,36,37,38,
                            41,42,43,44,45,46,47,48))
    or
    (dentition_type = 'primary'
      and tooth_number in (51,52,53,54,55,
                            61,62,63,64,65,
                            71,72,73,74,75,
                            81,82,83,84,85))
  )
);

comment on table patient_teeth is
  'Current dental-chart state per tooth per patient (FDI numbering). One row '
  'per (patient_id, dentition_type, tooth_number). Soft-deletable. History of '
  'changes lives in tooth_history — this table only ever holds the latest state.';
comment on column patient_teeth.notes is
  'Dentist-authored clinical note. Dentist-only — excluded from the '
  'patient_dental_chart portal view, mirroring treatments.internal_notes.';
comment on column patient_teeth.condition is
  'Free-text clinical condition (e.g. "caries", "fractured cusp"). Shown to '
  'the patient portal view — lower sensitivity than notes.';

create index idx_patient_teeth_clinic_id  on patient_teeth (clinic_id)  where deleted_at is null;
create index idx_patient_teeth_patient_id on patient_teeth (patient_id) where deleted_at is null;

create trigger trg_patient_teeth_updated_at
  before update on patient_teeth
  for each row execute function set_updated_at();

-- =============================================================================
-- 3. TOOTH_HISTORY — append-only audit trail (mirrors appointment_history)
-- =============================================================================

create table tooth_history (
  id               uuid                  primary key default gen_random_uuid(),
  patient_tooth_id uuid                  not null references patient_teeth (id) on delete cascade,
  treatment_id     uuid                  references treatments (id) on delete set null,
  action           tooth_history_action  not null,
  old_value        jsonb,
  new_value        jsonb,
  performed_by     uuid                  references profiles (id) on delete set null,
  timestamp        timestamptz           not null default now()
);

comment on table tooth_history is
  'Append-only audit trail for patient_teeth, mirroring appointment_history. '
  'Records are never updated or deleted. Inserts are performed by server-side '
  'service-role actions only (see lib/dental-chart/history.ts) — there is no '
  'client write policy on this table.';
comment on column tooth_history.treatment_id is
  'Optional link to the treatment that caused this change (e.g. marking a '
  'linked treatment completed). ON DELETE SET NULL so history survives a '
  'treatment being removed, matching the follow_ups.treatment_id precedent.';

create index idx_tooth_history_patient_tooth_id on tooth_history (patient_tooth_id);
create index idx_tooth_history_timestamp on tooth_history (patient_tooth_id, timestamp desc);
create index idx_tooth_history_treatment_id on tooth_history (treatment_id) where treatment_id is not null;

-- =============================================================================
-- 4. TREATMENTS — additive optional tooth reference
--
-- Nullable, additive. Existing treatments rows are untouched and remain
-- fully valid with tooth_number = null. No FK to patient_teeth: a treatment
-- can reference a tooth even before any patient_teeth row exists for it, and
-- patient_teeth is keyed by (patient_id, dentition_type, tooth_number) rather
-- than a single tooth id, so the link is validated and reconciled
-- application-side (actions/dental-chart.ts), the same way
-- follow_ups.treatment_id is a soft, app-validated link rather than a tight
-- constraint.
-- =============================================================================

alter table treatments
  add column tooth_number   smallint,
  add column dentition_type dentition_type;

comment on column treatments.tooth_number is
  'Optional FDI tooth number this treatment was performed on. NULL for '
  'treatments not tied to a specific tooth (e.g. consultation, cleaning). '
  'Additive — existing treatments without a tooth continue to work unchanged.';

alter table treatments
  add constraint chk_treatment_tooth_number_fdi check (
    tooth_number is null
    or (dentition_type = 'adult'
      and tooth_number in (11,12,13,14,15,16,17,18,
                            21,22,23,24,25,26,27,28,
                            31,32,33,34,35,36,37,38,
                            41,42,43,44,45,46,47,48))
    or (dentition_type = 'primary'
      and tooth_number in (51,52,53,54,55,
                            61,62,63,64,65,
                            71,72,73,74,75,
                            81,82,83,84,85))
  );

create index idx_treatments_tooth on treatments (patient_id, tooth_number) where tooth_number is not null;

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table patient_teeth enable row level security;
alter table tooth_history enable row level security;

-- ── PATIENT_TEETH — dentist full CRUD, clinic + active-record scoped ────────
-- No receptionist policy: per CLAUDE.md §3, receptionists have no access to
-- clinical treatment detail, and the dental chart is clinical. RLS denies by
-- default in the absence of a matching policy.

create policy "patient_teeth: dentist select"
  on patient_teeth for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

create policy "patient_teeth: dentist insert"
  on patient_teeth for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "patient_teeth: dentist update"
  on patient_teeth for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "patient_teeth: dentist delete"
  on patient_teeth for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

-- Patient portal: read own chart only. Row access is granted here on the base
-- table (RLS predicate below); the `notes` column is additionally excluded
-- at the view layer (patient_dental_chart), not by column-level RLS —
-- mirroring the documented reasoning for patient_treatments/internal_notes.
create policy "patient_teeth: portal read own"
  on patient_teeth for select
  using (patient_id = auth_patient_id() and deleted_at is null);

-- ── TOOTH_HISTORY — staff read only, no client write policy ─────────────────
-- Same shape as appointment_history: the table has no clinic_id column, so
-- clinic scope is resolved by joining through patient_teeth.

create policy "tooth_history: dentist read"
  on tooth_history for select
  using (
    exists (
      select 1 from patient_teeth pt
      where pt.id = tooth_history.patient_tooth_id
        and pt.clinic_id = auth_clinic_id()
        and auth_role() = 'dentist'
    )
  );

-- =============================================================================
-- 6. PATIENT PORTAL VIEW
--
-- Infrastructure only: no patient portal page queries this yet, but it is
-- provided now so a future portal "My Dental Chart" view can be added
-- without a schema change, per CLAUDE.md's future-scalability principles.
-- =============================================================================

create or replace view patient_dental_chart
with (security_invoker = true)
as
  select
    id,
    patient_id,
    dentition_type,
    tooth_number,
    status,
    condition,       -- `notes` deliberately excluded — dentist-only
    updated_at
  from patient_teeth
  where deleted_at is null
    and patient_id = auth_patient_id();

comment on view patient_dental_chart is
  'Portal-safe dental chart view. Excludes the dentist-only `notes` column, '
  'mirroring patient_treatments'' exclusion of internal_notes. Always query '
  'this view from patient-facing code, never patient_teeth directly.';
