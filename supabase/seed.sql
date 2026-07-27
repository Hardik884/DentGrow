-- =============================================================================
-- DentGrow — LOCAL DEVELOPMENT SEED
--
-- Runs automatically after migrations on `supabase db reset` / `supabase start`.
-- It is NEVER executed by `supabase db push`, so it cannot reach a hosted project
-- through the normal deploy path.
--
-- ⚠ These are throwaway credentials for a disposable local database. Never point
--   `db reset` at a linked remote project — it drops and recreates the database.
--
-- Clinics themselves are NOT seeded here: 20260627000000_multi_clinic_pilot.sql
-- already inserts both pilot clinics idempotently, so they exist after migrations
-- and are identical in every environment. This file only adds the auth users and
-- profiles needed to actually sign in locally.
--
-- Local sign-in credentials (all passwords: `password123`):
--   dentist@dentgrow.test       — dentist,      Dr. Liying's Dental Care
--   receptionist@dentgrow.test  — receptionist, Dr. Liying's Dental Care
--
-- The login form requires a clinic selection; choose "Dr. Liying's Dental Care".
-- actions/auth.ts:signIn enforces that the chosen clinic matches profiles.clinic_id.
-- =============================================================================

-- Refuse to run against a database that already holds real data. `db reset`
-- against a linked project is destructive, and this seed would inject known
-- credentials into it. A freshly migrated local database has zero patients, so
-- this never misfires locally while still refusing to touch a populated clinic.
--
-- (Deliberately not a superuser check: Supabase's local `postgres` role is not
-- flagged usesuper, so that test aborts the normal local workflow.)
do $$
declare
  v_patients bigint;
begin
  select count(*) into v_patients from patients;
  if v_patients > 0 then
    raise exception
      'seed.sql refused to run: this database already contains % patient row(s), '
      'so it is not an empty local database. Seeds must never run against an '
      'environment with real clinic data.', v_patients;
  end if;
end $$;

-- ── Auth users ────────────────────────────────────────────────────────────────
-- Passwords are hashed with pgcrypto's crypt(), the same scheme GoTrue uses.
-- A matching auth.identities row is required or the user cannot sign in.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'dentist@dentgrow.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Dr. Liying"}'::jsonb,
    false, false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'eeeeeeee-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'receptionist@dentgrow.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Front Desk"}'::jsonb,
    false, false
  )
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  u.id, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.email,
  now(), now(), now()
from auth.users u
where u.email in ('dentist@dentgrow.test', 'receptionist@dentgrow.test')
on conflict (provider, provider_id) do nothing;

-- ── Profiles ──────────────────────────────────────────────────────────────────
-- clinic_id points at the pilot clinic seeded by 20260627000000.
-- Written directly (not through RLS) because seeds run as the table owner.

insert into profiles (id, clinic_id, full_name, role)
select
  u.id,
  '11111111-1111-1111-1111-111111111111',
  case u.email
    when 'dentist@dentgrow.test' then 'Dr. Liying'
    else 'Front Desk'
  end,
  case u.email
    when 'dentist@dentgrow.test' then 'dentist'::user_role
    else 'receptionist'::user_role
  end
from auth.users u
where u.email in ('dentist@dentgrow.test', 'receptionist@dentgrow.test')
on conflict (id) do nothing;
