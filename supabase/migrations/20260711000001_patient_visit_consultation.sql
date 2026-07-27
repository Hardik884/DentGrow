-- =============================================================================
-- Patient Visit consultation workflow
--
-- 1. Adds structured clinical fields to appointments so the Patient Visit page
--    mirrors a real dental consultation:
--      - chief_complaints       (receptionist + dentist)
--      - medical_history jsonb  (receptionist + dentist)
--          { hypertension, diabetes, pregnancy_lactation, notes }
--      - oral_findings          (dentist only)
--      - provisional_diagnosis  (dentist only)
--    Field-level role permissions are enforced in the server action layer.
--
-- 2. Generalises treatment_documents to also store appointment-scoped
--    radiographic documents (IOPA / OPG / CBCT), reusing the existing
--    patient-documents storage bucket and metadata table (no duplicate infra):
--      - treatment_id becomes nullable
--      - appointment_id added (nullable)
--      - document_type added (e.g. IOPA / OPG / CBCT / Other)
--      - a row must reference EITHER a treatment OR an appointment
-- =============================================================================

-- ── 1. Appointment clinical fields ──────────────────────────────────────────
alter table appointments
  add column if not exists chief_complaints      text,
  add column if not exists medical_history       jsonb,
  add column if not exists oral_findings          text,
  add column if not exists provisional_diagnosis  text;

comment on column appointments.chief_complaints is
  'Patient chief complaints captured before/at the consultation. '
  'Editable by receptionist and dentist.';
comment on column appointments.medical_history is
  'Structured medical history: { hypertension, diabetes, pregnancy_lactation, notes }. '
  'Editable by receptionist and dentist.';
comment on column appointments.oral_findings is
  'Oral & radiographic findings. Editable by dentist only.';
comment on column appointments.provisional_diagnosis is
  'Provisional diagnosis. Editable by dentist only.';

-- ── 2. Appointment-scoped documents on treatment_documents ──────────────────
alter table treatment_documents
  alter column treatment_id drop not null;

alter table treatment_documents
  add column if not exists appointment_id uuid references appointments (id) on delete cascade,
  add column if not exists document_type  text;

-- A document must be attached to either a treatment or an appointment.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_treatment_documents_scope'
  ) then
    alter table treatment_documents
      add constraint chk_treatment_documents_scope
      check (treatment_id is not null or appointment_id is not null);
  end if;
end $$;

create index if not exists idx_treatment_documents_appointment
  on treatment_documents (appointment_id);

comment on column treatment_documents.appointment_id is
  'Set for appointment-scoped radiographic documents (IOPA/OPG/CBCT). '
  'Mutually complementary with treatment_id — exactly one scope per row.';
comment on column treatment_documents.document_type is
  'Optional document category, e.g. IOPA, OPG, CBCT, Other.';

-- ── RLS: allow staff (dentist + receptionist) to manage appointment docs ────
-- Existing treatment-scoped policies (dentist-only insert/delete) are left
-- untouched. These additional policies apply ONLY to appointment-scoped rows.
create policy "treatment_documents: staff insert appointment docs"
  on treatment_documents for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() in ('dentist', 'receptionist')
    and appointment_id is not null
  );

create policy "treatment_documents: staff delete appointment docs"
  on treatment_documents for delete
  using (
    clinic_id = auth_clinic_id()
    and auth_role() in ('dentist', 'receptionist')
    and appointment_id is not null
  );

-- ── Storage: appointment radiographs live under an /appointments/ folder ────
-- Path layout: {clinic_id}/{patient_id}/appointments/{appointment_id}/{file}
-- The clinic-folder read policy already covers SELECT. These add receptionist
-- (and dentist) insert/delete on the appointment sub-folder only.
create policy "patient-documents: staff insert appointment folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[3] = 'appointments'
    and auth_role() in ('dentist', 'receptionist')
  );

create policy "patient-documents: staff delete appointment folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[3] = 'appointments'
    and auth_role() in ('dentist', 'receptionist')
  );
