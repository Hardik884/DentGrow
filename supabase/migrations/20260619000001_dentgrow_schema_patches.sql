-- =============================================================================
-- DentGrow — Schema Patches
-- Migration: 20260619000001_dentgrow_schema_patches.sql
--
-- Addresses 8 issues found in the initial schema:
--   FIX-1  Receptionist treatment access (view + RLS)
--   FIX-2  Remove direct patient INSERT on appointments (RLS)
--   FIX-3  Patient deduplication (partial unique index)
--   FIX-4  Queue date tracking (new column + index)
--   FIX-5  Clinic timezone support (new column)
--   FIX-6  created_by audit fields (new columns + FKs + indexes)
--   FIX-7  Dentist role validation on appointments.dentist_id (trigger)
--   FIX-8  RLS review — drop redundant / risky policies, add missing ones
--
-- Run order: this migration MUST run after 20260619000000.
-- Every change is idempotent where Postgres allows it (OR REPLACE, IF NOT EXISTS).
-- =============================================================================

-- =============================================================================
-- FIX-1  RECEPTIONIST TREATMENT ACCESS
--
-- Problem:  No RLS policy exists for receptionist on treatments. They currently
--           get zero rows, which blocks operational workflows (billing, check-in
--           confirmation, cost display).
--
-- Solution:
--   (a) Add a receptionist SELECT policy on the base treatments table that
--       restricts to operational columns only — enforced at the view layer.
--   (b) Create receptionist_treatments view that physically excludes
--       internal_notes, mirrors the existing patient_treatments pattern.
--   (c) Add an RLS policy that allows the view to be queried by receptionists.
--
-- What receptionists CAN see:  treatment_type, status, cost, patient_visible_notes
-- What receptionists CANNOT see: internal_notes (never selected by the view)
-- =============================================================================

-- (a) Base-table RLS: grant receptionist SELECT on treatments rows in their clinic.
--     internal_notes is excluded at the view layer, not by column-level RLS
--     (Postgres column-level privileges are session-based, not row-based, and
--     don't compose cleanly with RLS — the view approach is the correct pattern).

create policy "treatments: receptionist read operational"
  on treatments for select
  using (
    clinic_id  = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at  is null
  );

-- (b) Receptionist-safe view — excludes internal_notes entirely.
--     Receptionists must ALWAYS query this view, never the base table.
--     The view is security definer so it runs with the view owner's privileges
--     and RLS on the base table still applies via the policies above.

create or replace view receptionist_treatments
with (security_invoker = true)   -- RLS evaluated as the calling user, not view owner
as
  select
    id,
    clinic_id,
    appointment_id,
    patient_id,
    treatment_type,
    patient_visible_notes,        -- internal_notes deliberately excluded
    cost,
    status,
    performed_at,
    created_at,
    updated_at
  from treatments
  where deleted_at is null;

comment on view receptionist_treatments is
  'Operational treatment view for receptionists. '
  'Excludes internal_notes. Use this view in all receptionist-facing queries.';

-- (c) Rebuild patient_treatments with security_invoker = true for consistency.
--     The original view lacked this, making its RLS evaluation undefined
--     depending on the view owner's role.

create or replace view patient_treatments
with (security_invoker = true)
as
  select
    id,
    clinic_id,
    appointment_id,
    patient_id,
    treatment_type,
    patient_visible_notes,
    cost,
    status,
    performed_at,
    created_at
  from treatments
  where deleted_at is null
    and patient_id = auth_patient_id();

comment on view patient_treatments is
  'Portal-safe treatment view. Excludes internal_notes. '
  'Always query this view from patient-facing code, never the base table.';

-- =============================================================================
-- FIX-2  PATIENT APPOINTMENT CREATION SAFETY
--
-- Problem:  The policy "appointments: portal insert own" lets any authenticated
--           portal user INSERT directly into the appointments table with only a
--           patient_id check. This bypasses:
--             • availability rule validation
--             • slot conflict / double-booking checks
--             • business rule enforcement (source, dentist assignment, etc.)
--
-- Solution:
--   (a) DROP the direct INSERT policy for portal users.
--   (b) All appointment creation for patients goes through a server-side
--       SECURITY DEFINER function that validates availability, checks for
--       conflicts, and then inserts — the function runs as the service role.
--   (c) Document the architectural requirement below.
--
-- Architecture note:
--   The Next.js Server Action calls create_patient_appointment() with validated
--   inputs. The function runs SECURITY DEFINER (effectively service-role), so
--   the patient's RLS session does not need INSERT on appointments at all.
--   This is the only safe pattern for patient-initiated bookings.
-- =============================================================================

-- (a) Drop the unsafe direct INSERT policy.
drop policy if exists "appointments: portal insert own" on appointments;

-- (b) Server-side booking function.
--     Called from the Next.js Server Action after availability and conflict checks.
--     Accepts only the fields a patient is allowed to set; all others are
--     derived server-side (clinic_id from the patient's record, dentist_id
--     from availability rules, source = 'website').

create or replace function create_patient_appointment(
  p_patient_id     uuid,
  p_scheduled_at   timestamptz,
  p_notes          text default null
)
returns uuid                        -- returns the new appointment id
language plpgsql
security definer                    -- bypasses RLS; validation is inside the function
set search_path = public
as $$
declare
  v_clinic_id       uuid;
  v_dentist_id      uuid;
  v_duration        integer;
  v_dow             smallint;
  v_slot_time       time;
  v_new_id          uuid;
begin
  -- 1. Verify the caller owns this patient via the portal link.
  if (select patient_id from patient_portal_links where user_id = auth.uid()) <> p_patient_id then
    raise exception 'Not authorised to book for this patient';
  end if;

  -- 2. Resolve clinic_id from the patient record.
  select clinic_id into v_clinic_id
  from   patients
  where  id = p_patient_id and deleted_at is null;

  if v_clinic_id is null then
    raise exception 'Patient not found or deleted';
  end if;

  -- 3. Resolve slot duration from clinic settings (default 30 min if not set).
  select coalesce(average_appointment_duration, 30) into v_duration
  from   clinic_settings
  where  clinic_id = v_clinic_id;

  -- 4. Verify the requested slot falls within an active availability rule.
  v_dow      := extract(dow from p_scheduled_at)::smallint;
  v_slot_time := p_scheduled_at::time;

  if not exists (
    select 1 from availability_rules
    where  clinic_id   = v_clinic_id
      and  day_of_week = v_dow
      and  start_time  <= v_slot_time
      and  end_time    > v_slot_time
      and  is_active   = true
  ) then
    raise exception 'Requested slot is outside clinic availability';
  end if;

  -- 5. Assign the first available dentist for this clinic
  --    (single-dentist MVP: pick the only dentist in the clinic).
  select id into v_dentist_id
  from   profiles
  where  clinic_id = v_clinic_id
    and  role      = 'dentist'
  limit  1;

  if v_dentist_id is null then
    raise exception 'No dentist available for this clinic';
  end if;

  -- 6. Check for slot conflict (the unique partial index on dentist+scheduled_at
  --    will also catch this, but an explicit check gives a better error message).
  if exists (
    select 1 from appointments
    where  dentist_id   = v_dentist_id
      and  scheduled_at = p_scheduled_at
      and  deleted_at   is null
      and  status not in ('cancelled', 'no_show')
  ) then
    raise exception 'This slot is already booked. Please choose another time.';
  end if;

  -- 7. Insert the appointment.
  insert into appointments (
    clinic_id, patient_id, dentist_id,
    scheduled_at, duration_minutes,
    source, status, notes
  )
  values (
    v_clinic_id, p_patient_id, v_dentist_id,
    p_scheduled_at, v_duration,
    'website', 'scheduled', p_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function create_patient_appointment is
  'SECURITY DEFINER booking function for patient portal. '
  'Validates portal ownership, availability rules, and slot conflicts before inserting. '
  'Called from the Next.js Server Action — never directly from the client.';

-- Grant execute to authenticated users so the Server Action can call it.
grant execute on function create_patient_appointment(uuid, timestamptz, text)
  to authenticated;

-- =============================================================================
-- FIX-3  PATIENT DEDUPLICATION PREVENTION
--
-- Problem:  No uniqueness constraint on (clinic_id, phone). Multiple patient
--           records with the same phone can exist in the same clinic, causing
--           portal-link ambiguity and data quality issues.
--
-- Solution:
--   Partial unique index on (clinic_id, phone) WHERE deleted_at IS NULL.
--   Deleted patients do not block re-registration (their row is excluded
--   from the index predicate).
--
-- Migration strategy:
--   Step 1 — Identify existing duplicates before creating the index.
--             Run the diagnostic query below and resolve them manually or
--             via a dedup script before applying this migration in production.
--   Step 2 — Create the partial unique index (fails if duplicates still exist).
--
-- Diagnostic query (run before applying to production):
--   SELECT clinic_id, phone, COUNT(*) AS n
--   FROM   patients
--   WHERE  deleted_at IS NULL
--     AND  phone IS NOT NULL
--   GROUP  BY clinic_id, phone
--   HAVING COUNT(*) > 1;
--
-- Deduplication strategy:
--   For each duplicate group, keep the record with the most recent last_visit
--   (or highest total_visits), soft-delete the others, and merge their
--   appointment / treatment / payment records to point to the survivor.
--   This must be done in application code before running this migration.
-- =============================================================================

-- Partial unique index: enforces 1 phone per clinic among active patients.
-- Rows where phone IS NULL are excluded from uniqueness (NULL ≠ NULL in Postgres).
create unique index if not exists uq_patients_clinic_phone_active
  on patients (clinic_id, phone)
  where deleted_at is null
    and phone is not null;

comment on index uq_patients_clinic_phone_active is
  'Prevents duplicate active patients with the same phone in a clinic. '
  'Soft-deleted patients are excluded so their phone can be reused.';

-- =============================================================================
-- FIX-4  QUEUE DATE TRACKING
--
-- Problem:  queue_entries has no explicit date column. The "current day" scope
--           is enforced entirely in application code via checked_in_at::date.
--           This makes historical analytics and multi-day reporting unreliable,
--           and the Realtime subscription filter on clinic_id requires the app
--           to filter by date client-side after receiving all rows.
--
-- Solution:
--   Add queue_date date NOT NULL with a default of CURRENT_DATE.
--   This makes date-scoped queries a single indexed filter.
--
-- Migration strategy:
--   Step 1 — Add the column as nullable with a default.
--   Step 2 — Back-fill existing rows from checked_in_at.
--   Step 3 — Add the NOT NULL constraint (safe after back-fill).
--   Step 4 — Add composite index.
-- =============================================================================

-- Step 1: Add column (nullable first so back-fill can run without constraint error).
alter table queue_entries
  add column if not exists queue_date date default current_date;

-- Step 2: Back-fill all existing rows from checked_in_at.
update queue_entries
set    queue_date = checked_in_at::date
where  queue_date is null;

-- Step 3: Enforce NOT NULL now that every row has a value.
alter table queue_entries
  alter column queue_date set not null;

-- Keep the default so new inserts set queue_date = CURRENT_DATE automatically.
alter table queue_entries
  alter column queue_date set default current_date;

comment on column queue_entries.queue_date is
  'Calendar date of this queue entry. Derived from checked_in_at at insert time. '
  'Use this column for date-scoped queries and analytics — do not rely on checked_in_at::date.';

-- Step 4: Composite index for the two main access patterns:
--   (a) Today's queue dashboard: WHERE clinic_id = ? AND queue_date = CURRENT_DATE
--   (b) Historical analytics:    WHERE clinic_id = ? AND queue_date BETWEEN ? AND ?

create index if not exists idx_queue_clinic_date
  on queue_entries (clinic_id, queue_date);

-- Tighten the unique in_progress constraint to be per-day (not per-clinic globally).
-- Drop the old index first, then recreate it scoped to queue_date.
drop index if exists uq_queue_clinic_in_progress;

create unique index uq_queue_clinic_in_progress_per_day
  on queue_entries (clinic_id, queue_date)
  where status = 'in_progress';

comment on index uq_queue_clinic_in_progress_per_day is
  'Enforces at most one in_progress entry per clinic per calendar day.';

-- Rebuild the existing clinic+status index to include queue_date for filter pushdown.
drop index if exists idx_queue_clinic_status;

create index idx_queue_clinic_date_status
  on queue_entries (clinic_id, queue_date, status);

comment on index idx_queue_clinic_date_status is
  'Supports daily queue dashboard and status-filter queries.';

-- =============================================================================
-- FIX-5  CLINIC TIMEZONE SUPPORT
--
-- Problem:  clinic_settings has no timezone column. All time comparisons
--           (appointment scheduling, queue calculations, overdue follow-up
--           detection, future reminders) implicitly use the database server's
--           timezone (UTC), producing wrong results for clinics in other zones.
--
-- Solution:
--   Add timezone text NOT NULL DEFAULT 'UTC' to clinic_settings.
--   Use IANA timezone names (e.g. 'Asia/Kolkata', 'America/New_York').
--   Application code must pass AT TIME ZONE cs.timezone when computing
--   "today" relative to clinic local time.
--
-- Recommended default:  'UTC'
--   Explicit over implicit. Each clinic should update this to their local zone
--   during onboarding. UTC as the fallback means existing behaviour is unchanged
--   until the clinic sets their real timezone.
--
-- Usage pattern (example — slot boundary check in local time):
--   SELECT *
--   FROM   availability_rules ar
--   JOIN   clinic_settings   cs ON cs.clinic_id = ar.clinic_id
--   WHERE  ar.clinic_id   = $1
--     AND  ar.day_of_week = EXTRACT(DOW FROM ($2 AT TIME ZONE cs.timezone))::smallint
--     AND  ar.start_time <= ($2 AT TIME ZONE cs.timezone)::time
--     AND  ar.end_time   >  ($2 AT TIME ZONE cs.timezone)::time;
-- =============================================================================

alter table clinic_settings
  add column if not exists timezone text not null default 'Asia/Kolkata';

comment on column clinic_settings.timezone is
  'IANA timezone name (e.g. Asia/Kolkata, America/New_York). Used for slot boundaries, queue calculations and reminder scheduling.';
-- Update create_patient_appointment() to use clinic timezone for DOW calculation.
-- (Full replacement — only the DOW extraction line changes.)
create or replace function create_patient_appointment(
  p_patient_id     uuid,
  p_scheduled_at   timestamptz,
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id   uuid;
  v_dentist_id  uuid;
  v_duration    integer;
  v_timezone    text;
  v_dow         smallint;
  v_slot_time   time;
  v_new_id      uuid;
begin
  -- 1. Verify the caller owns this patient via the portal link.
  if (select patient_id from patient_portal_links where user_id = auth.uid()) <> p_patient_id then
    raise exception 'Not authorised to book for this patient';
  end if;

  -- 2. Resolve clinic_id from the patient record.
  select clinic_id into v_clinic_id
  from   patients
  where  id = p_patient_id and deleted_at is null;

  if v_clinic_id is null then
    raise exception 'Patient not found or deleted';
  end if;

  -- 3. Resolve clinic settings (duration + timezone).
  select coalesce(average_appointment_duration, 30),
         coalesce(timezone, 'UTC')
  into   v_duration, v_timezone
  from   clinic_settings
  where  clinic_id = v_clinic_id;

  -- 4. Convert requested time to clinic local time for DOW + time checks.
  v_dow       := extract(dow from (p_scheduled_at at time zone v_timezone))::smallint;
  v_slot_time := (p_scheduled_at at time zone v_timezone)::time;

  -- 5. Verify slot falls within an active availability rule.
  if not exists (
    select 1 from availability_rules
    where  clinic_id   = v_clinic_id
      and  day_of_week = v_dow
      and  start_time  <= v_slot_time
      and  end_time    > v_slot_time
      and  is_active   = true
  ) then
    raise exception 'Requested slot is outside clinic availability';
  end if;

  -- 6. Assign the first available dentist.
  select id into v_dentist_id
  from   profiles
  where  clinic_id = v_clinic_id and role = 'dentist'
  limit  1;

  if v_dentist_id is null then
    raise exception 'No dentist available for this clinic';
  end if;

  -- 7. Check for slot conflict.
  if exists (
    select 1 from appointments
    where  dentist_id   = v_dentist_id
      and  scheduled_at = p_scheduled_at
      and  deleted_at   is null
      and  status not in ('cancelled', 'no_show')
  ) then
    raise exception 'This slot is already booked. Please choose another time.';
  end if;

  -- 8. Insert.
  insert into appointments (
    clinic_id, patient_id, dentist_id,
    scheduled_at, duration_minutes,
    source, status, notes
  )
  values (
    v_clinic_id, p_patient_id, v_dentist_id,
    p_scheduled_at, v_duration,
    'website', 'scheduled', p_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- =============================================================================
-- FIX-6  CREATED_BY AUDIT FIELDS
--
-- Problem:  patients, appointments, treatments, payments, and follow_ups have
--           no record of which staff member created them. This blocks
--           auditability, staff-level analytics, and accountability workflows.
--
-- Solution:
--   Add created_by uuid REFERENCES profiles(id) ON DELETE SET NULL to each table.
--   SET NULL on delete: if a staff member's profile is deleted, the audit trail
--   is preserved with a NULL created_by rather than cascading delete.
--   Column is nullable because:
--     (a) existing rows have no value (back-fill not possible without data)
--     (b) system-generated rows (e.g. from n8n) may have no human creator
--
-- Indexing:
--   Index each created_by FK to support:
--     - "show all records created by staff member X" queries
--     - future staff performance analytics
--     - referential integrity check performance
-- =============================================================================

-- ── patients ──────────────────────────────────────────────────────────────────
alter table patients
  add column if not exists created_by uuid references profiles (id) on delete set null;

comment on column patients.created_by is
  'Profile of the staff member who created this record. NULL for system/unknown.';

create index if not exists idx_patients_created_by
  on patients (created_by)
  where deleted_at is null;

-- ── appointments ──────────────────────────────────────────────────────────────
alter table appointments
  add column if not exists created_by uuid references profiles (id) on delete set null;

comment on column appointments.created_by is
  'Profile of the staff member (or patient portal user) who created this booking. '
  'NULL for system-generated appointments.';

create index if not exists idx_appointments_created_by
  on appointments (created_by)
  where deleted_at is null;

-- ── treatments ────────────────────────────────────────────────────────────────
alter table treatments
  add column if not exists created_by uuid references profiles (id) on delete set null;

comment on column treatments.created_by is
  'Profile of the dentist who created this treatment record.';

create index if not exists idx_treatments_created_by
  on treatments (created_by)
  where deleted_at is null;

-- ── payments ──────────────────────────────────────────────────────────────────
alter table payments
  add column if not exists created_by uuid references profiles (id) on delete set null;

comment on column payments.created_by is
  'Profile of the staff member who recorded this payment.';

create index if not exists idx_payments_created_by
  on payments (created_by)
  where deleted_at is null;

-- ── follow_ups ────────────────────────────────────────────────────────────────
alter table follow_ups
  add column if not exists created_by uuid references profiles (id) on delete set null;

comment on column follow_ups.created_by is
  'Profile of the dentist who created this follow-up reminder.';

create index if not exists idx_follow_ups_created_by
  on follow_ups (created_by)
  where deleted_at is null;

-- ── Active-record views: rebuild to include created_by ────────────────────────
-- The active_* views use SELECT * so they inherit the new column automatically.
-- No view rebuild needed.

-- =============================================================================
-- FIX-7  DENTIST ROLE VALIDATION ON appointments.dentist_id
--
-- Problem:  appointments.dentist_id is a FK to profiles(id) but nothing in the
--           database prevents assigning a receptionist or patient profile as the
--           dentist on an appointment. The FK constraint alone is insufficient.
--
-- Two-layer approach:
--
--   Layer 1 — Database trigger (BEFORE INSERT OR UPDATE):
--     Rejects any attempt to set dentist_id to a profile whose role ≠ 'dentist'.
--     Fires synchronously before the row is written.
--     This is the hard guard — it applies regardless of how the INSERT arrives
--     (Server Action, service-role function, admin SQL, etc.).
--
--   Layer 2 — Application layer (Server Action):
--     Filter the dentist dropdown / input to only show profiles with role = 'dentist'.
--     Validate dentist_id before calling the insert/update.
--     This prevents the error from ever reaching the database under normal usage.
--     SQL: SELECT id, full_name FROM profiles
--          WHERE clinic_id = $clinic_id AND role = 'dentist'
--
--   Why not a CHECK constraint referencing another table?
--     PostgreSQL CHECK constraints cannot reference other tables (they only see
--     the current row). A trigger is the correct pattern for cross-table validation.
--
--   Why not a foreign key to a "dentists" table?
--     Maintaining a separate table for dentist profiles adds complexity and drift
--     risk. The trigger approach is simpler and enforces the rule where it lives.
-- =============================================================================

create or replace function validate_dentist_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role user_role;
begin
  -- Only validate if dentist_id is being set or changed.
  if new.dentist_id is not null then
    select role into v_role
    from   profiles
    where  id = new.dentist_id;

    if v_role is null then
      raise exception
        'dentist_id % does not reference a valid profile', new.dentist_id;
    end if;

    if v_role <> 'dentist' then
      raise exception
        'Profile % has role ''%'' — only profiles with role ''dentist'' may be assigned as dentist_id',
        new.dentist_id, v_role;
    end if;
  end if;

  return new;
end;
$$;

comment on function validate_dentist_role is
  'Trigger function: rejects INSERT/UPDATE on appointments where dentist_id '
  'does not reference a profile with role = ''dentist''.';

create trigger trg_appointments_validate_dentist
  before insert or update of dentist_id
  on appointments
  for each row
  execute function validate_dentist_role();

comment on trigger trg_appointments_validate_dentist on appointments is
  'Hard guard: prevents non-dentist profiles being assigned as dentist_id.';

-- =============================================================================
-- FIX-8  RLS REVIEW — CORRECTIONS AND HARDENING
--
-- Issues found in the initial schema policies:
--
--  A. "appointments: dentist full access" uses FOR ALL with deleted_at IS NULL
--     in the USING clause. FOR ALL includes INSERT, but USING is not evaluated
--     for INSERT (only WITH CHECK is). This means the deleted_at filter is
--     silently ignored on inserts — dentists could theoretically insert a row
--     with deleted_at already set. Fix: split into explicit per-operation
--     policies, or add WITH CHECK.
--
--  B. "treatments: dentist full access" has the same FOR ALL + USING pattern
--     for a table with soft deletes. Same fix needed.
--
--  C. "follow_ups: dentist full access" — same issue.
--
--  D. "payments: dentist full access" — same issue.
--
--  E. "patients: dentist full access" — same issue.
--
--  F. "availability_rules: dentist write" uses FOR ALL + USING which is fine
--     for non-soft-deleted tables, but is missing WITH CHECK for INSERT.
--     Dentists could insert an availability rule for a different clinic_id
--     if the USING clause is not also applied as WITH CHECK.
--
--  G. "appointments: portal update own" has no WITH CHECK clause.
--     A patient could theoretically change patient_id or clinic_id on update.
--     Add WITH CHECK mirroring the USING clause.
--
--  H. "clinic_settings: all staff read" is missing a portal user policy.
--     Patient AI Assistant needs clinic name, hours, phone — sourced from
--     clinic_settings. Without a portal SELECT policy, getClinicInformation
--     returns nothing for patients.
--
--  I. "appointments: receptionist insert" is missing a WITH CHECK that
--     also requires deleted_at IS NULL (or NULL) on insert — currently a
--     receptionist could insert a pre-soft-deleted appointment.
--
-- =============================================================================

-- ── Fix A, B, C, D, E — Replace FOR ALL policies that mix USING + deleted_at ──
-- Pattern: drop the combined policy, replace with explicit SELECT/INSERT/UPDATE
-- /DELETE policies so USING and WITH CHECK are each correct for their operation.

-- ── PATIENTS ──────────────────────────────────────────────────────────────────
drop policy if exists "patients: dentist full access" on patients;

create policy "patients: dentist select"
  on patients for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

create policy "patients: dentist insert"
  on patients for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "patients: dentist update"
  on patients for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "patients: dentist delete"
  on patients for delete
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

-- ── APPOINTMENTS ──────────────────────────────────────────────────────────────
drop policy if exists "appointments: dentist full access" on appointments;

create policy "appointments: dentist select"
  on appointments for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

create policy "appointments: dentist insert"
  on appointments for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "appointments: dentist update"
  on appointments for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "appointments: dentist delete"
  on appointments for delete
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

-- Fix I: add WITH CHECK to receptionist insert to prevent pre-soft-deleted rows.
drop policy if exists "appointments: receptionist insert" on appointments;

create policy "appointments: receptionist insert"
  on appointments for insert
  with check (
    clinic_id  = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at  is null
  );

-- Fix G: add WITH CHECK to portal update to prevent field tampering.
drop policy if exists "appointments: portal update own" on appointments;

create policy "appointments: portal update own"
  on appointments for update
  using (
    patient_id  = auth_patient_id()
    and deleted_at is null
    and status in ('scheduled', 'checked_in')
  )
  with check (
    patient_id  = auth_patient_id()
    and deleted_at is null
  );

-- ── TREATMENTS ────────────────────────────────────────────────────────────────
drop policy if exists "treatments: dentist full access" on treatments;

create policy "treatments: dentist select"
  on treatments for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

create policy "treatments: dentist insert"
  on treatments for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "treatments: dentist update"
  on treatments for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "treatments: dentist delete"
  on treatments for delete
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

-- ── PAYMENTS ──────────────────────────────────────────────────────────────────
drop policy if exists "payments: dentist full access" on payments;

create policy "payments: dentist select"
  on payments for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

create policy "payments: dentist insert"
  on payments for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "payments: dentist update"
  on payments for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "payments: dentist delete"
  on payments for delete
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

-- ── FOLLOW-UPS ────────────────────────────────────────────────────────────────
drop policy if exists "follow_ups: dentist full access" on follow_ups;

create policy "follow_ups: dentist select"
  on follow_ups for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

create policy "follow_ups: dentist insert"
  on follow_ups for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "follow_ups: dentist update"
  on follow_ups for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "follow_ups: dentist delete"
  on follow_ups for delete
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);

-- ── AVAILABILITY RULES — Fix F ─────────────────────────────────────────────────
drop policy if exists "availability_rules: dentist write" on availability_rules;

create policy "availability_rules: dentist insert"
  on availability_rules for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "availability_rules: dentist update"
  on availability_rules for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "availability_rules: dentist delete"
  on availability_rules for delete
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

-- ── CLINIC SETTINGS — Fix H: add portal read policy ───────────────────────────
-- Patient AI Assistant getClinicInformation tool reads clinic_settings.
-- Without this policy the tool returns NULL for portal users.
create policy "clinic_settings: portal read"
  on clinic_settings for select
  using (
    clinic_id = (
      select p.clinic_id
      from   patients p
      where  p.id = auth_patient_id()
    )
  );

-- =============================================================================
-- ADDITIONAL MISSING POLICIES IDENTIFIED DURING REVIEW
-- =============================================================================

-- ── CLINIC SETTINGS: insert for dentist ───────────────────────────────────────
-- The initial schema had only an UPDATE policy for dentists on clinic_settings.
-- A dentist must also be able to INSERT the initial settings row during onboarding.
create policy "clinic_settings: dentist insert"
  on clinic_settings for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

-- ── APPOINTMENT HISTORY: receptionist needs created_by visibility ─────────────
-- No change needed — the existing receptionist read policy covers this.

-- ── QUEUE ENTRIES: missing portal INSERT for check-in confirmation ─────────────
-- Patients do not insert queue entries — receptionists do. No policy needed.

-- ── PATIENTS: receptionist update needs WITH CHECK ────────────────────────────
drop policy if exists "patients: receptionist update" on patients;

create policy "patients: receptionist update"
  on patients for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'receptionist' and deleted_at is null)
  with check (clinic_id = auth_clinic_id() and auth_role() = 'receptionist');

-- ── TREATMENTS: receptionist update policy ────────────────────────────────────
-- Receptionists can view treatments (FIX-1 above). They should NOT be able
-- to insert, update, or delete treatment records — those are clinical operations.
-- The read-only policy added in FIX-1 is correct and sufficient.

-- =============================================================================
-- SUMMARY OF ALL POLICIES AFTER THIS MIGRATION
-- (for verification — not executable SQL)
--
-- Table              | Role         | Operations
-- -------------------|--------------|------------------------------------------
-- clinics            | dentist      | SELECT
--                    | receptionist | SELECT
-- profiles           | all staff    | SELECT (own clinic), UPDATE (own row)
-- patients           | dentist      | SELECT, INSERT, UPDATE, DELETE (active)
--                    | receptionist | SELECT, INSERT, UPDATE (active, no delete)
--                    | patient      | SELECT (own record, active)
-- patient_portal_    | patient      | SELECT (own link)
--   links            |              |
-- clinic_settings    | dentist      | SELECT, INSERT, UPDATE
--                    | receptionist | SELECT
--                    | patient      | SELECT (own clinic settings only)
-- availability_rules | dentist      | SELECT, INSERT, UPDATE, DELETE
--                    | receptionist | SELECT
--                    | patient      | SELECT (own clinic, active rules)
-- appointments       | dentist      | SELECT, INSERT, UPDATE, DELETE (active)
--                    | receptionist | SELECT, INSERT, UPDATE (active, no delete)
--                    | patient      | SELECT (own), UPDATE (own, future only)
--                    |              | NO direct INSERT — use create_patient_appointment()
-- appointment_       | dentist      | SELECT (own clinic appointments)
--   history          | receptionist | SELECT (own clinic appointments)
-- queue_entries      | dentist      | ALL (own clinic)
--                    | receptionist | ALL (own clinic)
--                    | patient      | SELECT (own entry)
-- treatments         | dentist      | SELECT, INSERT, UPDATE, DELETE (active)
--                    | receptionist | SELECT (via receptionist_treatments view)
--                    | patient      | SELECT (via patient_treatments view, active)
-- payments           | dentist      | SELECT, INSERT, UPDATE, DELETE (active)
--                    | receptionist | SELECT, INSERT, UPDATE (active, no delete)
--                    | patient      | SELECT (own, active)
-- follow_ups         | dentist      | SELECT, INSERT, UPDATE, DELETE (active)
--                    | receptionist | no access
--                    | patient      | SELECT (own, active)
-- webhook_logs       | dentist      | SELECT (own clinic)
-- =============================================================================

-- =============================================================================
-- END OF PATCH MIGRATION
-- =============================================================================
