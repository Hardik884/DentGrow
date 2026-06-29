-- =============================================================================
-- DentGrow — Dentist Digital Signatures
-- Migration: 20260629000000_dentist_signatures.sql
--
-- Purpose:
--   Add a professional digital-signature capability for dentists, mirroring how
--   real hospitals/clinics handle clinician signatures: a dentist uploads their
--   signature ONCE, it is stored securely, and it is automatically resolved onto
--   every completed treatment record shown to patients in the portal.
--
-- What this migration does:
--   1. profiles.signature_url — stores ONLY the public URL / storage reference
--      to the dentist's signature image. NULL = no signature uploaded.
--      The binary image is NEVER stored in PostgreSQL.
--   2. dentist-signatures storage bucket — dedicated bucket for signature files.
--      Object path layout enforces ownership:
--        {clinic_id}/{dentist_id}/signature.png
--   3. Storage RLS policies — only the owning dentist (matching clinic_id AND
--      dentist_id in the object path) may upload / replace / delete their own
--      signature. No dentist can modify another dentist's signature.
--
-- Notes:
--   - The bucket is PUBLIC for reads so the signature can be rendered on
--     patient-facing treatment records without short-lived signed URLs.
--     Object paths are namespaced by clinic_id + dentist_id (UUIDs) and are not
--     enumerable. Write/replace/delete remain strictly owner-scoped.
--   - Signatures are NOT duplicated onto treatment rows. Treatments reference the
--     dentist via appointments.dentist_id; the signature is resolved from the
--     dentist's profile at read time.
--   - Idempotent where Postgres allows it.
-- =============================================================================

-- =============================================================================
-- 1. profiles.signature_url
-- =============================================================================

alter table profiles
  add column if not exists signature_url text;

comment on column profiles.signature_url is
  'Public URL / storage reference to the dentist''s uploaded signature image. '
  'NULL = no signature. The binary is stored in the dentist-signatures bucket, '
  'never in PostgreSQL. Resolved onto completed treatments shown to patients.';

-- =============================================================================
-- 2. STORAGE BUCKET — dentist-signatures
--
-- Public read; owner-scoped write. Object path layout:
--   {clinic_id}/{dentist_id}/signature.png
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('dentist-signatures', 'dentist-signatures', true)
on conflict (id) do nothing;

-- =============================================================================
-- 3. STORAGE RLS POLICIES — owner-scoped (clinic_id + dentist_id)
--
-- The first path segment must equal the caller's clinic_id and the second path
-- segment must equal the caller's own auth.uid() (the dentist_id). Combined with
-- the dentist role check, this guarantees a dentist can only upload, replace, or
-- delete THEIR OWN signature within THEIR OWN clinic folder.
--
-- Reads are served via the public bucket endpoint, so no SELECT policy is
-- required for rendering. The SELECT policy below is added only so authenticated
-- staff tooling (listing/management) works consistently within their own clinic.
-- =============================================================================

-- Authenticated staff can read signature objects in their own clinic folder.
create policy "dentist-signatures: staff read own clinic"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dentist-signatures'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
  );

-- Dentist can upload ONLY their own signature (clinic + dentist ownership).
create policy "dentist-signatures: owner dentist insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dentist-signatures'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and auth_role() = 'dentist'
  );

-- Dentist can replace (upsert/overwrite) ONLY their own signature.
create policy "dentist-signatures: owner dentist update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dentist-signatures'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and auth_role() = 'dentist'
  )
  with check (
    bucket_id = 'dentist-signatures'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and auth_role() = 'dentist'
  );

-- Dentist can delete ONLY their own signature.
create policy "dentist-signatures: owner dentist delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dentist-signatures'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
