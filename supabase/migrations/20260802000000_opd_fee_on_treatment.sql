-- =============================================================================
-- OPD consultation fee, recorded on the treatment
-- Migration: 20260802000000_opd_fee_on_treatment.sql
--
-- Background:
--   `treatments.opd_charged` already exists and records "an OPD consultation fee
--   should be collected for this visit". What has never existed is the AMOUNT.
--   Consequently an OPD fee could be collected (payments.payment_type = 'opd')
--   but never CHARGED, so the money arrived against nothing.
--
--   The visible effect is a real accounting fault: outstanding balance is
--   sum(billable treatment cost) - sum(ALL payments), and OPD payments are in
--   that second sum. A ₹300 consultation payment therefore reduced a patient's
--   TREATMENT dues by ₹300, and the clinic quietly under-billed.
--
--   This column supplies the missing charge so the two sides balance.
--
-- Why the fee is stored here and not read from clinic_settings:
--   clinic_settings.default_opd_fee is the CURRENT fee. Reading it live would
--   re-price every historical visit the moment a clinic changed its rate — a
--   patient's bill from March would silently change in August. A financial
--   record has to keep the price that was charged at the time, so the fee is
--   snapshotted onto the treatment when OPD is switched on.
--
-- Backwards compatibility:
--   Defaults to 0, and every existing row has opd_charged = false (the toggle
--   has been hidden and hard-coded to false), so no existing balance moves by a
--   single rupee. The column only becomes non-zero when a user deliberately
--   turns OPD on from the treatment form.
--
--   NOTE for the operator: OPD payments recorded BEFORE this change still have
--   no matching charge, so those patients' balances remain understated by the
--   amount of those payments. This migration deliberately does not backfill —
--   inventing a charge to match a payment would be fabricating a bill nobody
--   raised. Correct them by hand if any exist.
-- =============================================================================

alter table treatments
  add column if not exists opd_fee numeric(10, 2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'treatments'::regclass
      and conname  = 'chk_treatment_opd_fee_non_negative'
  ) then
    alter table treatments
      add constraint chk_treatment_opd_fee_non_negative
      check (opd_fee >= 0);
  end if;
end $$;

comment on column treatments.opd_fee is
  'Consultation fee charged for this visit, snapshotted from '
  'clinic_settings.default_opd_fee at the moment opd_charged was set true. '
  'Zero when opd_charged is false. Stored rather than looked up so that '
  'changing the clinic''s fee never re-prices a historical bill.';
