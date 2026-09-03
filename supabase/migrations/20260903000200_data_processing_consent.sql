-- =============================================================================
-- DATA-PROCESSING CONSENT
-- Migration: 20260903000200_data_processing_consent.sql
--
-- WHAT ALREADY EXISTS, AND IS NOT TOUCHED
--   OraMedha has a good consent system: consent_templates,
--   consent_template_versions, consents and consent_audit
--   (20260816000000). It is CLINICAL consent — "I agree to this root canal" —
--   with versioned templates, a frozen content_snapshot, an append-only audit
--   trail, and immutability of signed rows enforced in the RLS predicate rather
--   than in application code. None of that changes here. Nothing in this
--   migration reads, writes or constrains those tables.
--
-- WHY A SEPARATE MODEL RATHER THAN MORE TEMPLATES
--   Consenting to a PROCEDURE and consenting to the PROCESSING OF YOUR DATA are
--   different acts with different properties, and collapsing them makes both
--   worse:
--
--     - Clinical consent is per-episode and permanent. You consented to that
--       extraction, on that day; it cannot be withdrawn afterwards because it
--       already happened. Data-processing consent is standing and MUST be
--       withdrawable.
--     - Clinical consent is indivisible. Data-processing consent is not: a
--       patient may want appointment reminders and not marketing, and forcing
--       one to obtain the other is precisely the coupling to avoid.
--     - Clinical consent is signed, with a signature image. Data-processing
--       consent is a choice, recorded with what the person was shown.
--
--   Bolting categories onto consent_templates would have meant a "consent" that
--   can be revoked living in a table whose entire design is built on the
--   promise that signed rows never change.
--
-- THE SHAPE
--   Two tables, and the split is the important part:
--
--     data_consent_notices  — WHAT was said, versioned. The plain-language
--                             sentence a person was shown, and where the full
--                             policy lives.
--     data_consent_records  — WHAT they decided, append-only. One row per
--                             decision, never updated, carrying a FROZEN COPY
--                             of the notice as it read at that moment.
--
--   The snapshot is the point. A notice can be revised; what a person agreed to
--   cannot be revised retroactively. Storing only a version number would mean
--   the historical record depended on a row someone could later edit, which is
--   the same reasoning that put content_snapshot on `consents`.
--
-- WITHDRAWAL NEVER OVERWRITES
--   Withdrawing is a NEW ROW with decision = 'withdrawn'. The grant stays in
--   the table. Deleting the grant would destroy the answer to "was this
--   lawful at the time we did it", which is the only question the record is
--   ever asked. Current state is derived by the view at the bottom of this file.
--
-- WHO MAY RECORD A DECISION
--   Nobody, from a browser. There is no client INSERT policy on either table —
--   the same shape consent_audit uses. Writes go through the service role in
--   actions/data-consent.ts, which is what guarantees the snapshot matches a
--   real notice rather than something a client composed.
--
--   `actor` records whether the person themselves chose, or a staff member
--   recorded a choice on their behalf at the front desk. Those are not the same
--   evidence and the table refuses to blur them. A staff member's operational
--   access to a record is never, anywhere, treated as the patient's consent.
--
-- WHAT THIS DOES NOT DECIDE
--   Whether consent is the correct lawful basis for any given category, whether
--   a clinic may rely on legitimate interest for appointment reminders, and
--   what a patient must be told. Those are legal questions and this migration
--   deliberately answers none of them — it provides the mechanism to record
--   whatever answer counsel gives. See docs/DATA-PROTECTION.md.
-- =============================================================================

-- =============================================================================
-- 1. TYPES
-- =============================================================================

create type data_consent_category as enum (
  -- Processing the patient's personal and clinical data to provide care
  -- through OraMedha at this clinic.
  'data_processing',
  -- Operational contact: appointment reminders, recalls, results ready.
  'communications',
  -- Promotional contact. Deliberately its own category so it can be refused
  -- without affecting anything else — a patient who declines this must still
  -- get their appointment reminders and their treatment.
  'marketing',
  -- AI-assisted processing of their record (e.g. the Patient Summary feature,
  -- which sends a minimised, unnamed extract to a third-party model).
  'ai_assisted'
);

comment on type data_consent_category is
  'Independent categories of data-processing consent. Independence is the point: '
  'refusing marketing must never withhold care or operational messages.';

create type data_consent_decision as enum ('granted', 'withdrawn');

create type data_consent_actor as enum (
  -- The patient chose, themselves, in the portal.
  'patient',
  -- A staff member recorded a choice the patient made in person or by phone.
  -- Weaker evidence, and marked as such rather than silently equated.
  'staff'
);

-- =============================================================================
-- 2. NOTICES — the versioned text a person was actually shown
-- =============================================================================

create table data_consent_notices (
  id             uuid                  primary key default gen_random_uuid(),

  -- NULL means a platform-wide default that every clinic inherits. A clinic row
  -- overrides the default for that clinic and category. Modelled this way so a
  -- clinic that needs its own wording can have it without every clinic being
  -- required to author four notices before the feature works at all.
  clinic_id      uuid                  references clinics (id) on delete cascade,

  category       data_consent_category not null,
  version        integer               not null check (version >= 1),
  locale         text                  not null default 'en',

  -- The one sentence a person reads next to the toggle. Plain language, no
  -- legal block — the full document lives on the marketing site and is linked.
  summary        text                  not null,
  -- Absolute URL of the canonical policy. Not a route in this app: the policy
  -- is published once, by the marketing site (see lib/legal/links.ts).
  policy_url     text,

  effective_from timestamptz           not null default now(),
  created_at     timestamptz           not null default now(),

  unique (clinic_id, category, version, locale)
);

comment on table data_consent_notices is
  'Versioned, immutable notice text for each data-processing consent category. '
  'A row with clinic_id IS NULL is the platform default inherited by every '
  'clinic. Never edited in place — a change means a new version, so a decision '
  'recorded against version 1 keeps meaning what it meant.';

-- The lookup the application makes: "the current notice for this clinic and
-- category". Partial on the default rows so inheriting is as cheap as overriding.
create index idx_data_consent_notices_lookup
  on data_consent_notices (category, locale, version desc);
create index idx_data_consent_notices_clinic
  on data_consent_notices (clinic_id, category, version desc)
  where clinic_id is not null;

-- =============================================================================
-- 3. RECORDS — append-only decisions
-- =============================================================================

create table data_consent_records (
  id              uuid                  primary key default gen_random_uuid(),

  clinic_id       uuid                  not null references clinics (id) on delete cascade,
  patient_id      uuid                  not null references patients (id) on delete cascade,

  category        data_consent_category not null,
  decision        data_consent_decision not null,

  -- Which notice was shown. `set null` rather than cascade: losing the notice
  -- row must not erase the decision, and the snapshot below preserves the text
  -- regardless.
  notice_id       uuid                  references data_consent_notices (id) on delete set null,
  notice_version  integer               not null,

  -- A FROZEN copy of the notice as it read at the moment of the decision:
  -- { summary, policy_url, locale, category, version }. This, not notice_id, is
  -- what makes the record evidence.
  notice_snapshot jsonb                 not null,

  actor           data_consent_actor    not null,
  -- Who operated the interface. For actor='patient' this is their own profile;
  -- for actor='staff' it is the member of staff who recorded it.
  recorded_by     uuid                  references profiles (id) on delete set null,
  recorded_by_role user_role            not null,

  -- Where the decision was taken, e.g. 'portal-privacy-choices', 'front-desk'.
  -- A fixed vocabulary set by the application, never free text from a user.
  source          text                  not null,

  occurred_at     timestamptz           not null default now()
);

comment on table data_consent_records is
  'Append-only ledger of data-processing consent decisions. A withdrawal is a '
  'NEW ROW, never an edit or a delete — destroying the grant would destroy the '
  'answer to "was this lawful at the time". Current state is the '
  'patient_data_consent_state view. Written by the service role only; there is '
  'no client write policy.';

comment on column data_consent_records.notice_snapshot is
  'What the person was actually shown, frozen. Independent of the notice row, '
  'which may later be superseded.';

comment on column data_consent_records.actor is
  '''patient'' = they chose it themselves in the portal. ''staff'' = a member of '
  'staff recorded a choice made in person or by phone. Deliberately distinct: '
  'staff access to a record is NEVER evidence of the patient''s consent.';

-- "What is this patient's current position" is answered by the view below,
-- which needs the latest row per (patient, category).
create index idx_data_consent_records_current
  on data_consent_records (patient_id, category, occurred_at desc);
create index idx_data_consent_records_clinic
  on data_consent_records (clinic_id, occurred_at desc);

-- =============================================================================
-- 4. IMMUTABILITY
-- =============================================================================
--
-- Same reasoning, and the same mechanism, as phi_access_log
-- (20260903000000): RLS keeps client sessions out, and this keeps the SERVICE
-- ROLE honest — service_role carries BYPASSRLS, so no policy can constrain it.
-- A consent ledger the application can silently rewrite is not evidence of
-- anything.
--
-- Notices are immutable for a different but related reason: a decision recorded
-- against version 1 must keep meaning what version 1 said. Revising a notice
-- means inserting a new version.

create or replace function data_consent_is_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      '% is append-only: record a new row instead of editing this one', tg_table_name
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purge_context', true), '') <> 'retention' then
    raise exception
      '% rows may only be deleted by the retention purge', tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

comment on function data_consent_is_append_only() is
  'Blocks UPDATE outright and DELETE outside a declared retention purge, on both '
  'consent tables. Binds the service role, which RLS cannot.';

create trigger trg_data_consent_records_append_only
  before update or delete on data_consent_records
  for each row execute function data_consent_is_append_only();

create trigger trg_data_consent_notices_append_only
  before update or delete on data_consent_notices
  for each row execute function data_consent_is_append_only();

-- =============================================================================
-- 5. CURRENT STATE
-- =============================================================================
--
-- security_invoker = true. Not optional, and not a detail: a view without it
-- runs as its owner and bypasses RLS entirely, which is exactly the defect that
-- exposed every patient record through active_patients and its four siblings
-- (see 20260902155414). Any view added to this schema must carry it, and
-- actions/__tests__/view-security-invoker.spec.ts must gain a row for it.

create view patient_data_consent_state
with (security_invoker = true) as
select distinct on (r.patient_id, r.category)
  r.patient_id,
  r.clinic_id,
  r.category,
  r.decision,
  r.notice_version,
  r.actor,
  r.occurred_at
from data_consent_records r
order by r.patient_id, r.category, r.occurred_at desc, r.id desc;

comment on view patient_data_consent_state is
  'The latest decision per (patient, category) — i.e. where each patient stands '
  'right now. Derived, never stored: the ledger is the source of truth. '
  'security_invoker = true, so RLS on data_consent_records is evaluated as the '
  'CALLER. Never remove that option.';

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

alter table data_consent_notices enable row level security;
alter table data_consent_records enable row level security;

-- ── NOTICES ────────────────────────────────────────────────────────────────
-- Readable by anyone signed in whose clinic it applies to, plus the platform
-- defaults. Patients need this to see what they are being asked; staff need it
-- to record a choice at the front desk. No write policy: notices are authored
-- by migration or by the service role.

create policy "data_consent_notices: read applicable"
  on data_consent_notices for select
  to authenticated
  using (
    clinic_id is null
    or clinic_id = (select auth_clinic_id())
  );

comment on policy "data_consent_notices: read applicable" on data_consent_notices is
  'Platform defaults (clinic_id IS NULL) plus this clinic''s own overrides. '
  'Notice text is not confidential — it is what people are shown — but there is '
  'still no reason for one clinic to read another''s wording.';

-- ── RECORDS ────────────────────────────────────────────────────────────────
-- A patient sees their own decisions. Staff see their own clinic's, because
-- honouring a withdrawal requires knowing about it — a receptionist about to
-- send a reminder must be able to see that the patient opted out.
--
-- No INSERT, UPDATE or DELETE policy for any role. Under RLS, absence is
-- denial. Writes go through actions/data-consent.ts on the service role.

create policy "data_consent_records: portal read own"
  on data_consent_records for select
  to authenticated
  using (patient_id = (select auth_patient_id()));

create policy "data_consent_records: staff read own clinic"
  on data_consent_records for select
  to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('dentist', 'receptionist')
  );

-- =============================================================================
-- 7. GRANTS
-- =============================================================================
--
-- 20260727000002 granted DML on the tables that existed then. These are new, so
-- they are granted explicitly and narrowly. anon gets nothing.

revoke all on data_consent_notices        from anon;
revoke all on data_consent_records        from anon;
revoke all on patient_data_consent_state  from anon;

grant select on data_consent_notices       to authenticated;
grant select on data_consent_records       to authenticated;
grant select on patient_data_consent_state to authenticated;

grant select, insert on data_consent_notices to service_role;
grant select, insert on data_consent_records to service_role;
grant select        on patient_data_consent_state to service_role;

-- =============================================================================
-- 8. PLATFORM DEFAULT NOTICES (version 1)
-- =============================================================================
--
-- Seeded so the feature works in every environment on day one without each
-- clinic authoring four notices first. The wording is deliberately plain and
-- deliberately modest: it describes what the software actually does and makes
-- no claim about legal basis, retention period, or compliance with any
-- particular regime. Those belong in the published policy, and revising this
-- text means inserting version 2 — never editing these rows, which the
-- append-only trigger enforces.
--
-- policy_url is left NULL rather than hardcoding a domain into the database.
-- The application supplies the link from lib/legal/links.ts, which is
-- configurable per deployment; a URL frozen into a migration would outlive the
-- domain it names.

insert into data_consent_notices (clinic_id, category, version, locale, summary)
values
  (null, 'data_processing', 1, 'en',
   'Your clinic stores your personal and dental records in OraMedha so it can '
   'provide and manage your care. This is the record of your treatment at this '
   'clinic.'),

  (null, 'communications', 1, 'en',
   'Your clinic may contact you about your own appointments — reminders, '
   'changes, and follow-up visits that are due.'),

  (null, 'marketing', 1, 'en',
   'Your clinic may send you offers, health tips and news about the practice. '
   'This is optional and separate: turning it off does not affect your care or '
   'your appointment reminders.'),

  (null, 'ai_assisted', 1, 'en',
   'Your clinic may use an AI assistant to help summarise your record for the '
   'dentist. It receives a shortened extract without your name or contact '
   'details, and it never decides anything about your treatment.');

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
