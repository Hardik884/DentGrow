-- =============================================================================
-- DentGrow — Product Updates
-- Migration: 20260623000000_dentgrow_product_updates.sql
--
-- Adds:
--   1. treatments.medications (jsonb)        — structured medication list
--   2. treatment_documents table             — file-upload metadata
--   3. patient-documents storage bucket       — private bucket + RLS policies
--
-- Notes:
--   - Storage stores files; the database stores ONLY metadata.
--   - Documents are clinic-isolated, linked to clinic/patient/treatment.
--   - All policies enforce clinic isolation via auth_clinic_id().
--   - Idempotent where Postgres allows it.
-- =============================================================================

-- =============================================================================
-- 1. MEDICATIONS ON TREATMENTS
--
-- Stored as a JSONB array of objects:
--   [{ "name": "Amoxicillin", "dosage": "od", "number": 1, "days": 5 }, ...]
-- Kept inline on the treatment row (1-to-1 lifecycle with the treatment).
-- =============================================================================

alter table treatments
  add column if not exists medications jsonb not null default '[]'::jsonb;

comment on column treatments.medications is
  'Structured medication list: [{ name, dosage, number, days }]. '
  'Edited together with the treatment; not a separate entity.';

-- =============================================================================
-- 2. TREATMENT DOCUMENTS (metadata only)
--
-- One row per uploaded file. The binary lives in the patient-documents
-- storage bucket; this table records where it is and what it belongs to.
-- =============================================================================

create table if not exists treatment_documents (
  id            uuid        primary key default gen_random_uuid(),
  clinic_id     uuid        not null references clinics (id)    on delete cascade,
  patient_id    uuid        not null references patients (id)   on delete cascade,
  treatment_id  uuid        not null references treatments (id) on delete cascade,
  file_name     text        not null,
  file_path     text        not null,         -- path/key within the storage bucket
  file_type     text        not null,         -- mime type (application/pdf, image/png, ...)
  file_size     integer,                       -- bytes (nullable — not always known)
  created_by    uuid        references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table treatment_documents is
  'Metadata for files uploaded against a treatment. Binaries live in the '
  'patient-documents storage bucket. Clinic-isolated via clinic_id.';

create index if not exists idx_treatment_documents_treatment
  on treatment_documents (treatment_id);
create index if not exists idx_treatment_documents_patient
  on treatment_documents (patient_id);
create index if not exists idx_treatment_documents_clinic
  on treatment_documents (clinic_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table treatment_documents enable row level security;

-- Staff (dentist + receptionist) can read documents in their clinic.
create policy "treatment_documents: staff read own clinic"
  on treatment_documents for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() in ('dentist', 'receptionist')
  );

-- Dentist can insert documents in their clinic.
create policy "treatment_documents: dentist insert"
  on treatment_documents for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- Dentist can delete documents in their clinic.
create policy "treatment_documents: dentist delete"
  on treatment_documents for delete
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- Patient can read documents linked to their own patient record (portal).
create policy "treatment_documents: portal read own"
  on treatment_documents for select
  using (patient_id = auth_patient_id());

-- =============================================================================
-- 3. STORAGE BUCKET — patient-documents
--
-- Private bucket. Object paths are namespaced by clinic_id so policies can
-- enforce clinic isolation:  {clinic_id}/{patient_id}/{treatment_id}/{file}
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

-- Helper: the first path segment is the clinic_id.
-- (storage.foldername(name) returns the path segments as a text[].)

-- Staff (dentist + receptionist) can read objects in their clinic folder.
create policy "patient-documents: staff read own clinic"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('dentist', 'receptionist')
  );

-- Dentist can upload objects to their clinic folder.
create policy "patient-documents: dentist insert own clinic"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() = 'dentist'
  );

-- Dentist can delete objects in their clinic folder.
create policy "patient-documents: dentist delete own clinic"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- 4. ACTIVE-RECORD VIEW REFRESH
-- active_treatments uses SELECT * so it inherits the new medications column
-- automatically. No rebuild required.
-- =============================================================================
