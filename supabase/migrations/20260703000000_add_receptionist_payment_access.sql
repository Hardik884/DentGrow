-- =============================================================================
-- Add receptionist payment access control to clinic_settings
-- Migration: 20260703000000_add_receptionist_payment_access.sql
--
-- Adds allow_receptionist_payments boolean column to clinic_settings.
-- Default: FALSE (receptionists cannot access payments by default)
-- Dentist can toggle this in Clinic Settings to grant payment access.
-- =============================================================================

alter table clinic_settings
add column allow_receptionist_payments boolean not null default false;

comment on column clinic_settings.allow_receptionist_payments is
  'When TRUE, receptionists can view and manage payments. '
  'When FALSE, payment pages and actions are completely hidden from receptionists. '
  'Configurable by dentist only via Clinic Settings.';
