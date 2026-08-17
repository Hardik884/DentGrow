-- =============================================================================
-- DentGrow — Patient Consent Forms: portal shows all non-cancelled consents
-- Migration: 20260817000000_portal_consent_all_statuses.sql
--
-- Purpose:
--   Digital signing is optional. A patient may receive a consent as a draft,
--   download/print it, sign it physically, and have the clinic upload the
--   signed copy. To support this workflow the patient portal must show ALL
--   non-cancelled consents — not only signed ones.
--
--   Changes:
--     1. Recreate the patient_consents portal view WITHOUT the
--        `status = 'signed'` filter (still excludes cancelled + deleted).
--     2. Replace the RLS policy on the base `consents` table so patients
--        can read their own non-signed consents too (was: only signed).
--
--   The view and RLS still scope to `patient_id = auth_patient_id()` and
--   `deleted_at IS NULL`, so only the patient's own active consents are
--   visible. Cancelled consents stay hidden (they are abandoned and
--   irrelevant to the patient).
-- =============================================================================

-- 1. Update the portal-safe view
create or replace view patient_consents
with (security_invoker = true)
as
  select
    id,
    patient_id,
    treatment_id,
    appointment_id,
    template_key,
    template_name,
    template_version,
    source,
    status,
    content_snapshot,
    patient_signed_name,
    patient_signature,
    signed_at,
    file_name,
    file_type,
    created_at
  from consents
  where deleted_at is null
    and status <> 'cancelled'
    and patient_id = auth_patient_id();

comment on view patient_consents is
  'Portal-safe consent view. Exposes the authenticated patient''s non-cancelled '
  'consents (draft, ready_to_sign, signed) so they can view, download, or print '
  'before digital signing. Cancelled consents are hidden. RLS on the base table '
  'enforces the same ownership scope.';

-- 2. Replace the base-table RLS policy (was: status = 'signed' only)
drop policy if exists "consents: portal read own signed" on consents;

create policy "consents: portal read own active"
  on consents for select
  using (
    patient_id = auth_patient_id()
    and deleted_at is null
    and status <> 'cancelled'
  );
