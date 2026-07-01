-- =============================================================================
-- DentGrow — Add Registration Number to Clinic Settings
-- Migration: 20260701000000_add_registration_number.sql
--
-- Adds support for storing the dentist's registration number in clinic_settings.
-- This registration number will be displayed alongside the digital signature in
-- the patient portal for every treatment.
--
-- Schema changes:
--   - Add registration_number column to clinic_settings (nullable TEXT)
--
-- Design:
--   - Registration number is clinic-level data, not treatment-level or dentist-level
--   - Stored as free text to support different country formats (A-12345, DCI-987654, etc.)
--   - Optional field — existing clinics continue working without it
--   - Displayed in patient portal only when configured
-- =============================================================================

-- Add registration_number column to clinic_settings
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS registration_number TEXT;

COMMENT ON COLUMN clinic_settings.registration_number IS
  'Dentist registration/license number displayed on patient-facing treatment records. '
  'Free text to support various country-specific formats (e.g., A-12345, DCI-987654, MCI-123456). '
  'Optional — shown in patient portal only when configured.';

