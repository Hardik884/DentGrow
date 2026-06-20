-- =============================================================================
-- DentGrow — Follow-Up Type Column
-- Migration: 20260620000000_follow_up_type.sql
--
-- Adds follow_up_type to the follow_ups table.
-- This is required to distinguish the purpose of a follow-up
-- (e.g. Review, Cleaning, Crown Check, Payment Reminder, etc.)
-- and to display meaningful labels in the list and detail views.
-- =============================================================================

-- Add follow_up_type as text with a sensible default.
-- Using text (not an enum) for forward-compatible extensibility —
-- clinics can add custom types without a schema migration.
-- The application layer enforces the allowed values via Zod.

alter table follow_ups
  add column if not exists follow_up_type text not null default 'review';

comment on column follow_ups.follow_up_type is
  'Type of follow-up. Values: review | cleaning | crown_check | root_canal_review | '
  'implant_review | payment_reminder | consultation | custom. '
  'Stored as text for extensibility; validated in the application layer.';

-- Index to support filtering/analytics by type
create index if not exists idx_follow_ups_clinic_type
  on follow_ups (clinic_id, follow_up_type)
  where deleted_at is null;

-- Rebuild active_follow_ups view to include the new column automatically
-- (it uses SELECT * so it inherits the column without a rebuild, but
-- an explicit recreate ensures the view definition is clean).
create or replace view active_follow_ups as
  select * from follow_ups where deleted_at is null;

create or replace view overdue_follow_ups as
  select *
  from   follow_ups
  where  deleted_at is null
    and  status   = 'pending'
    and  due_date < current_date;
