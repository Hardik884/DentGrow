-- =============================================================================
-- problem_dismissals — "I've seen this, stop showing it for a while"
-- Migration: 20260831000100_problem_dismissals.sql
--
-- Why:
--   The Morning Briefing has no way to acknowledge a problem. A card leaves only
--   when the underlying metric changes, which is a deliberate and good rule — it
--   is what makes the briefing impossible to game, because ticking something on
--   screen moves nothing. But it has a cost: a finding the clinic has genuinely
--   decided not to act on reappears every single morning, unchanged, forever.
--
--   That is the classic alert-fatigue path, and it is worse than it sounds here
--   because some of those findings are known false positives the schema cannot
--   yet express — a balance being paid in agreed installments, a treatment plan
--   the patient declined off-record. The dentist is right and the software cannot
--   be told so.
--
--   This table is being told so. It records a decision to suppress one problem
--   CATEGORY for one clinic until a date, with a reason.
--
-- What it deliberately does NOT do:
--   It does not touch the pipeline. Metrics, signals, diagnoses, constraints and
--   value are computed exactly as before and stay in the run's output; this only
--   filters what the briefing renders. So the engine's determinism is untouched,
--   a dismissal can never change a measurement, and dropping this table would
--   lose preferences rather than corrupt analysis.
--
-- The safeguard that makes it safe:
--   `severity_at_dismissal` is stored, and a dismissal is honoured only while the
--   problem is no worse than it was when dismissed. If the constraint escalates a
--   band, the card comes back regardless of the expiry date. Snoozing "3 patients
--   owe money" must not silently hide "40 patients owe money" three weeks later,
--   and a date-only expiry would do exactly that.
--
-- Shape:
--   One row per clinic + category + dismissal. Kept append-only like
--   reminder_logs: the ACTIVE dismissal is the newest unexpired row, so a history
--   of what was snoozed and why survives, and re-snoozing is an insert rather
--   than an in-place edit that would erase the previous reason.
-- =============================================================================

create table if not exists problem_dismissals (
  id           uuid        primary key default gen_random_uuid(),
  clinic_id    uuid        not null references clinics (id) on delete cascade,
  -- The Business Brain ConstraintCategory, e.g. 'revenue_leakage', 'retention',
  -- 'forward_schedule'. Text rather than an enum: categories are added most
  -- releases, and ALTER TYPE ... ADD VALUE cannot run in the same transaction as
  -- the code that uses it.
  category     text        not null,
  -- Severity the problem carried when it was dismissed. The escalation
  -- safeguard compares against this; see the header.
  severity_at_dismissal text not null,
  -- Why it was dismissed, in the dentist's own words. Not optional: a snooze
  -- with no reason is indistinguishable from a mis-click three weeks later, and
  -- the reasons are the raw material for deciding which false positives are
  -- worth fixing properly in the schema.
  reason       text        not null,
  -- When the suppression lapses. A dismissal is never permanent: the clinic
  -- changes, and a decision made in August should not silently govern November.
  expires_at   timestamptz not null,
  dismissed_by uuid        references profiles (id),
  created_at   timestamptz not null default now(),

  constraint chk_problem_dismissals_reason_present check (length(btrim(reason)) > 0),
  constraint chk_problem_dismissals_expiry_future check (expires_at > created_at)
);

comment on table problem_dismissals is
  'Records a decision to suppress one Business Brain problem category for a clinic '
  'until expires_at. Filters the briefing only — never the pipeline. Honoured only '
  'while the problem is no worse than severity_at_dismissal.';

-- The one hot query: "what is currently dismissed for this clinic?"
create index if not exists idx_problem_dismissals_active
  on problem_dismissals (clinic_id, category, expires_at desc);

alter table problem_dismissals enable row level security;

-- Dentist-only, matching every other Business Brain surface: the briefing is a
-- dentist screen, so the decision to snooze one of its cards is a dentist
-- decision. WITH CHECK pins clinic_id to the actor's clinic so a client cannot
-- write a dismissal against another tenant.
drop policy if exists "problem_dismissals: dentist full access" on problem_dismissals;
create policy "problem_dismissals: dentist full access"
  on problem_dismissals for all
  to authenticated
  using (clinic_id = (select auth_clinic_id()) and (select auth_role()) = 'dentist'::user_role)
  with check (clinic_id = (select auth_clinic_id()) and (select auth_role()) = 'dentist'::user_role);

grant select, insert, delete on problem_dismissals to authenticated;
