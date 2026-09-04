-- =============================================================================
-- patients.email — the clinic-issued key to portal access
-- Migration: 20260904184013_patient_email_and_portal_activation.sql
--
-- WHY THIS EXISTS
--   Portal signup asked the patient which clinic they attend, then matched them
--   to a record by PHONE inside it (actions/portal-link.ts). Two things were
--   wrong with that:
--
--     1. The clinic came from the browser. It was validated against `clinics`
--        before use, so it was never a tenant-isolation hole — but it let
--        anyone pick any clinic and then try to match a phone number in it.
--     2. Phone is not unique, even within one clinic
--        (20260822000000_drop_patient_phone_uniqueness.sql: households and
--        parents booking for children legitimately share a number). Matching on
--        it meant guessing which family member was signing up.
--
--   Eligibility now runs the other way round. A clinic puts an email on a
--   patient record; that email, and only that email, can activate a portal
--   account, and the clinic comes from the record rather than from the person
--   claiming it. Nothing about tenancy is ever asserted by the browser.
--
-- EMAIL IS OPTIONAL, DELIBERATELY
--   Most patients never use the portal, and a clinic must still be able to
--   create a record for a walk-in with nothing but a name. NULL email simply
--   means "no portal access", which is the correct default rather than a
--   missing value to be chased.
--
-- THE UNIQUENESS RULE, AND WHAT IT DOES NOT SAY
--   uq_patients_clinic_email_active makes an address unique among ACTIVE
--   patients WITHIN one clinic. That is the constraint that has to hold: two
--   records in the same clinic sharing an address makes "which record does this
--   person own" unanswerable, and the answer would decide what clinical history
--   they see.
--
--   It deliberately does NOT constrain the same address across DIFFERENT
--   clinics. A person really can be a patient of two practices, and forbidding
--   that would be modelling a database convenience as a fact about people.
--   Activation resolves that ambiguity by REFUSING when an address matches
--   active records in more than one clinic — see resolveActivationCandidate in
--   actions/portal-activation.ts. Refusing is right: nothing in an email address
--   says which clinic the person meant, and picking one would silently expose
--   one clinic's record to someone who meant the other.
--
--   Scoped to `deleted_at is null` so a soft-deleted record never blocks a
--   clinic from re-issuing the address, and matching the shape of every other
--   partial index here.
--
--   Case-insensitive: addresses are compared lower-cased everywhere in the
--   application, so the index has to agree or the constraint could be walked
--   around with a capital letter.
--
-- NO RLS CHANGES
--   email is a column on an existing table. Every policy on `patients` is row
--   scoped by clinic_id and role and applies to it unchanged. The activation
--   lookup runs through the service role in a Server Action — the same pattern
--   resolveResetAudience uses — because an unauthenticated visitor has no
--   session to be scoped by, and must not be given one before they prove
--   control of the address.
-- =============================================================================

alter table patients
  add column if not exists email text;

comment on column patients.email is
  'Clinic-issued contact address. OPTIONAL — NULL means this patient has no '
  'portal access, which is the normal case. When set, it is the ONLY thing that '
  'can activate a portal account for this record, and the clinic is taken from '
  'this row rather than from anything the browser claims.';

-- ── Uniqueness within a clinic ────────────────────────────────────────────────

create unique index if not exists uq_patients_clinic_email_active
  on patients (clinic_id, lower(email))
  where deleted_at is null and email is not null;

comment on index uq_patients_clinic_email_active is
  'One active patient per address per clinic. Case-insensitive, because the '
  'application compares addresses lower-cased and a capital letter must not be '
  'a way around it. Across clinics the same address is allowed — a person can '
  'attend two practices — and activation refuses that case rather than guessing.';

-- ── Lookup path for activation ────────────────────────────────────────────────
-- Activation searches by address across all clinics precisely so it can detect
-- the ambiguous case, so this index is not clinic-scoped.

create index if not exists idx_patients_email_active
  on patients (lower(email))
  where deleted_at is null and email is not null;

comment on index idx_patients_email_active is
  'Supports the activation lookup, which searches every clinic by address so it '
  'can detect an address matching records in more than one and refuse.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
