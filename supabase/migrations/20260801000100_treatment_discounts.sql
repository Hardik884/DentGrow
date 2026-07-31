-- =============================================================================
-- Discounts and write-offs on a treatment
-- Migration: 20260801000100_treatment_discounts.sql
--
-- What this makes answerable:
--   "Is revenue down because we charged less, or because we were not paid?"
--   Two problems with opposite responses — one is a pricing decision, the other
--   is a collections failure — and today they are indistinguishable. A treatment
--   has a cost and payments have amounts, with nothing in between, so a 2,000
--   discount and 2,000 unpaid look identical in every figure the clinic sees.
--
-- Shape:
--   `discount_amount` is what was taken OFF the bill; `cost` stays GROSS. The
--   alternative — asking the dentist to type a lower cost — loses the fact that
--   a discount happened at all, which is the entire point. Keeping both means
--   the list price and the concession are separately visible, and either can be
--   totalled.
--
--   `discount_reason` is free text and optional. A goodwill gesture, a staff
--   rate and a written-off bad debt are different events; without somewhere to
--   say which, they aggregate into a number nobody can act on.
--
-- Constraints, both load-bearing:
--   >= 0        a negative discount is a surcharge, which this column does not
--               mean and no screen would render correctly.
--   <= cost     a discount larger than the bill would make the net negative, and
--               the balance helper clamps at zero — so the error would vanish
--               silently instead of being rejected.
--
-- Defaulted to 0 and NOT NULL, so every existing treatment is unchanged and no
-- reader has to invent a fallback. Nothing about the live clinic's numbers moves
-- until somebody records a discount.
-- =============================================================================

alter table treatments
  add column if not exists discount_amount numeric(10,2) not null default 0;

alter table treatments
  add column if not exists discount_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'treatments'::regclass
      and conname  = 'chk_treatment_discount_range'
  ) then
    alter table treatments
      add constraint chk_treatment_discount_range
      check (discount_amount >= 0 and discount_amount <= cost);
  end if;
end $$;

comment on column treatments.discount_amount is
  'Amount taken off this treatment''s bill. `cost` remains the gross list price; '
  'the patient owes cost - discount_amount. Defaults to 0. Kept separate from '
  'cost so that a reduced bill and an unpaid bill stay distinguishable.';

comment on column treatments.discount_reason is
  'Why the discount was given — goodwill, staff rate, written-off debt. Free '
  'text and optional; without it every concession aggregates into one number '
  'nobody can act on.';
