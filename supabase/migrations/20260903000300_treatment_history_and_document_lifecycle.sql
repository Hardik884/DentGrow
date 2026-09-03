-- =============================================================================
-- TREATMENT MODIFICATION HISTORY + DOCUMENT LIFECYCLE
-- Migration: 20260903000300_treatment_history_and_document_lifecycle.sql
--
-- TWO CHANGES, ONE SUBJECT: the integrity of the clinical record.
--
-- 1. TREATMENT HISTORY
--    Appointments have appointment_history. The dental chart has tooth_history.
--    Consents have consent_audit. Treatments — which carry treatment_type, the
--    dentist-only internal_notes, the prescribed medications, the cost and the
--    tooth the work was done on — had nothing.
--
--    So a treatment record could be edited to say something different from what
--    it said yesterday, and there was no way to establish what it used to say
--    or who changed it. That is a clinical-record integrity problem before it
--    is a privacy one: the record of what was done to a person is the thing a
--    later clinician relies on, and a later dispute turns on.
--
--    Deliberately shaped like appointment_history rather than inventing a
--    second pattern: action, old_value, new_value, performed_by, timestamp.
--    old_value/new_value hold ONLY the fields that changed, so a history row
--    reads as a diff and does not become a full second copy of the record.
--
-- 2. DOCUMENT LIFECYCLE
--    treatment_documents — X-rays, clinical photographs, scanned reports — was
--    the one clinical table with a HARD delete. `deleteTreatmentDocument`
--    removed the storage object and then the metadata row, leaving no trace
--    that a radiograph had ever existed. A diagnostic image is part of the
--    clinical record; it should not be quietly removable, and its removal
--    should be attributable.
--
--    Adding deleted_at brings it in line with patients, appointments,
--    treatments, payments and follow_ups (CLAUDE.md §5.11), and lets the
--    application record WHO removed a document and WHEN while the object itself
--    is dealt with by the retention purge rather than immediately.
--
-- WHAT THIS DOES NOT DO
--    It does not retro-fit history rows for edits that already happened. There
--    is no record of those to reconstruct — that is the cost of the gap, and
--    inventing plausible rows would be worse than the gap.
-- =============================================================================

-- =============================================================================
-- 1. TREATMENT HISTORY
-- =============================================================================

create type treatment_history_action as enum (
  'created',
  'updated',
  'status_changed',
  'deleted',
  'restored'
);

comment on type treatment_history_action is
  'What happened to a treatment record. Mirrors appointment_history_action.';

create table treatment_history (
  id           uuid                     primary key default gen_random_uuid(),

  -- Carried explicitly rather than joined through `treatments`, so the history
  -- stays tenant-scoped after the treatment it describes is purged.
  clinic_id    uuid                     not null references clinics (id) on delete cascade,
  treatment_id uuid                     not null references treatments (id) on delete cascade,
  patient_id   uuid                     not null references patients (id) on delete cascade,

  action       treatment_history_action not null,

  -- ONLY the fields that changed, e.g. {"cost": 4500}. Not a snapshot: a full
  -- copy of the record on every edit would make this table a denormalised
  -- duplicate of the clinical record, with the same sensitivity and none of the
  -- same access controls.
  old_value    jsonb,
  new_value    jsonb,

  performed_by uuid                     references profiles (id) on delete set null,
  timestamp    timestamptz              not null default now()
);

comment on table treatment_history is
  'Append-only audit trail for treatment records — what changed, from what, to '
  'what, by whom. Written by the Server Actions that mutate treatments, through '
  'the service role; there is no client write policy. old_value/new_value carry '
  'only the changed fields, never a whole record.';

create index idx_treatment_history_treatment
  on treatment_history (treatment_id, timestamp desc);
create index idx_treatment_history_patient
  on treatment_history (patient_id, timestamp desc);
create index idx_treatment_history_clinic
  on treatment_history (clinic_id, timestamp desc);

-- ── Immutability ───────────────────────────────────────────────────────────
-- Same mechanism as phi_access_log and the consent ledger, and for the same
-- reason: RLS cannot constrain the service role, and an audit trail the
-- application can silently rewrite is not evidence of anything.

create or replace function treatment_history_is_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'treatment_history is append-only: rows cannot be modified'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purge_context', true), '') <> 'retention' then
    raise exception
      'treatment_history rows may only be deleted by the retention purge'
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

create trigger trg_treatment_history_append_only
  before update or delete on treatment_history
  for each row execute function treatment_history_is_append_only();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Staff read their own clinic's history. No client write policy of any kind —
-- writes come from the Server Actions through the service role, exactly as
-- appointment_history and consent_audit already work.
--
-- No patient-portal read policy. A patient sees their treatments; the edit
-- trail of the clinician's own record-keeping is a professional artefact, and
-- exposing it through the portal is a product decision nobody has made.

alter table treatment_history enable row level security;

create policy "treatment_history: staff read own clinic"
  on treatment_history for select
  to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('dentist', 'receptionist')
  );

revoke all on treatment_history from anon;
grant select on treatment_history to authenticated;
grant select, insert on treatment_history to service_role;

-- =============================================================================
-- 2. DOCUMENT SOFT DELETE
-- =============================================================================

alter table treatment_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references profiles (id) on delete set null;

comment on column treatment_documents.deleted_at is
  'Soft-delete marker. NULL = live. A removed X-ray leaves a row behind so that '
  'the removal is attributable and the storage object can be cleared by the '
  'retention purge rather than vanishing at the moment of the click.';

comment on column treatment_documents.deleted_by is
  'Who removed it. Null for rows removed before this column existed.';

-- Every read filters on deleted_at, so the index that serves the common lookup
-- is the partial one.
drop index if exists idx_treatment_documents_treatment;
create index idx_treatment_documents_treatment
  on treatment_documents (treatment_id) where deleted_at is null;

-- Deletion-eligible rows, for the retention purge.
create index idx_treatment_documents_deleted
  on treatment_documents (deleted_at) where deleted_at is not null;

-- ── RLS: exclude soft-deleted rows from every read ─────────────────────────
--
-- CLAUDE.md §13.14 requires the deleted_at filter in the POLICY and not only in
-- the query — an action that forgets the filter must still see nothing. The
-- existing read policies predate the column, so they are recreated.
--
-- The DELETE policy is dropped and not replaced. Removing a document is now an
-- UPDATE that sets deleted_at, and leaving a DELETE policy in place would leave
-- the hard-delete route open next to the soft one.

drop policy if exists "treatment_documents: staff read own clinic"        on treatment_documents;
drop policy if exists "treatment_documents: portal read own"              on treatment_documents;
drop policy if exists "treatment_documents: dentist delete"               on treatment_documents;
drop policy if exists "treatment_documents: staff delete appointment docs" on treatment_documents;

create policy "treatment_documents: staff read own clinic"
  on treatment_documents for select
  to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('dentist', 'receptionist')
    and deleted_at is null
  );

create policy "treatment_documents: portal read own"
  on treatment_documents for select
  to authenticated
  using (
    patient_id = (select auth_patient_id())
    and deleted_at is null
  );

-- Soft delete: a dentist may set deleted_at on a live document in their own
-- clinic. WITH CHECK does not re-assert `deleted_at is null`, because the whole
-- point of the statement is to stop it being null — but USING does, so a row
-- already removed cannot be touched again.
create policy "treatment_documents: dentist soft delete"
  on treatment_documents for update
  to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'dentist'
    and deleted_at is null
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'dentist'
  );

comment on policy "treatment_documents: dentist soft delete" on treatment_documents is
  'Removal is an UPDATE setting deleted_at, not a DELETE. The DELETE policy was '
  'dropped so the hard-delete route does not sit open beside the soft one; the '
  'storage object is cleared later by the retention purge. Applies to '
  'treatment-scoped documents — appointment radiographs have their own policy '
  'below, which keeps the receptionist access 20260711000001 granted.';

-- Appointment-scoped radiographs (IOPA/OPG/CBCT) were manageable by BOTH staff
-- roles, and that stays true — the change here is soft instead of hard, not a
-- narrowing of who may do it. Reception attaches and corrects these at the
-- front desk, and taking that away would be an unrelated product change made
-- under cover of a security migration.
create policy "treatment_documents: staff soft delete appointment docs"
  on treatment_documents for update
  to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('dentist', 'receptionist')
    and appointment_id is not null
    and deleted_at is null
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('dentist', 'receptionist')
    and appointment_id is not null
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
