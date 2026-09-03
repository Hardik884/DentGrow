-- =============================================================================
-- PHI READ-ACCESS AUDIT LOG
-- Migration: 20260903000000_phi_access_log.sql
--
-- WHAT WAS MISSING
--   OraMedha records WRITES well. `appointment_history`, `consent_audit` and
--   `tooth_history` each keep an append-only trail of who changed what, and
--   signed consents are immutable in the RLS predicate rather than merely in
--   application code.
--
--   Nothing recorded a READ. There was no way to answer "who opened this
--   patient's record", which is the question asked after a suspected breach,
--   after a staff-conduct complaint, and by any clinic that has to account for
--   access to its own clinical records. During the view/RLS incident it was
--   also the question nobody could answer: with no read trail there was no way
--   to scope what had actually been looked at.
--
-- WHAT THIS TABLE IS, AND IS NOT
--   It is an access trail: WHO looked at WHICH record, WHEN, in WHAT role.
--   It is NOT a copy of the record. It stores identifiers and never content:
--   no names, no phone numbers, no clinical notes, no amounts, no free text
--   entered by a user, no prompts, no tokens. `context` exists for small
--   non-identifying facts (a result count, the surface a read came from) and
--   the application-side helper is what keeps that promise — see
--   lib/audit/phi-access.ts, which allow-lists the keys it will write.
--
--   That restraint is the point. An audit log of PHI reads that itself
--   contains PHI widens the blast radius of the next incident instead of
--   narrowing it: it becomes a second, denormalised copy of the clinical
--   record with a longer retention period and more readers.
--
-- IMMUTABILITY
--   Two independent mechanisms, because one of them is the one that fails:
--
--   1. RLS: SELECT only, and only for a dentist in the owning clinic. There is
--      deliberately NO insert, update or delete policy for any client role, so
--      writes are impossible from a session — exactly the shape `consent_audit`
--      already uses. The application writes through the service-role client.
--
--   2. A trigger that raises on UPDATE unconditionally, and on DELETE unless
--      the caller has declared a retention purge (see below). RLS does not
--      constrain the service role, so without this a bug — or a compromised
--      service key — could quietly rewrite history. The trigger constrains
--      everyone.
--
--   Staff therefore cannot erase evidence that they read a record, and that
--   includes the dentist who owns the clinic.
--
-- WHY A DENTIST CAN READ IT AND A RECEPTIONIST CANNOT
--   The log answers a supervisory question about staff conduct, so it follows
--   the same boundary the product already draws around analytics: clinic-owner
--   surface, not front-desk surface. A receptionist's own reads are recorded
--   like everyone else's.
--
-- RETENTION
--   Rows are eligible for purge on a schedule defined by the retention
--   configuration (a later migration), not by this one. Deletion is possible
--   only inside a transaction that has set `app.purge_context = 'retention'`,
--   which the retention routine does and nothing else does.
-- =============================================================================

-- =============================================================================
-- 1. EVENT TYPES
-- =============================================================================
--
-- Deliberately coarse. One value per KIND of sensitive resource, not one per
-- screen: an enum that tracks the UI has to change every time a page moves,
-- and the questions asked of an access log are about records, not routes.
--
-- Read events only. Writes already have their own, better-shaped trails
-- (appointment_history, consent_audit, tooth_history) and duplicating them here
-- would create two records of the same fact that can disagree.

create type phi_access_event as enum (
  'PATIENT_VIEWED',            -- a patient's profile / demographic record
  'PATIENT_SEARCHED',          -- a search that returned patient records
  'PATIENT_LIST_VIEWED',       -- a roster or worklist of patients
  'CLINICAL_RECORD_VIEWED',    -- appointment clinical detail: history, findings, diagnosis
  'DENTAL_CHART_VIEWED',       -- patient_teeth / tooth history
  'TREATMENT_VIEWED',          -- treatment records, including internal notes
  'PRESCRIPTION_VIEWED',       -- medications
  'PAYMENT_VIEWED',            -- financial ledger / outstanding balance
  'DOCUMENT_VIEWED',           -- a stored document was made retrievable
  'XRAY_VIEWED',               -- an imaging document was made retrievable
  'CONSENT_VIEWED',            -- a signed consent document
  'PATIENT_DATA_EXPORTED',     -- a full record export was produced
  'AI_CONTEXT_PREPARED'        -- patient data was assembled for an AI feature
);

comment on type phi_access_event is
  'Kinds of sensitive-record READ recorded in phi_access_log. Coarse by design: '
  'one value per kind of resource, not one per screen.';

-- =============================================================================
-- 2. TABLE
-- =============================================================================

create table phi_access_log (
  id           uuid             primary key default gen_random_uuid(),

  -- Tenant. Every query is scoped by this and the RLS policy pins it, so one
  -- clinic can never read another clinic's access trail.
  clinic_id    uuid             not null references clinics (id) on delete cascade,

  -- WHO. `set null` on delete rather than cascade: removing a staff account
  -- must not erase the record that they read something. The row survives with
  -- a null actor and the role it was performed in.
  actor_id     uuid             references profiles (id) on delete set null,
  actor_role   user_role        not null,

  -- WHAT.
  event        phi_access_event not null,
  -- The kind of row `resource_id` points at ('patient', 'treatment', ...).
  -- Free text rather than a foreign key: the log must keep pointing at a
  -- resource after that resource is purged.
  resource_type text            not null,
  resource_id  uuid,

  -- WHOSE record. Null for reads not scoped to one patient (a worklist).
  -- Not a foreign key, for the same reason as resource_type.
  patient_id   uuid,

  -- WHEN.
  occurred_at  timestamptz      not null default now(),

  -- Small, non-identifying facts only. NEVER names, phones, notes, amounts,
  -- free text, prompts or tokens. lib/audit/phi-access.ts allow-lists keys.
  context      jsonb            not null default '{}'::jsonb,

  -- Whether the access actually happened. A denied read is the more
  -- interesting row: repeated denials are what an intrusion looks like.
  allowed      boolean          not null default true
);

comment on table phi_access_log is
  'Append-only trail of READ access to sensitive patient records. Identifiers '
  'only — never names, phone numbers, clinical content, amounts, free text or '
  'credentials. Written by the service role via lib/audit/phi-access.ts; there '
  'is no client write policy, and a trigger blocks UPDATE outright and DELETE '
  'outside a declared retention purge.';

comment on column phi_access_log.context is
  'Non-identifying metadata only (counts, surface names, denial reasons). '
  'Enforced application-side by an allow-list in lib/audit/phi-access.ts.';

comment on column phi_access_log.allowed is
  'false records an access that was REFUSED. Those rows are the security '
  'signal; do not filter them out of monitoring.';

-- Indexes follow the three questions actually asked of this table:
--   "everything this clinic did lately"  → (clinic_id, occurred_at desc)
--   "who looked at this patient"         → (patient_id, occurred_at desc)
--   "what did this member of staff read" → (actor_id, occurred_at desc)
create index idx_phi_access_clinic_time  on phi_access_log (clinic_id, occurred_at desc);
create index idx_phi_access_patient_time on phi_access_log (patient_id, occurred_at desc)
  where patient_id is not null;
create index idx_phi_access_actor_time   on phi_access_log (actor_id, occurred_at desc)
  where actor_id is not null;
-- Denied reads are rare and are queried on their own, so they get their own
-- partial index rather than being found by scanning the clinic timeline.
create index idx_phi_access_denied on phi_access_log (clinic_id, occurred_at desc)
  where allowed = false;

-- =============================================================================
-- 3. IMMUTABILITY TRIGGER
-- =============================================================================
--
-- RLS keeps client sessions out. This keeps the SERVICE ROLE honest, which RLS
-- cannot: service_role carries BYPASSRLS, so every policy below is invisible to
-- it. An audit trail that the application can silently rewrite is not evidence.
--
-- DELETE is permitted in exactly one circumstance: a transaction that has
-- declared itself a retention purge by setting `app.purge_context`. The
-- retention routine sets it; nothing else does; and because it is a
-- transaction-local setting it cannot leak into an unrelated statement.

create or replace function phi_access_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'phi_access_log is append-only: rows cannot be modified'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purge_context', true), '') <> 'retention' then
    raise exception
      'phi_access_log rows may only be deleted by the retention purge'
      using errcode = 'restrict_violation';
  end if;

  -- Reached only by an AUTHORISED delete: UPDATE always raised above, and an
  -- unauthorised DELETE raised too. Returning OLD lets that delete proceed.
  --
  -- This previously read `return null`. In a BEFORE ... FOR EACH ROW trigger,
  -- returning NULL SILENTLY CANCELS the row operation — no error, no row
  -- affected. So the retention purge, which is the one caller allowed to delete
  -- here, deleted nothing at all and reported success:
  --
  --   select purge_phi_access_log_rows(array(select id from phi_access_log));
  --    -> 0        (with the rows still present afterwards)
  --
  -- The append-only guarantee still held, but the purge half of the lifecycle
  -- was inert, which is only visible by actually executing a purge.
  return old;
end;
$$;

comment on function phi_access_log_is_append_only() is
  'Blocks UPDATE on phi_access_log unconditionally, and DELETE unless the '
  'transaction has set app.purge_context = ''retention''. Applies to the '
  'service role too, which RLS cannot constrain.';

create trigger trg_phi_access_log_append_only
  before update or delete on phi_access_log
  for each row execute function phi_access_log_is_append_only();

-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- =============================================================================

alter table phi_access_log enable row level security;

-- Read: the clinic's dentist, within their own clinic, only.
--
-- No INSERT, UPDATE or DELETE policy exists for any role. That is not an
-- omission — under RLS, absence of a policy is a denial, and it is the same
-- shape consent_audit uses. Writes happen through the service-role client in
-- lib/audit/phi-access.ts.
create policy "phi_access_log: dentist read own clinic"
  on phi_access_log for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

comment on policy "phi_access_log: dentist read own clinic" on phi_access_log is
  'Clinic-owner surface, mirroring analytics. A receptionist cannot read the '
  'access trail; their own reads are recorded in it like everyone else''s.';

-- =============================================================================
-- 5. THE ONLY WAY TO DELETE A ROW
-- =============================================================================
--
-- The trigger above requires `app.purge_context = 'retention'`, and nothing can
-- set that from PostgREST — a REST client cannot issue `set_config`. So the
-- capability is exposed as one narrow function instead of as a session setting
-- anyone could flip.
--
-- `set_config(..., true)` makes the setting LOCAL to the surrounding
-- transaction, so it cannot persist into a later statement on a pooled
-- connection. The function returns the number of rows it actually removed,
-- which is what a retention job needs to report and what a caller needs to
-- detect a no-op.
--
-- security definer because the deletion has to happen with the privileges that
-- own the table; search_path is pinned, which is required of any security
-- definer function so a caller cannot shadow `phi_access_log` with their own
-- relation.

create or replace function purge_phi_access_log_rows(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  perform set_config('app.purge_context', 'retention', true);

  delete from phi_access_log where id = any(p_ids);
  get diagnostics removed = row_count;

  return removed;
end;
$$;

comment on function purge_phi_access_log_rows(uuid[]) is
  'Deletes specific phi_access_log rows by declaring a retention purge for the '
  'duration of the transaction. The ONLY route past the append-only trigger. '
  'EXECUTE is revoked from anon and authenticated — service role only.';

-- Not callable from any browser session, authenticated or not. The default
-- grant on a new function is EXECUTE to PUBLIC, so this revoke is doing real
-- work rather than restating a default.
revoke all on function purge_phi_access_log_rows(uuid[]) from public;
revoke all on function purge_phi_access_log_rows(uuid[]) from anon, authenticated;
grant execute on function purge_phi_access_log_rows(uuid[]) to service_role;

-- =============================================================================
-- 6. GRANTS
-- =============================================================================
--
-- 20260727000002_baseline_role_grants.sql granted DML on all tables in the
-- schema as it stood then; this table is new, so it is granted explicitly and
-- narrowly. anon gets nothing at all: an unauthenticated caller has no business
-- addressing this relation even to be refused by RLS.

revoke all on phi_access_log from anon;
grant select on phi_access_log to authenticated;
grant select, insert, delete on phi_access_log to service_role;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
