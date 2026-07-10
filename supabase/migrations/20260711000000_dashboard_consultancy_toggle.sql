-- =============================================================================
-- Dashboard External Consultation Income toggle
-- =============================================================================
-- Adds a per-clinic setting controlling whether the dentist dashboard shows
-- today's External Consultation Income card. Defaults to ON (true) so existing
-- clinics keep seeing the card unless they explicitly disable it.
--
-- The External Consultations page itself remains accessible regardless of this
-- setting — this toggle only governs dashboard widgets/cards.
-- =============================================================================

alter table clinic_settings
  add column if not exists show_consultancy_on_dashboard boolean not null default true;

comment on column clinic_settings.show_consultancy_on_dashboard is
  'When true, the dentist dashboard shows today''s External Consultation Income card. '
  'The External Consultations page is always accessible regardless of this flag.';
