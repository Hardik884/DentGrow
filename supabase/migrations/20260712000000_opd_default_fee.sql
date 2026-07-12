-- =============================================================================
-- OPD Consultation default fee
-- =============================================================================
-- Adds a per-clinic default OPD (consultation) fee. Used to pre-fill the amount
-- when recording a standalone OPD payment. Clinic-specific; NULL means no
-- default has been configured (the OPD payment amount is left blank).
-- =============================================================================

alter table clinic_settings
  add column if not exists default_opd_fee numeric(10, 2);

comment on column clinic_settings.default_opd_fee is
  'Default OPD consultation fee for the clinic. Pre-fills the amount when '
  'recording a standalone OPD payment. NULL when not configured.';
