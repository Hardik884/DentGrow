-- =============================================================================
-- DentGrow — Consultant Management & Revenue Distribution
-- Migration: 20260706000000_consultant_management.sql
--
-- Purpose:
--   Support clinics where treatments are performed by external consultants who
--   receive a percentage-based or flat commission. Clinic revenue must reflect
--   net earnings after consultant payouts (clinic_share), while the patient
--   still owes the full gross treatment amount (cost). Also adds external
--   consultancy income tracking for dentists, plus consultancy schedules and
--   unavailable days that block appointment slots.
--
-- What this migration adds:
--   1. consultants            — clinic-scoped directory of consultant names.
--   2. consultancy_income     — external earnings a dentist records (no patient,
--                               no appointment, no clinic payment).
--   3. consultancy_schedules  — recurring weekly time blocks that remove slots.
--   4. unavailable_dates      — full-day holidays that block all bookings.
--   5. treatments.*           — revenue-distribution columns. `cost` remains the
--                               gross amount; `clinic_share` is the net revenue.
--
-- Multi-clinic isolation and RLS follow the existing auth_clinic_id()/auth_role()
-- helper pattern used across the schema.
-- =============================================================================

-- =============================================================================
-- 1. CONSULTANTS — clinic-scoped directory
-- =============================================================================

create table if not exists consultants (
  id          uuid        primary key default gen_random_uuid(),
  clinic_id   uuid        not null references clinics (id) on delete cascade,
  name        text        not null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One active consultant per name per clinic (case-insensitive).
create unique index if not exists consultants_clinic_name_active_uidx
  on consultants (clinic_id, lower(name))
  where is_active;

create index if not exists consultants_clinic_idx on consultants (clinic_id);

comment on table consultants is
  'Clinic-scoped directory of consultant names used for treatment revenue allocation. '
  'Not an authentication entity — consultants do not log in.';

-- =============================================================================
-- 2. CONSULTANCY INCOME — external earnings recorded by a dentist
-- =============================================================================

create table if not exists consultancy_income (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references clinics (id) on delete cascade,
  dentist_id      uuid        not null references profiles (id) on delete cascade,
  date            date        not null,
  external_clinic text        not null,
  description     text        not null,
  amount          numeric(12,2) not null check (amount >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists consultancy_income_clinic_idx
  on consultancy_income (clinic_id, date);
create index if not exists consultancy_income_dentist_idx
  on consultancy_income (dentist_id, date);

comment on table consultancy_income is
  'External consultancy earnings a dentist records for work done at other clinics. '
  'Never creates a patient, appointment, or clinic payment. Reported separately '
  'from clinic revenue as part of total income.';

-- =============================================================================
-- 3. CONSULTANCY SCHEDULES — recurring weekly blocks that remove slots
-- =============================================================================

create table if not exists consultancy_schedules (
  id          uuid        primary key default gen_random_uuid(),
  clinic_id   uuid        not null references clinics (id) on delete cascade,
  dentist_id  uuid        references profiles (id) on delete cascade,
  day_of_week smallint    not null check (day_of_week between 0 and 6),
  start_time  time        not null,
  end_time    time        not null,
  reason      text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists consultancy_schedules_clinic_dow_idx
  on consultancy_schedules (clinic_id, day_of_week)
  where is_active;

comment on table consultancy_schedules is
  'Recurring weekly time ranges when the dentist consults externally. Overlapping '
  'appointment slots are removed from availability for all booking channels.';

-- =============================================================================
-- 4. UNAVAILABLE DATES — full-day holidays / closures
-- =============================================================================

create table if not exists unavailable_dates (
  id          uuid        primary key default gen_random_uuid(),
  clinic_id   uuid        not null references clinics (id) on delete cascade,
  dentist_id  uuid        references profiles (id) on delete cascade,
  date        date        not null,
  reason      text,
  created_at  timestamptz not null default now()
);

create unique index if not exists unavailable_dates_clinic_date_uidx
  on unavailable_dates (clinic_id, date);

comment on table unavailable_dates is
  'Full-day closures / holidays. No appointments may be booked on these dates '
  'through any channel (dentist, receptionist, patient portal).';

-- =============================================================================
-- 5. TREATMENTS — revenue distribution columns
--
--   cost             — GROSS treatment amount (unchanged; patient owes this).
--   consultant_id    — NULL = performed by treating dentist.
--   commission_type  — 'percentage' | 'fixed' (NULL when no consultant).
--   commission_value — percent (0-100) or fixed currency amount.
--   consultant_share — computed payout to the consultant.
--   clinic_share     — NET clinic revenue = cost - consultant_share.
-- =============================================================================

alter table treatments
  add column if not exists consultant_id    uuid references consultants (id) on delete set null,
  add column if not exists commission_type  text check (commission_type in ('percentage', 'fixed')),
  add column if not exists commission_value numeric(12,2) check (commission_value >= 0),
  add column if not exists consultant_share numeric(12,2) check (consultant_share >= 0),
  add column if not exists clinic_share     numeric(12,2) check (clinic_share >= 0);

comment on column treatments.cost is
  'GROSS treatment amount. The patient always owes this full amount.';
comment on column treatments.clinic_share is
  'NET clinic revenue after consultant payout. Equals cost when no consultant. '
  'Source of truth for clinic revenue analytics.';
comment on column treatments.consultant_share is
  'Amount paid to the consultant for this treatment. 0 / NULL when none.';

create index if not exists treatments_consultant_idx
  on treatments (consultant_id)
  where consultant_id is not null;

-- =============================================================================
-- 6. ENABLE RLS
-- =============================================================================

alter table consultants           enable row level security;
alter table consultancy_income    enable row level security;
alter table consultancy_schedules enable row level security;
alter table unavailable_dates     enable row level security;

-- =============================================================================
-- 7. RLS POLICIES — CONSULTANTS
-- Staff (dentist + receptionist) read their clinic's directory.
-- Dentist has full write access.
-- =============================================================================

create policy "consultants: staff read own clinic"
  on consultants for select
  using (clinic_id = auth_clinic_id());

create policy "consultants: dentist write"
  on consultants for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- 8. RLS POLICIES — CONSULTANCY INCOME (dentist-only, own clinic)
-- =============================================================================

create policy "consultancy_income: dentist full access"
  on consultancy_income for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- 9. RLS POLICIES — CONSULTANCY SCHEDULES
-- All clinic staff read; portal patients read (needed for slot blocking).
-- Dentist has full write access.
-- =============================================================================

create policy "consultancy_schedules: staff read own clinic"
  on consultancy_schedules for select
  using (clinic_id = auth_clinic_id());

create policy "consultancy_schedules: portal read"
  on consultancy_schedules for select
  using (
    clinic_id = (select clinic_id from patients where id = auth_patient_id())
    and is_active = true
  );

create policy "consultancy_schedules: dentist write"
  on consultancy_schedules for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- 10. RLS POLICIES — UNAVAILABLE DATES
-- All clinic staff read; portal patients read (needed for booking checks).
-- Dentist has full write access.
-- =============================================================================

create policy "unavailable_dates: staff read own clinic"
  on unavailable_dates for select
  using (clinic_id = auth_clinic_id());

create policy "unavailable_dates: portal read"
  on unavailable_dates for select
  using (
    clinic_id = (select clinic_id from patients where id = auth_patient_id())
  );

create policy "unavailable_dates: dentist write"
  on unavailable_dates for all
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'dentist'
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
