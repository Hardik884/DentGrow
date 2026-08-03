-- =============================================================================
-- Correct the treatments.xray_cost column comment
-- Migration: 20260803000200_xray_billing_comment.sql
--
-- Comment-only. No schema, data, or policy changes.
--
-- Migration 20260724000000 introduced xray_cost with this comment on the table:
--
--     "Stored separately so it is visible in the treatment record; the combined
--      total (treatment cost + xray_cost) is submitted as treatments.cost by the
--      form and the billing formula is not changed."
--
-- The form never did that. It collects Cost and X-ray Cost as two independent
-- inputs and writes them to two independent columns, so `cost` has never
-- included the radiograph — which meant every X-ray recorded since that
-- migration was charged to nobody. A clinic reported a ₹400 X-ray missing from
-- a patient's outstanding balance, which is exactly this.
--
-- The fix is in the application, where the billing formula lives:
-- lib/billing/balance.ts now adds an X-ray term alongside the OPD one, and
-- treatmentTotalCharge() is the single definition of a line item's worth.
-- Adding the term rather than folding xray_cost into `cost` keeps the
-- radiograph a visible line item and avoids having to guess whether any given
-- historical `cost` already contains it (none do).
--
-- This migration exists so the schema stops asserting the opposite. A stale
-- comment describing an intent the code never implemented is how the next
-- person re-introduces the same bug.
-- =============================================================================

comment on column treatments.xray_cost is
  'Cost charged for the X-ray when xray_taken is true. NULL otherwise. Billed '
  'as a SEPARATE term in the outstanding balance (see lib/billing/balance.ts, '
  'xrayChargeFor) — treatments.cost does NOT include it.';

comment on column treatments.xray_taken is
  'Whether an X-ray was taken as part of this treatment. When true, xray_cost '
  'is added to the patient''s outstanding balance regardless of the treatment''s '
  'own status: the film and machine time were consumed either way.';
