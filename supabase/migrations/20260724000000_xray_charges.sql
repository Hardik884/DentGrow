-- =============================================================================
-- X-Ray Charges
--
-- Adds per-treatment X-ray tracking and a per-clinic X-ray feature toggle.
--
-- treatments.xray_taken  — whether an X-ray was taken during this treatment.
--                          Defaults to false. Existing rows are unaffected.
-- treatments.xray_cost   — the cost charged for the X-ray. NULL when no X-ray
--                          was taken. Stored separately so it is visible in the
--                          treatment record; the combined total (treatment cost
--                          + xray_cost) is submitted as treatments.cost by the
--                          form and the billing formula is not changed.
--
-- clinic_settings.enable_xray_charges — clinic-level toggle controlling whether
--                          the X-ray section appears in the treatment form.
--                          Defaults to true so existing clinics see it right away.
-- =============================================================================

alter table treatments
  add column if not exists xray_taken boolean not null default false,
  add column if not exists xray_cost  numeric(10, 2);

comment on column treatments.xray_taken is
  'Whether an X-ray was taken as part of this treatment.';

comment on column treatments.xray_cost is
  'Cost charged for the X-ray when xray_taken is true. NULL otherwise.';

alter table clinic_settings
  add column if not exists enable_xray_charges boolean not null default true;

comment on column clinic_settings.enable_xray_charges is
  'When true, the X-ray section is shown inside treatment forms for this clinic.';
