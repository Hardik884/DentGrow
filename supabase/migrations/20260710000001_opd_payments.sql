-- =============================================================================
-- OPD Payments
--
-- Adds a `payment_type` discriminator to the payments ledger so that
-- consultation / OPD payments (recorded without a linked treatment) can be
-- distinguished from treatment payments in history, filters and analytics.
--
-- All existing rows default to 'treatment' — behaviour is unchanged for them.
-- OPD payments still flow through the same ledger, so revenue, daily totals
-- and analytics continue to work without any additional wiring.
-- =============================================================================

alter table payments
  add column if not exists payment_type text not null default 'treatment';

alter table payments
  drop constraint if exists chk_payment_type;

alter table payments
  add constraint chk_payment_type
  check (payment_type in ('treatment', 'opd'));

comment on column payments.payment_type is
  'Discriminates treatment payments from standalone OPD / consultation payments.';

-- Filter/aggregate OPD vs treatment revenue efficiently.
create index if not exists idx_payments_clinic_type
  on payments (clinic_id, payment_type)
  where deleted_at is null;
