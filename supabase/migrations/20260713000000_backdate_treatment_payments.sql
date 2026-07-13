-- =============================================================================
-- Treatment → Payment linkage + OPD consultation charge flag
-- =============================================================================
-- Part of the payments workflow redesign:
--
--   1. treatments.opd_charged  — indicates whether an OPD consultation fee
--      should be collected for this treatment. Defaults to false (NO). The
--      Patient Visit payments panel only shows the OPD subsection when at
--      least one treatment on the appointment has opd_charged = true.
--
--   2. payments.treatment_id   — optionally links a treatment payment to the
--      specific treatment it pays for, so the Patient Visit payments panel can
--      track payments treatment-by-treatment. Nullable so OPD payments and
--      legacy/unassigned payments continue to work unchanged. ON DELETE SET
--      NULL keeps the payment (financial ledger) intact if a treatment is
--      hard-deleted.
--
-- Both changes are additive with safe defaults — existing rows and existing
-- payment/treatment logic are unaffected.
-- =============================================================================

alter table treatments
  add column if not exists opd_charged boolean not null default false;

comment on column treatments.opd_charged is
  'Whether an OPD (consultation) fee should be collected for this treatment. '
  'Drives visibility of the OPD payments subsection on the Patient Visit page.';

alter table payments
  add column if not exists treatment_id uuid references treatments (id) on delete set null;

comment on column payments.treatment_id is
  'Optional link to the treatment this payment is for. NULL for OPD payments '
  'and unassigned/legacy payments. Enables treatment-wise payment tracking.';

-- Look up payments for a given treatment efficiently.
create index if not exists idx_payments_treatment
  on payments (treatment_id)
  where deleted_at is null;
