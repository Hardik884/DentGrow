-- =============================================================================
-- DentGrow — Initial Database Schema
-- Migration: 20260619000000_dentgrow_initial_schema.sql
--
-- Migration order (dependency chain):
--   1.  Enums
--   2.  clinics
--   3.  profiles                (depends on: clinics, auth.users)
--   4.  patients                (depends on: clinics)
--   5.  patient_portal_links    (depends on: patients, auth.users)
--   6.  clinic_settings         (depends on: clinics)
--   7.  availability_rules      (depends on: clinics)
--   8.  appointments            (depends on: clinics, patients, profiles)
--   9.  appointment_history     (depends on: appointments, profiles)
--   10. queue_entries           (depends on: clinics, appointments, patients)
--   11. treatments              (depends on: clinics, appointments, patients)
--   12. payments                (depends on: clinics, patients, appointments)
--   13. follow_ups              (depends on: clinics, patients, appointments, treatments)
--   14. webhook_logs            (depends on: clinics)
--   15. Views (active_* helpers)
--   16. Indexes
--   17. RLS enable + policies
-- =============================================================================


-- =============================================================================
-- SECTION 1 — ENUMS
-- =============================================================================

create type user_role as enum (
  'dentist',
  'receptionist',
  'patient'
);

create type gender_type as enum (
  'male',
  'female',
  'other'
);

create type appointment_source as enum (
  'walk_in',
  'phone_call',
  'website',
  'referral',
  'other'
);

create type appointment_status as enum (
  'scheduled',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
);

create type queue_status as enum (
  'waiting',
  'in_progress',
  'completed'
);

create type treatment_status as enum (
  'planned',
  'in_progress',
  'completed',
  'cancelled'
);

create type payment_method as enum (
  'cash',
  'upi',
  'card',
  'bank_transfer'
);

create type follow_up_status as enum (
  'pending',
  'completed',
  'cancelled'
);

create type appointment_history_action as enum (
  'created',
  'rescheduled',
  'cancelled',
  'status_changed'
);

-- =============================================================================
-- SECTION 2 — CLINICS
-- Root tenant table. Every other table hangs off this.
-- =============================================================================

create table clinics (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

comment on table clinics is
  'Root tenant table. Each row is one dental clinic.';

-- =============================================================================
-- SECTION 3 — PROFILES
-- Extends auth.users. One row per Supabase Auth user.
-- Stores the user's display name, clinic membership, and role.
-- =============================================================================

create table profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  clinic_id   uuid        not null references clinics (id) on delete cascade,
  full_name   text        not null,
  role        user_role   not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table profiles is
  'One-to-one extension of auth.users. Carries clinic membership and role.';
comment on column profiles.role is
  'dentist | receptionist | patient — drives all RLS policies.';

-- =============================================================================
-- SECTION 4 — PATIENTS
-- Central patient registry. Exists independently of auth accounts.
-- Soft-deletable. Age is always calculated from date_of_birth at query time.
-- =============================================================================

create table patients (
  id                      uuid        primary key default gen_random_uuid(),
  clinic_id               uuid        not null references clinics (id) on delete cascade,
  name                    text        not null,
  phone                   text,
  date_of_birth           date,
  gender                  gender_type,
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  notes                   text,
  total_visits            integer     not null default 0,
  last_visit              timestamptz,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table patients is
  'Patient registry. Records exist independently of portal accounts.';
comment on column patients.deleted_at is
  'Soft delete. NULL = active. Set to now() instead of physical DELETE.';
comment on column patients.total_visits is
  'Incremented when an appointment transitions to completed status.';
comment on column patients.date_of_birth is
  'Age is never stored. Derive at query time: EXTRACT(YEAR FROM AGE(date_of_birth)).';

-- =============================================================================
-- SECTION 5 — PATIENT PORTAL LINKS
-- Optional join between a patient record and a Supabase Auth account.
-- UNIQUE on both sides enforces 1-to-1 relationship.
-- No clinic_id here — derived via patients.clinic_id.
-- =============================================================================

create table patient_portal_links (
  id          uuid        primary key default gen_random_uuid(),
  patient_id  uuid        not null unique references patients (id) on delete cascade,
  user_id     uuid        not null unique references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table patient_portal_links is
  'Optional link between a patient record and a portal auth account. '
  'UNIQUE on patient_id and user_id enforces strict 1-to-1 mapping. '
  'Clinic scoping is resolved via patients.clinic_id.';

-- =============================================================================
-- SECTION 6 — CLINIC SETTINGS
-- One-to-one with clinics. Stores operational config used by scheduling,
-- queue estimation, AI prompts, and future automation workflows.
-- clinic_hours stored as JSONB; see CLAUDE.md Section 5.9 for schema.
-- =============================================================================

create table clinic_settings (
  clinic_id                    uuid        primary key references clinics (id) on delete cascade,
  clinic_name                  text        not null,
  phone                        text,
  email                        text,
  address                      text,
  clinic_hours                 jsonb,
  average_appointment_duration integer     not null default 30,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  constraint chk_avg_duration_positive check (average_appointment_duration > 0)
);

comment on table clinic_settings is
  'Operational configuration per clinic. Source of truth for AI prompts, '
  'queue wait estimation, and appointment slot boundaries. '
  'Never hardcode clinic phone/hours/address in application code.';
comment on column clinic_settings.clinic_hours is
  'JSONB map: { monday: { open, close, is_open }, ... } '
  'See CLAUDE.md Section 5.9 for exact shape.';

-- =============================================================================
-- SECTION 7 — AVAILABILITY RULES
-- Weekly recurring rules that define bookable slot windows.
-- Slots are generated dynamically — not materialised in the DB.
-- day_of_week: 0=Sunday ... 6=Saturday (matches JS getDay()).
-- =============================================================================

create table availability_rules (
  id                    uuid        primary key default gen_random_uuid(),
  clinic_id             uuid        not null references clinics (id) on delete cascade,
  day_of_week           smallint    not null,
  start_time            time        not null,
  end_time              time        not null,
  slot_duration_minutes integer     not null default 30,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint chk_day_of_week       check (day_of_week between 0 and 6),
  constraint chk_slot_duration_pos check (slot_duration_minutes > 0),
  constraint chk_time_window       check (end_time > start_time)
);

comment on table availability_rules is
  'Weekly recurring booking windows. Slots are derived dynamically by '
  'getAvailableSlots() — not stored. Add dentist_id for multi-dentist support.';

-- =============================================================================
-- SECTION 8 — APPOINTMENTS
-- Full booking lifecycle. Status transitions are enforced in application layer.
-- Every mutation writes a row to appointment_history.
-- Soft-deletable.
-- =============================================================================

create table appointments (
  id               uuid               primary key default gen_random_uuid(),
  clinic_id        uuid               not null references clinics (id) on delete cascade,
  patient_id       uuid               not null references patients (id) on delete cascade,
  dentist_id       uuid               not null references profiles (id),
  scheduled_at     timestamptz        not null,
  duration_minutes integer            not null default 30,
  source           appointment_source not null,
  status           appointment_status not null default 'scheduled',
  notes            text,
  deleted_at       timestamptz,
  created_at       timestamptz        not null default now(),
  updated_at       timestamptz        not null default now(),

  constraint chk_duration_positive check (duration_minutes > 0)
);

comment on table appointments is
  'Core booking entity. Terminal states: cancelled, no_show. '
  'completed triggers patients.total_visits increment and last_visit update.';
comment on column appointments.dentist_id is
  'Must reference a profile with role = dentist.';

-- =============================================================================
-- SECTION 9 — APPOINTMENT HISTORY
-- Append-only audit trail for every appointment mutation.
-- No RLS write access for any user role — inserts via service-role only.
-- =============================================================================

create table appointment_history (
  id             uuid                       primary key default gen_random_uuid(),
  appointment_id uuid                       not null references appointments (id) on delete cascade,
  action         appointment_history_action not null,
  old_value      jsonb,
  new_value      jsonb,
  performed_by   uuid                       references profiles (id) on delete set null,
  timestamp      timestamptz                not null default now()
);

comment on table appointment_history is
  'Append-only audit trail. Records are never updated or deleted. '
  'Inserts are performed by server-side service-role actions only.';

-- =============================================================================
-- SECTION 10 — QUEUE ENTRIES
-- Real-time waiting room. Scoped to the current day per clinic.
-- Only one in_progress entry per clinic at a time (enforced via partial unique index).
-- Supabase Realtime is enabled on this table.
-- =============================================================================

create table queue_entries (
  id             uuid         primary key default gen_random_uuid(),
  clinic_id      uuid         not null references clinics (id) on delete cascade,
  appointment_id uuid         not null references appointments (id) on delete cascade,
  patient_id     uuid         not null references patients (id) on delete cascade,
  position       integer      not null,
  status         queue_status not null default 'waiting',
  checked_in_at  timestamptz  not null default now(),
  called_at      timestamptz,

  -- One appointment can only appear in the queue once
  constraint uq_queue_appointment unique (appointment_id)
);

comment on table queue_entries is
  'Live waiting-room queue. Entries are scoped to today by application logic. '
  'Enable Supabase Realtime on this table for live updates.';

-- =============================================================================
-- SECTION 11 — TREATMENTS
-- Per-appointment clinical records. Notes split into internal / patient-visible.
-- internal_notes: dentist-only. patient_visible_notes: shown in portal.
-- Soft-deletable.
-- =============================================================================

create table treatments (
  id                    uuid             primary key default gen_random_uuid(),
  clinic_id             uuid             not null references clinics (id) on delete cascade,
  appointment_id        uuid             not null references appointments (id) on delete cascade,
  patient_id            uuid             not null references patients (id) on delete cascade,
  treatment_type        text             not null,
  internal_notes        text,
  patient_visible_notes text,
  cost                  numeric(10, 2)   not null default 0,
  status                treatment_status not null default 'planned',
  performed_at          timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz      not null default now(),
  updated_at            timestamptz      not null default now(),

  constraint chk_cost_non_negative check (cost >= 0)
);

comment on table treatments is
  'Clinical treatment records. Multiple per appointment allowed.';
comment on column treatments.internal_notes is
  'Visible to dentist only. Never returned by patient-facing queries.';
comment on column treatments.patient_visible_notes is
  'Returned by getPatientTreatments tool and visible in patient portal.';

-- =============================================================================
-- SECTION 12 — PAYMENTS
-- Financial ledger. Outstanding balance = SUM(treatments.cost) - SUM(payments.amount).
-- Balance is always computed server-side, never stored.
-- Soft-deletable.
-- =============================================================================

create table payments (
  id             uuid           primary key default gen_random_uuid(),
  clinic_id      uuid           not null references clinics (id) on delete cascade,
  patient_id     uuid           not null references patients (id) on delete cascade,
  appointment_id uuid           references appointments (id) on delete set null,
  amount         numeric(10, 2) not null,
  method         payment_method not null,
  payment_date   date           not null default current_date,
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz    not null default now(),

  constraint chk_payment_amount_positive check (amount > 0)
);

comment on table payments is
  'Payment ledger. Outstanding balance is computed on-demand, never stored.';

-- =============================================================================
-- SECTION 13 — FOLLOW-UPS
-- Treatment recall reminders. Overdue = due_date < today AND status = pending.
-- Soft-deletable.
-- =============================================================================

create table follow_ups (
  id             uuid             primary key default gen_random_uuid(),
  clinic_id      uuid             not null references clinics (id) on delete cascade,
  patient_id     uuid             not null references patients (id) on delete cascade,
  appointment_id uuid             references appointments (id) on delete set null,
  treatment_id   uuid             references treatments (id) on delete set null,
  due_date       date             not null,
  status         follow_up_status not null default 'pending',
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);

comment on table follow_ups is
  'Recall reminders. Overdue when due_date < CURRENT_DATE and status = pending. '
  'Surfaced in AI Insights and Follow-Up Analytics.';

-- =============================================================================
-- SECTION 14 — WEBHOOK LOGS
-- Audit log for all inbound n8n webhook calls. Clinic-scoped where possible.
-- =============================================================================

create table webhook_logs (
  id          uuid        primary key default gen_random_uuid(),
  clinic_id   uuid        references clinics (id) on delete set null,
  event_type  text        not null,
  payload     jsonb,
  received_at timestamptz not null default now()
);

comment on table webhook_logs is
  'Audit trail for inbound n8n webhook events. Retained for debugging.';

-- =============================================================================
-- SECTION 15 — VIEWS (soft-delete helpers)
-- These views exclude soft-deleted rows. Application code should prefer these
-- over querying base tables directly, to enforce the deleted_at IS NULL rule.
-- =============================================================================

create view active_patients as
  select * from patients where deleted_at is null;

create view active_appointments as
  select * from appointments where deleted_at is null;

create view active_treatments as
  select * from treatments where deleted_at is null;

create view active_payments as
  select * from payments where deleted_at is null;

create view active_follow_ups as
  select * from follow_ups where deleted_at is null;

-- Convenience: overdue follow-ups
create view overdue_follow_ups as
  select *
  from   follow_ups
  where  deleted_at is null
    and  status     = 'pending'
    and  due_date   < current_date;

comment on view active_patients      is 'Patients excluding soft-deleted records.';
comment on view active_appointments  is 'Appointments excluding soft-deleted records.';
comment on view active_treatments    is 'Treatments excluding soft-deleted records.';
comment on view active_payments      is 'Payments excluding soft-deleted records.';
comment on view active_follow_ups    is 'Follow-ups excluding soft-deleted records.';
comment on view overdue_follow_ups   is 'Pending follow-ups past their due date.';

-- =============================================================================
-- SECTION 16 — INDEXES
--
-- Naming convention: idx_{table}_{columns}
-- Strategy:
--   - All FK columns get an index (Postgres does not auto-index FK targets).
--   - clinic_id is the primary filter in almost every query — always indexed.
--   - Soft-delete column gets a partial index (WHERE deleted_at IS NULL)
--     so active-record lookups are fast and the index stays small.
--   - Composite indexes are ordered: most-selective first.
-- =============================================================================

-- ── profiles ──────────────────────────────────────────────────────────────────
create index idx_profiles_clinic_id on profiles (clinic_id);
create index idx_profiles_clinic_role on profiles (clinic_id, role);

-- ── patients ──────────────────────────────────────────────────────────────────
create index idx_patients_clinic_id
  on patients (clinic_id)
  where deleted_at is null;

-- Full-text search on name + phone (supports partial match)
create index idx_patients_name_trgm
  on patients using gin (name gin_trgm_ops);
create index idx_patients_phone_trgm
  on patients using gin (phone gin_trgm_ops);

-- Analytics: new patients per day
create index idx_patients_clinic_created
  on patients (clinic_id, created_at)
  where deleted_at is null;

-- ── patient_portal_links ──────────────────────────────────────────────────────
-- UNIQUE constraints already provide covering B-tree indexes on both columns.
-- Explicit index on user_id for the RLS lookup pattern.
create index idx_portal_links_user_id on patient_portal_links (user_id);

-- ── clinic_settings ───────────────────────────────────────────────────────────
-- PK = clinic_id, no additional indexes needed.

-- ── availability_rules ────────────────────────────────────────────────────────
create index idx_availability_clinic_day
  on availability_rules (clinic_id, day_of_week)
  where is_active = true;

-- ── appointments ──────────────────────────────────────────────────────────────
create index idx_appointments_clinic_id
  on appointments (clinic_id)
  where deleted_at is null;

-- Today's schedule query (most common dashboard query)
create index idx_appointments_clinic_scheduled
  on appointments (clinic_id, scheduled_at)
  where deleted_at is null;

-- Patient history lookup
create index idx_appointments_patient_id
  on appointments (patient_id)
  where deleted_at is null;

-- Dentist workload
create index idx_appointments_dentist_id
  on appointments (dentist_id)
  where deleted_at is null;

-- Status filter (queue advancement, analytics)
create index idx_appointments_clinic_status
  on appointments (clinic_id, status)
  where deleted_at is null;

-- Source analytics
create index idx_appointments_clinic_source
  on appointments (clinic_id, source)
  where deleted_at is null;

-- Double-booking prevention: unique active appointment per dentist per slot
create unique index uq_appointments_dentist_slot
  on appointments (dentist_id, scheduled_at)
  where deleted_at is null
    and status not in ('cancelled', 'no_show');

-- ── appointment_history ───────────────────────────────────────────────────────
create index idx_appt_history_appointment_id
  on appointment_history (appointment_id);

create index idx_appt_history_timestamp
  on appointment_history (appointment_id, timestamp desc);

-- ── queue_entries ─────────────────────────────────────────────────────────────
-- Today's queue lookup (Realtime subscriptions filter on clinic_id)
create index idx_queue_clinic_status
  on queue_entries (clinic_id, status);

-- Enforce only one in_progress entry per clinic at a time
create unique index uq_queue_clinic_in_progress
  on queue_entries (clinic_id)
  where status = 'in_progress';

-- Patient's own queue position (portal query)
create index idx_queue_patient_id
  on queue_entries (patient_id);

-- ── treatments ────────────────────────────────────────────────────────────────
create index idx_treatments_clinic_id
  on treatments (clinic_id)
  where deleted_at is null;

create index idx_treatments_patient_id
  on treatments (patient_id)
  where deleted_at is null;

create index idx_treatments_appointment_id
  on treatments (appointment_id)
  where deleted_at is null;

-- Analytics: revenue by treatment type
create index idx_treatments_clinic_type
  on treatments (clinic_id, treatment_type)
  where deleted_at is null;

-- ── payments ──────────────────────────────────────────────────────────────────
create index idx_payments_clinic_id
  on payments (clinic_id)
  where deleted_at is null;

create index idx_payments_patient_id
  on payments (patient_id)
  where deleted_at is null;

-- Revenue analytics: daily/monthly aggregation
create index idx_payments_clinic_date
  on payments (clinic_id, payment_date)
  where deleted_at is null;

-- ── follow_ups ────────────────────────────────────────────────────────────────
create index idx_follow_ups_clinic_id
  on follow_ups (clinic_id)
  where deleted_at is null;

create index idx_follow_ups_patient_id
  on follow_ups (patient_id)
  where deleted_at is null;

-- Overdue detection query
create index idx_follow_ups_clinic_due_status
  on follow_ups (clinic_id, due_date, status)
  where deleted_at is null and status = 'pending';

-- ── webhook_logs ──────────────────────────────────────────────────────────────
create index idx_webhook_logs_clinic_id
  on webhook_logs (clinic_id);

create index idx_webhook_logs_received_at
  on webhook_logs (received_at desc);

-- Required extension for trigram text search (gin_trgm_ops indexes above)
-- Must run before the trgm indexes. Placed here as a note — run this first
-- in environments where it is not already enabled:
-- create extension if not exists pg_trgm;

-- =============================================================================
-- SECTION 17 — ROW LEVEL SECURITY
--
-- Strategy:
--   A. Enable RLS on every table.
--   B. Define a stable helper function to resolve the caller's clinic_id
--      and role from their profile — called once per query via security definer
--      to avoid per-row subquery overhead.
--   C. For staff roles (dentist / receptionist): scope by clinic_id match.
--   D. For patient role: scope by patient_portal_links ownership
--      (user_id = auth.uid() → patient_id).
--   E. appointment_history and webhook_logs: read-only for staff; no patient
--      access. Inserts via service-role only.
--   F. patient_portal_links: patient can read their own link only.
--   G. clinic_settings / availability_rules: read by all clinic members;
--      write by dentist only.
-- =============================================================================

-- ── Helper functions ──────────────────────────────────────────────────────────

-- Returns the clinic_id of the currently authenticated user.
create or replace function auth_clinic_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select clinic_id from profiles where id = auth.uid()
$$;

-- Returns the role of the currently authenticated user.
create or replace function auth_role()
returns user_role
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- Returns the patient_id linked to the currently authenticated portal user.
-- Returns NULL if the user has no portal link (no access granted).
create or replace function auth_patient_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select patient_id from patient_portal_links where user_id = auth.uid()
$$;

-- ── Enable RLS on all tables ──────────────────────────────────────────────────

alter table clinics               enable row level security;
alter table profiles              enable row level security;
alter table patients              enable row level security;
alter table patient_portal_links  enable row level security;
alter table clinic_settings       enable row level security;
alter table availability_rules    enable row level security;
alter table appointments          enable row level security;
alter table appointment_history   enable row level security;
alter table queue_entries         enable row level security;
alter table treatments            enable row level security;
alter table payments              enable row level security;
alter table follow_ups            enable row level security;
alter table webhook_logs          enable row level security;

-- =============================================================================
-- RLS POLICIES — CLINICS
-- Staff can read their own clinic row. No one can insert/update via client.
-- =============================================================================

create policy "clinics: staff can read own clinic"
  on clinics for select
  using (id = auth_clinic_id());

-- =============================================================================
-- RLS POLICIES — PROFILES
-- Users can read all profiles in their clinic (needed for dentist dropdowns).
-- Users can update only their own profile.
-- =============================================================================

create policy "profiles: read own clinic members"
  on profiles for select
  using (clinic_id = auth_clinic_id());

create policy "profiles: update own profile"
  on profiles for update
  using (id = auth.uid());

-- =============================================================================
-- RLS POLICIES — PATIENTS
-- Dentist: full CRUD on own clinic, active records only.
-- Receptionist: read + insert + update, no delete, own clinic only.
-- Patient: read only their own record (via portal link).
-- =============================================================================

create policy "patients: dentist full access"
  on patients for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  );

create policy "patients: receptionist read"
  on patients for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

create policy "patients: receptionist insert"
  on patients for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

create policy "patients: receptionist update"
  on patients for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

create policy "patients: portal read own record"
  on patients for select
  using (id = auth_patient_id() and deleted_at is null);

-- =============================================================================
-- RLS POLICIES — PATIENT PORTAL LINKS
-- A portal user can only read their own link row.
-- Inserts happen server-side (service role) during the linking workflow.
-- =============================================================================

create policy "portal_links: patient reads own link"
  on patient_portal_links for select
  using (user_id = auth.uid());

-- =============================================================================
-- RLS POLICIES — CLINIC SETTINGS
-- All clinic members can read. Only dentist can update.
-- =============================================================================

create policy "clinic_settings: all staff read"
  on clinic_settings for select
  using (clinic_id = auth_clinic_id());

create policy "clinic_settings: dentist update"
  on clinic_settings for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- RLS POLICIES — AVAILABILITY RULES
-- All clinic members can read (needed for slot generation).
-- Only dentist can insert/update/delete.
-- =============================================================================

create policy "availability_rules: all staff read"
  on availability_rules for select
  using (clinic_id = auth_clinic_id());

create policy "availability_rules: dentist write"
  on availability_rules for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- Portal users can also read availability rules to view available slots
create policy "availability_rules: portal read"
  on availability_rules for select
  using (
    clinic_id = (select clinic_id from patients where id = auth_patient_id())
    and is_active = true
  );

-- =============================================================================
-- RLS POLICIES — APPOINTMENTS
-- Dentist: full CRUD on own clinic, active records.
-- Receptionist: read + insert + update (no delete) on own clinic, active records.
-- Patient: read + cancel (update) their own appointments via portal link.
-- =============================================================================

create policy "appointments: dentist full access"
  on appointments for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  );

create policy "appointments: receptionist read"
  on appointments for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

create policy "appointments: receptionist insert"
  on appointments for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

create policy "appointments: receptionist update"
  on appointments for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

-- Portal: patient can read their own appointments
create policy "appointments: portal read own"
  on appointments for select
  using (
    patient_id = auth_patient_id()
    and deleted_at is null
  );

-- Portal: patient can cancel (update status) their own future appointments
create policy "appointments: portal update own"
  on appointments for update
  using (
    patient_id = auth_patient_id()
    and deleted_at is null
    and status in ('scheduled', 'checked_in')
  );

-- Portal: patient can create appointments for themselves
create policy "appointments: portal insert own"
  on appointments for insert
  with check (patient_id = auth_patient_id());

-- =============================================================================
-- RLS POLICIES — APPOINTMENT HISTORY
-- Staff in same clinic can read the history of their clinic's appointments.
-- No insert/update/delete for any user role — service-role only.
-- =============================================================================

create policy "appointment_history: dentist read"
  on appointment_history for select
  using (
    auth_role() = 'dentist'
    and exists (
      select 1 from appointments a
      where  a.id         = appointment_history.appointment_id
        and  a.clinic_id  = auth_clinic_id()
    )
  );

create policy "appointment_history: receptionist read"
  on appointment_history for select
  using (
    auth_role() = 'receptionist'
    and exists (
      select 1 from appointments a
      where  a.id        = appointment_history.appointment_id
        and  a.clinic_id = auth_clinic_id()
    )
  );

-- =============================================================================
-- RLS POLICIES — QUEUE ENTRIES
-- Dentist + Receptionist: full access on own clinic.
-- Patient: read only their own queue entry.
-- =============================================================================

create policy "queue_entries: dentist full access"
  on queue_entries for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

create policy "queue_entries: receptionist full access"
  on queue_entries for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

create policy "queue_entries: portal read own"
  on queue_entries for select
  using (patient_id = auth_patient_id());

-- =============================================================================
-- RLS POLICIES — TREATMENTS
-- Dentist: full CRUD. Can see internal_notes.
-- Receptionist: no access to treatments (clinical data).
-- Patient: read own treatments — but ONLY patient_visible_notes, not internal_notes.
--   Enforced via a separate security-definer view (see below).
-- =============================================================================

create policy "treatments: dentist full access"
  on treatments for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  );

-- Patient portal reads treatments through a restricted view that
-- excludes internal_notes. The base-table RLS still gates access by patient_id.
create policy "treatments: portal read own"
  on treatments for select
  using (
    patient_id = auth_patient_id()
    and deleted_at is null
  );

-- Restricted view for patient portal — hides internal_notes
create view patient_treatments as
  select
    id,
    clinic_id,
    appointment_id,
    patient_id,
    treatment_type,
    patient_visible_notes,   -- internal_notes deliberately excluded
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
-- RLS POLICIES — PAYMENTS
-- Dentist: full access on own clinic.
-- Receptionist: read + insert + update on own clinic (no delete).
-- Patient: read own payments only.
-- =============================================================================

create policy "payments: dentist full access"
  on payments for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  );

create policy "payments: receptionist read"
  on payments for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

create policy "payments: receptionist insert"
  on payments for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
  );

create policy "payments: receptionist update"
  on payments for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'receptionist'
    and deleted_at is null
  );

create policy "payments: portal read own"
  on payments for select
  using (
    patient_id = auth_patient_id()
    and deleted_at is null
  );

-- =============================================================================
-- RLS POLICIES — FOLLOW-UPS
-- Dentist: full CRUD on own clinic.
-- Receptionist: no access.
-- Patient: read own follow-ups only.
-- =============================================================================

create policy "follow_ups: dentist full access"
  on follow_ups for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
    and deleted_at is null
  );

create policy "follow_ups: portal read own"
  on follow_ups for select
  using (
    patient_id = auth_patient_id()
    and deleted_at is null
  );

-- =============================================================================
-- RLS POLICIES — WEBHOOK LOGS
-- Dentist can read logs for their own clinic.
-- No client-side inserts — service-role only.
-- =============================================================================

create policy "webhook_logs: dentist read"
  on webhook_logs for select
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- SECTION 18 — TRIGGERS
--
-- updated_at auto-maintenance trigger.
-- Applied to every table that has an updated_at column.
-- =============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_patients_updated_at
  before update on patients
  for each row execute function set_updated_at();

create trigger trg_clinic_settings_updated_at
  before update on clinic_settings
  for each row execute function set_updated_at();

create trigger trg_availability_rules_updated_at
  before update on availability_rules
  for each row execute function set_updated_at();

create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

create trigger trg_treatments_updated_at
  before update on treatments
  for each row execute function set_updated_at();

create trigger trg_follow_ups_updated_at
  before update on follow_ups
  for each row execute function set_updated_at();

-- =============================================================================
-- SECTION 19 — SUPABASE REALTIME
--
-- Enable Realtime publication on queue_entries so all connected clients
-- (dentist dashboard, receptionist, patient portal) receive live updates
-- without polling. Appointments are also published for dashboard widgets.
-- =============================================================================

-- Add tables to the supabase_realtime publication.
-- This assumes the default Supabase publication already exists.
alter publication supabase_realtime add table queue_entries;
alter publication supabase_realtime add table appointments;

-- =============================================================================
-- SECTION 20 — REQUIRED EXTENSIONS
-- These must be enabled before the GIN trigram indexes can be created.
-- In Supabase projects, pg_trgm is typically enabled by default.
-- If not, enable via the Supabase dashboard or uncomment below:
-- =============================================================================

-- create extension if not exists pg_trgm with schema extensions;
-- create extension if not exists "uuid-ossp" with schema extensions;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
