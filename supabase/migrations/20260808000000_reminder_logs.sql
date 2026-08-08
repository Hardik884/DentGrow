-- =============================================================================
-- reminder_logs — records that a patient reminder was actually sent
-- Migration: 20260808000000_reminder_logs.sql
--
-- Why:
--   The WhatsApp reminder lists (overdue follow-up / payment / planned-treatment)
--   are recomputed from live data on every page load. With no record of what was
--   already sent, the same patient reappears on every refresh and can be messaged
--   repeatedly for the same problem. This table is that record: one row each time
--   a staff member confirms they sent a patient's message.
--
--   The send list excludes a patient from a given kind while a recent row exists
--   (a cooldown), so a patient is contacted once per problem, not once per
--   refresh. DentGrow still never sends anything itself — this only remembers
--   that a human did, so the list stops offering the same message again.
--
--   Append-only by convention: rows are inserted when a reminder is sent and read
--   to suppress duplicates. Nothing updates or deletes them in normal operation.
-- =============================================================================

create table reminder_logs (
  id         uuid        primary key default gen_random_uuid(),
  clinic_id  uuid        not null references clinics (id) on delete cascade,
  patient_id uuid        not null references patients (id) on delete cascade,
  -- The ActionDraftKind the message belonged to, e.g. 'recall_invitation',
  -- 'payment_reminder', 'treatment_plan_follow_up'. Text (not an enum) so adding
  -- a new reminder kind never needs a migration here.
  kind       text        not null,
  sent_at    timestamptz not null default now(),
  sent_by    uuid        references profiles (id),
  created_at timestamptz not null default now()
);

comment on table reminder_logs is
  'Append-only record that a staff member sent a WhatsApp reminder to a patient for a given kind. Read to suppress duplicate reminders across page refreshes.';

-- The one hot query: "has this patient been reminded for this kind since X?"
create index idx_reminder_logs_lookup
  on reminder_logs (clinic_id, patient_id, kind, sent_at desc);

alter table reminder_logs enable row level security;

-- Staff (dentist + receptionist) manage reminder logs for their own clinic only.
-- WITH CHECK pins clinic_id to the actor's clinic so a client cannot write a row
-- against another tenant. Patients have no access.
create policy "reminder_logs: dentist full access"
  on reminder_logs for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');

create policy "reminder_logs: receptionist full access"
  on reminder_logs for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'receptionist')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'receptionist');
