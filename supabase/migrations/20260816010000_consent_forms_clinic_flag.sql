-- =============================================================================
-- DentGrow — Patient Consent Forms: clinic rollout flag
-- Migration: 20260816010000_consent_forms_clinic_flag.sql
--
-- Purpose:
--   Patient Consent Forms is being piloted with ONE clinic before a wider
--   rollout. Adds a per-clinic opt-in flag, `clinic_settings.consent_forms_enabled`
--   (default false for every clinic), and enables it ONLY for the pilot clinic
--   ('22222222-2222-2222-2222-222222222222'). Every other clinic — including
--   '11111111-1111-1111-1111-111111111111' (Dr. Liying's Dental Care) — stays
--   disabled until explicitly turned on with the same UPDATE pattern.
--
--   This is an application-level rollout gate, not a security boundary — RLS
--   (migration 20260816000000) already fully isolates clinic data regardless
--   of this flag. The flag is checked in:
--     - lib/consents/flag.ts (shared helper)
--     - actions/consents.ts / actions/consent-templates.ts (every action,
--       defense in depth — a disabled clinic gets a clear "not enabled" error
--       even if a stale page somehow calls the action)
--     - the treatment form's inline consent section, the patient "Consent
--       Forms" tab (dentist + receptionist), the portal nav item + page, and
--       the dentist Settings > Consent Templates entry point (all hidden
--       entirely for a disabled clinic, so the feature appears not to exist).
-- =============================================================================

alter table clinic_settings
  add column if not exists consent_forms_enabled boolean not null default false;

comment on column clinic_settings.consent_forms_enabled is
  'Per-clinic opt-in for the Patient Consent Forms feature (pilot rollout). '
  'False by default for every clinic — enabled explicitly per clinic as the '
  'pilot expands. See actions/consents.ts, actions/consent-templates.ts, and '
  'lib/consents/flag.ts for where this is enforced.';

-- Enable for the pilot clinic only.
update clinic_settings
  set consent_forms_enabled = true
  where clinic_id = '22222222-2222-2222-2222-222222222222';
