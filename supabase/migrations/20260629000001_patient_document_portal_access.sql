-- =============================================================================
-- Patient Portal — treatment document read access
--
-- The patient-documents bucket (created in 20260623000000) only granted read
-- access to staff (dentist + receptionist). Patients viewing their own
-- treatment documents in the portal therefore could not generate signed URLs.
--
-- Object paths are namespaced as:  {clinic_id}/{patient_id}/{treatment_id}/{file}
-- so the second path segment is the patient_id. We scope patient reads to the
-- folder matching their own linked patient record (auth_patient_id()).
--
-- This mirrors the existing row-level policy on the treatment_documents table
-- ("treatment_documents: portal read own") and introduces no cross-clinic or
-- cross-patient exposure.
-- =============================================================================

-- Patient can read objects belonging to their own patient record (portal).
create policy "patient-documents: patient read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[2] = auth_patient_id()::text
  );
