-- =============================================================================
-- Follow-Up Confirmation Status
--
-- Adds a "confirmation_status" to follow-up appointments so staff can mark a
-- follow-up as Tentative or Confirmed. This is distinct from the lifecycle
-- `status` column (pending / completed / cancelled) — it captures whether the
-- follow-up appointment is provisional or locked in.
--
-- Defaults to 'confirmed' so existing follow-ups keep their current behaviour.
-- =============================================================================

create type follow_up_confirmation_status as enum (
  'tentative',
  'confirmed'
);

alter table public.follow_ups
  add column if not exists confirmation_status follow_up_confirmation_status
    not null default 'confirmed';
