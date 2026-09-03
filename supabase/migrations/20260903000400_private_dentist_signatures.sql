-- =============================================================================
-- MAKE THE DENTIST-SIGNATURE BUCKET PRIVATE
-- Migration: 20260903000400_private_dentist_signatures.sql
--
-- WHAT WAS WRONG
--   20260629000000 created `dentist-signatures` with public = true. Its own
--   comment is candid about the reasoning: reads are served publicly "so the
--   signature can be rendered on patient-facing treatment records without
--   short-lived signed URLs," and the paths "are namespaced by clinic_id +
--   dentist_id (UUIDs) and are not enumerable."
--
--   The write-side controls really are strict — a dentist can only ever touch
--   their own object, in their own clinic folder. But the object is a DENTIST'S
--   HANDWRITTEN SIGNATURE: the mark that authenticates a prescription and a
--   clinical record. Unenumerable is not unreachable. The URL is written into
--   profiles.signature_url and rendered in patient-facing HTML, so it leaks
--   through browser history, referrer headers, CDN caches, a saved page, a
--   forwarded PDF, and any patient who right-clicks. Anyone who obtains one can
--   reproduce a dentist's signature indefinitely.
--
--   This is a forgery and professional-integrity risk rather than a patient-data
--   one, which is why it was never a P0. It is also a two-line fix.
--
-- THE FIX
--   Flip the bucket to private and let the existing storage RLS decide reads,
--   the way patient-documents and consent-documents already work. The
--   application mints a signed URL at render time
--   (lib/signatures/resolve.ts).
--
-- THE POLICY THAT HAD TO BE ADDED
--   With a public bucket, patient-facing rendering needed no SELECT policy at
--   all — the public endpoint served it. Made private, a patient reading their
--   own prescription would suddenly be unable to see the dentist's signature on
--   it, which is a visible regression in the portal.
--
--   So this adds a patient SELECT policy scoped to the patient's OWN clinic
--   folder. A patient may see the signature of a dentist at the clinic they are
--   a patient of, and no further. That is a genuine widening compared to the
--   staff-only policy that existed — and it is a large narrowing compared to
--   "anyone on the internet with the URL", which is what it replaces.
--
-- BACKWARDS COMPATIBILITY
--   profiles.signature_url currently holds absolute public URLs. Those rows are
--   NOT rewritten here: lib/signatures/resolve.ts recognises a stored public URL,
--   extracts the object path from it, and signs that — so existing signatures
--   keep rendering with no data migration and no window where a clinic's
--   prescriptions lose their signature. New uploads store the path.
--
--   A public URL for a now-private bucket simply 404s if anyone still holds one,
--   which is the desired outcome for a link that has already leaked.
-- =============================================================================

update storage.buckets
   set public = false
 where id = 'dentist-signatures';

-- Reads for the patients of the clinic. Path layout is
-- {clinic_id}/{dentist_id}/signature.png, so segment 1 is the clinic — and
-- auth_patient_id() resolving to a row is what proves the caller is a portal
-- patient rather than a signed-in staff member of somewhere else.
create policy "dentist-signatures: portal read own clinic"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dentist-signatures'
    and (storage.foldername(name))[1] = (select auth_clinic_id())::text
    and (select auth_patient_id()) is not null
  );

-- NOTE ON THE MISSING `comment on policy`
--   The rationale above would normally be attached to the policy itself with
--   `comment on policy ... on storage.objects`. It cannot be: COMMENT requires
--   ownership of the relation, and storage.objects is owned by
--   supabase_storage_admin, not by postgres (the role the CLI runs migrations
--   as). Attempting it aborts the whole migration with
--
--     ERROR: must be owner of relation objects (SQLSTATE 42501)
--
--   CREATE POLICY on storage.objects is separately granted and does work, which
--   is why every storage policy in this repository is created without a comment.
--   The explanation therefore lives here instead:
--
--   A portal patient may read the signature of a dentist AT THEIR OWN CLINIC,
--   because it is rendered on their prescriptions, treatment records and
--   consents. Added when the bucket stopped being world-readable — without it,
--   making the bucket private would have silently blanked those signatures.

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
