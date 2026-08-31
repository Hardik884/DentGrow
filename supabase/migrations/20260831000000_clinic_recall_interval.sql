-- =============================================================================
-- Per-clinic recall interval
-- Migration: 20260831000000_clinic_recall_interval.sql
--
-- Why:
--   `patients.reactivation_candidates` — the Business Brain metric that produces
--   a clinic's call-back list — counts patients last seen longer ago than a
--   recall interval that is currently a GLOBAL CONSTANT
--   (`METRIC_WINDOWS.REACTIVATION_DAYS = 180`, business-brain/engines/metrics/
--   config/metric-windows.ts).
--
--   180 days is the standard six-month recall for a general practice, and it is
--   wrong for several real ones. An orthodontic practice reviews every 6-8 weeks;
--   a paediatric list runs shorter; an implant-led practice runs longer. Judging
--   all of them against six months puts patients on a reactivation list months
--   before they are actually due, or — worse, because it is silent — leaves them
--   off it long after they lapsed.
--
--   This is the one genuinely CLINICAL number in the metric set, and the metrics
--   review has named it as the first candidate for per-clinic configuration since
--   2026-07-28. It is a property of how a practice works, not of how the software
--   measures, so it belongs in clinic_settings alongside the other operational
--   parameters (chair count, average appointment duration).
--
-- Shape:
--   Additive, defaulted, NOT NULL. Every existing clinic keeps exactly the
--   behaviour it has today — 180 days — so this migration changes no metric for
--   anyone until a clinic deliberately sets its own value. Additive-with-default
--   is also what CLAUDE.md §16 asks for when extending an entity.
--
--   The bound is 30 to 1095 days. Below a month is not a recall interval, it is a
--   treatment plan; above three years the patient has lapsed by any definition
--   and calling the gap a "recall" would hide them from the very list this
--   metric exists to produce. The check is there to catch a mistyped field, not
--   to express clinical policy.
--
-- Idempotency:
--   `add column if not exists` plus a guarded constraint add, so re-running is a
--   no-op rather than an error.
-- =============================================================================

alter table clinic_settings
  add column if not exists recall_interval_days integer not null default 180;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_recall_interval_days_sane'
  ) then
    alter table clinic_settings
      add constraint chk_recall_interval_days_sane
      check (recall_interval_days between 30 and 1095);
  end if;
end $$;

comment on column clinic_settings.recall_interval_days is
  'Days since a patient''s last visit before they count as due for reactivation. '
  'Read by the Business Brain''s patients.reactivation_candidates metric. '
  'Defaults to 180 (the standard six-month recall); shorter for orthodontic or '
  'paediatric practice, longer where recall is genuinely less frequent.';
