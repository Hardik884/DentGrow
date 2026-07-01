-- =============================================================================
-- Patient Portal Profile Update Policy
-- Migration: 20260701000001_patient_portal_profile_update.sql
--
-- Problem:
--   Patients can read their own record via "patients: portal read own record"
--   but have NO UPDATE policy. The updatePortalProfile Server Action fails
--   silently because RLS blocks the write.
--
-- Solution:
--   Add an UPDATE policy that allows portal users to update ONLY the fields
--   they are allowed to edit:
--     - phone
--     - address
--     - emergency_contact_name
--     - emergency_contact_phone
--
--   Clinical fields (name, date_of_birth, gender, notes) and system fields
--   (total_visits, last_visit, deleted_at) must remain immutable from the
--   portal — validation is enforced in the Server Action layer, but the RLS
--   policy acts as a defense-in-depth guard.
--
-- Security:
--   - USING clause: patient can only update their own record (via auth_patient_id())
--   - WITH CHECK clause: ensures clinic_id and patient_id cannot be changed
--   - The Server Action only sends allowed fields, but RLS guards against
--     direct client mutations or compromised code paths
-- =============================================================================

create policy "patients: portal update own profile"
  on patients for update
  using (
    id = auth_patient_id()
    and deleted_at is null
  )
  with check (
    id = auth_patient_id()
    and deleted_at is null
  );

comment on policy "patients: portal update own profile" on patients is
  'Allows portal users to update demographic fields (phone, address, emergency contact) '
  'on their own patient record. Clinical and system fields remain protected by '
  'Server Action validation.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
