# Metrics Engine — Product Review

**Date:** 2026-07-28 · **Reviewing:** 19 metrics in `business-brain/engines/metrics/`
**Lens:** dentist, clinic owner, practice manager, SaaS product designer — not only engineer.

---

## Executive summary

The engine is technically sound and honest. As a *business intelligence system* it has
three structural gaps that matter more than any individual metric:

**1. It only looks at today. A clinic cannot be understood one day at a time.**
Dentistry is lumpy — one implant case can equal a month of cleanings. Every daily
count is noise at n=1. Fifteen of nineteen metrics are `_today` counters. A Tuesday
with ₹2,000 collected is meaningless; a 30-day collection trend is not.

**2. It is entirely backward-looking. There is no forward visibility.**
Every practice-management consultant's first question is *"how full is next week?"* —
and the engine cannot answer it. A clinic can look healthy today and be empty in ten
days. This is the single most valuable missing capability, and most of it needs no
schema change.

**3. It measures activity, not conversion.**
Dentistry's core business question is *"of the treatment we recommended, how much did
the patient accept, and how much did we actually deliver and collect?"* The engine
counts appointments and sums payments but never closes that loop.

Three metrics feed no evaluator and appear on no dashboard — they are currently
computed for nobody (verified by grep against `evaluators/`).

---

## 1. Current metrics review

Consumption counts are measured, not assumed: number of Signal Engine evaluators
that require or optionally read each metric.

### Keep as-is (7)

| Metric | Feeds | Why it earns its place |
|---|---|---|
| `revenue.outstanding` | 2 | The number every clinic owner checks. Directly actionable — it names money already earned and not collected. |
| `revenue.collected_today` | 2 | Cash in. Weak alone at n=1, but it is the base for collection-rate and trend metrics. |
| `revenue.pending_treatment_value` | 2 | Accepted work not yet delivered — the clinic's forward book. Genuinely predictive. |
| `queue.average_waiting_time` | 1 | Real-time operational value; the one metric a receptionist acts on *within the hour*. Correctly measured against `asOf`, not the clock. |
| `queue.patients_waiting` | 3 | Same. Live, actionable, cheap. |
| `followups.overdue` | 1 | Recall failure is the quietest revenue leak in dentistry. Directly actionable — it is a call list. |
| `capacity.chair_utilization` | 2 | The core efficiency metric. Would be far stronger over a window (see MVP-2). |

### Improve (7)

| Metric | Problem | Recommended change |
|---|---|---|
| `appointments.total_today` | Feeds 6 evaluators, so load-bearing — but a single day is a tiny sample. `minimumDailyAppointments: 5` fires on any quiet Tuesday. | Keep for signals; add a 7-day rolling companion so thresholds judge a trend, not a day. |
| `appointments.cancelled_today` | Raw count, not a rate. 2 cancellations from 4 booked is a crisis; from 40 it is noise. The evaluator already computes the rate — the metric should carry it. | Emit `scheduling.cancellation_rate_30d` alongside. |
| `appointments.no_shows_today` | Same. | Emit `scheduling.no_show_rate_30d` alongside. |
| `patients.new_today` | Threshold is `< 1`/day. Binary and jumpy; the config already caps its severity to compensate, which is a smell. | Replace the *signal basis* with a 30-day count. Keep the daily metric as an input. |
| `patients.returning_today` | Counts visits, not retention. A patient returning today says nothing about whether the base is retained. | Keep; add true retention (MVP-6). |
| `treatment.accepted_pending_scheduling` | Now a patient-level approximation that under-reports (documented). Value is real but the number is a floor. | Keep, and label it as a floor wherever it is surfaced. Revisit only if case-acceptance tracking lands. |
| `followups.due_today` | Only an optional input to one evaluator; on its own it is a work-queue count, not intelligence. | Keep as a dashboard number, not a business metric. |

### Remove or repurpose (3)

| Metric | Verdict |
|---|---|
| `appointments.completed_today` | **Feeds 0 evaluators.** Duplicates `treatment.completed_today` for revenue purposes and `appointments.total_today` for volume. A completed appointment with no treatment is not production. **Remove**, or keep strictly as a dashboard tile. |
| `appointments.upcoming_today` | **Feeds 0 evaluators.** "Appointments left today" is a scheduling screen, not a business metric — the receptionist reads it off the day list. **Remove.** |
| `revenue.clinic_share_today` | **Feeds 0 evaluators.** I added it on request and it is correct, but at n=1 day it is noise, and no signal consumes it. **Repurpose** into `revenue.clinic_share_30d` (MVP-3), which is the version a clinic owner would actually act on. |

**Computation cost:** negligible across the board — all 19 are single passes over
in-memory arrays. The real cost is in the repository, which loads **all** treatments
and **all** payments clinic-wide on every run. That is fine at pilot scale and will
not survive a few years of history (see Risks).

---

## 2. MVP additions

The eight metrics that would most improve the Business Brain, ordered by value.
**Seven of eight need no schema change.**

---

### MVP-1 · `schedule.booked_next_7d` — Future Schedule Health ⭐

- **Description:** Booked appointment slots in the next 7 days as a share of slots offered.
- **Why it matters:** The single most important number in practice management, and the engine is blind to it. It is the only metric that gives *warning* rather than *diagnosis* — a clinic can act on a thin week while there is still time to fill it. Everything else here reports what already happened.
- **Formula:** `booked slots (next 7d, status ∉ {cancelled,no_show}) / total slots offered (next 7d) × 100`
- **Required data:** `appointments.scheduled_at/status`, `availability_rules`, `unavailable_dates`, `consultancy_schedules`
- **Schema support:** ✅ Yes. Capacity logic already exists in `lib/scheduling/slots.ts`; the repository already calls it for one day.
- **Difficulty:** Medium — the snapshot must carry a forward appointment window, which it currently does not.
- **Value:** **High.** Unlocks a genuinely new signal class ("next week is 30% full") and a new diagnosis (demand collapse vs capacity not offered).

### MVP-2 · `capacity.chair_utilization_30d`

- **Description:** Chair utilization averaged over the trailing 30 days.
- **Why it matters:** Daily utilization swings wildly — one cancellation moves it 12%. The 30-day figure is what tells an owner whether to hire, extend hours, or market. Today's `low_chair_utilization` signal fires on any quiet day, which trains people to ignore it.
- **Formula:** `Σ booked slots (30d) / Σ offered slots (30d) × 100`
- **Required data:** as MVP-1, backward window
- **Schema support:** ✅ Yes
- **Difficulty:** Medium (same windowing work as MVP-1)
- **Value:** **High**

### MVP-3 · `revenue.production_30d` and `revenue.collection_rate_30d` ⭐

- **Description:** Production = value of treatment *delivered* (accrual). Collection rate = collected ÷ produced.
- **Why it matters:** Production vs collection is the fundamental pair in dental practice management, and the engine currently has only half of it. A clinic producing ₹5L and collecting ₹3L has a collections problem, not a demand problem — and today the pipeline cannot tell those apart. This directly sharpens the existing `collection_gap` diagnosis, which currently reasons from a single day.
- **Formula:**
  `production_30d = Σ treatments.cost where status='completed' and performed_at in window`
  `collection_rate_30d = Σ payments.amount in window ÷ production_30d × 100`
- **Required data:** `treatments.cost/status/performed_at`, `payments.amount/payment_date`
- **Schema support:** ✅ Yes — and the snapshot **already loads both unbounded**, so no repository change is needed at all.
- **Difficulty:** **Easy**
- **Value:** **High.** Best value-to-effort ratio in this document.

### MVP-4 · `patients.reactivation_candidates` ⭐

- **Description:** Active patients whose last visit was 6+ months ago and who have no upcoming appointment.
- **Why it matters:** This is not a number — it is a **call list**, which makes it the most directly actionable metric available. Reactivation is the cheapest revenue in dentistry: these people already chose you. Most clinics have hundreds and have never counted them.
- **Formula:** `count(patients where last_visit < today − 180d and no future appointment and deleted_at is null)`
- **Required data:** `patients.last_visit` (already maintained by `completeAppointmentCascade`), `appointments`
- **Schema support:** ✅ Yes
- **Difficulty:** **Easy** — the future-appointment set is already computed for `isScheduled`.
- **Value:** **High**

### MVP-5 · `scheduling.no_show_rate_30d` and `scheduling.cancellation_rate_30d`

- **Description:** Attrition as a rate over 30 days, not a daily count.
- **Why it matters:** Rates are comparable and benchmarkable (industry no-show is ~10%); counts are not. The existing daily signals need a `minimumAppointmentSample: 5` guard precisely because the daily denominator is too small — a 30-day window removes the need for the guard and makes the `schedule_attrition` diagnosis meaningfully more confident.
- **Formula:** `count(status=X, 30d) ÷ count(all appointments, 30d) × 100`
- **Required data:** `appointments.status/scheduled_at`
- **Schema support:** ✅ Yes
- **Difficulty:** Medium (needs the backward window)
- **Value:** **High**

### MVP-6 · `patients.active_count` and `patients.active_growth_30d`

- **Description:** Patients seen at least once in the last 12 months, and the change over 30 days.
- **Why it matters:** *Active patient count* is how a dental practice is actually valued and how an owner knows the business is growing. New-patients-per-day says nothing about whether the base is shrinking underneath. A clinic can add 20 new patients a month and still be dying at −40 lapsed.
- **Formula:** `count(distinct patients with a completed appointment in trailing 365d)`
- **Required data:** `patients.last_visit` or `appointments`
- **Schema support:** ✅ Yes
- **Difficulty:** Easy
- **Value:** **High**

### MVP-7 · `treatment.average_case_value_30d`

- **Description:** Mean value of a completed treatment over 30 days.
- **Why it matters:** Separates *volume* problems from *value* problems. Revenue can fall with patient count flat because the case mix shifted to cleanings — a completely different response than "we need more patients". The `revenue_shortfall` diagnosis currently has to leave `case_mix` permanently undetermined; this is the metric that would settle it.
- **Formula:** `Σ cost ÷ count, treatments completed in window`
- **Required data:** `treatments.cost/status/performed_at`
- **Schema support:** ✅ Yes (already unbounded in the snapshot)
- **Difficulty:** **Easy**
- **Value:** **High**

### MVP-8 · `scheduling.booking_lead_time_days`

- **Description:** Median days between an appointment being created and its scheduled time.
- **Why it matters:** The clearest read on demand pressure. Lead time near zero means the clinic is living hand-to-mouth on walk-ins; a lengthening lead time means demand exceeds capacity — the discriminator that separates `capacity_ceiling` from `demand_supply_mismatch`, both of which currently rest on undetermined hypotheses.
- **Formula:** `median(scheduled_at − created_at)` over appointments created in the window
- **Required data:** `appointments.created_at`, `appointments.scheduled_at`
- **Schema support:** ✅ Yes — `created_at` already exists. No new columns.
- **Difficulty:** Easy
- **Value:** **High**

---

## 3. Phase 2 additions

Useful, but not what the pilot needs first.

| Metric | Formula / source | Schema | Diff. | Value |
|---|---|---|---|---|
| `revenue.per_patient_30d` | collections ÷ distinct patients seen | ✅ | Easy | Med |
| `treatment.completion_rate_30d` | completed ÷ (completed + planned) created in window | ✅ | Easy | Med |
| `treatment.mix_top_type_share` | share of production from the largest `treatment_type` — concentration risk | ✅ | Easy | Med |
| `followups.completion_rate_30d` | completed ÷ created — measures whether recall *works*, not just its backlog | ✅ | Easy | **High** |
| `acquisition.referral_share_30d` | `appointments.source='referral'` ÷ all — the cheapest acquisition channel, and a proxy for satisfaction | ✅ | Easy | Med |
| `scheduling.reschedule_rate_30d` | `appointment_history.action='rescheduled'` ÷ appointments | ✅ (`appointment_history` is currently unused and rich) | Med | Med |
| `revenue.opd_share_30d` | `payments.payment_type='opd'` ÷ total — consultation-heavy vs treatment-heavy mix | ✅ (`payment_type` exists) | Easy | Med |
| `operations.average_visit_duration` | `called_at → completion` from `queue_entries` | ⚠️ Partial — no completion timestamp on the queue entry | Med | Med |
| `revenue.per_dentist_30d` | production grouped by `appointments.dentist_id` | ✅ | Med | **Low today** — single-dentist pilot; becomes High with associates |
| `patients.lifetime_value` | Σ payments per patient ÷ tenure | ✅ | Med | Med |

---

## 4. Future intelligence

Valuable once history accumulates or new capture exists.

| Metric | Why it must wait | Needs |
|---|---|---|
| **Case acceptance rate** — presented vs accepted treatment value | The single most important dental KPI, and **the schema cannot express it**. `treatment_status` has no `presented` or `declined` state, so a plan the patient refuses is indistinguishable from one an admin cancelled. | Schema: `declined` status or a `presented_at`/`decision` field. **Only proposed change with High value.** |
| **Revenue forecast (next 30d)** | Needs ≥6 months of history for any seasonality signal | Historical metric persistence |
| **Seasonality index** | Same — dentistry has real seasonal patterns (festivals, school holidays, insurance year-end) | ≥12 months |
| **Clinic health score** | A composite is only trustworthy once its components are individually validated. Building it early creates a number nobody can explain — the definition of a vanity metric. | Validated MVP metrics + tuning |
| **Revenue leakage** | Requires case acceptance + production + collection together to be meaningful | Case acceptance |
| **Chair/operatory utilization** | No operatory concept exists; low value while clinics are 1–2 chairs | Schema: `operatories` table |
| **Recall effectiveness by cohort** | Needs follow-up outcome history over time | ≥6 months of `follow_ups` |

---

## 5. Deliberately not recommended

The goal is the most useful system, not the most metrics. I would **not** build these:

- **Revenue per chair** — no operatory model, and meaningless at 1–2 chairs. Pure vanity at pilot scale.
- **Reception workload** — no data captures it. Any implementation would be invented.
- **Appointment delays (running late)** — needs actual-start capture the queue does not record; and the clinic already *knows* it is running late.
- **Week-over-week revenue** — too noisy in dentistry. One implant distorts a week. Month-over-month is the shortest honest comparison.
- **A clinic health score, now** — see above. Composites built on unvalidated inputs destroy trust the first time they disagree with what the owner sees.

---

## 6. Structural work these depend on

Two changes unlock most of the above, and neither is a schema change.

**A. The snapshot must carry windows, not just a day.**
`ClinicDataSnapshot` has one `date`. Ten of the eighteen proposed metrics need a
trailing 30-day appointment window; MVP-1 needs a *forward* 7-day window. Suggested
additive shape:

```ts
readonly appointmentsWindow?: {
  readonly from: string; readonly to: string;
  readonly appointments: readonly AppointmentSnapshot[];
};
readonly capacityWindow?: { readonly from: string; readonly to: string; readonly totalSlots: number };
```

Optional fields keep every existing calculator valid, and the engine's existing
`null`-withholding means window metrics simply do not appear for a repository that
does not supply them — no breakage, honest absence.

**B. Signal thresholds should move to window-based inputs where they exist.**
`minimumDailyAppointments: 5` and `minimumNewPatientsPerDay: 1` are daily thresholds
compensating for a daily sample. Several already carry severity caps to damp the
resulting jumpiness — a smell worth removing once rates exist.

---

## 7. Risks in the current engine

| Risk | Detail |
|---|---|
| **Unbounded loads** | The repository fetches *all* treatments and *all* payments clinic-wide on every run — correct for cumulative outstanding balance, but linear in clinic history. Fine at pilot scale; needs a bounded strategy (or a maintained balance) before a clinic with years of data. |
| **Daily thresholds on daily samples** | Signals fire on ordinary quiet days, which teaches users to dismiss them. The fastest fix to perceived quality is windowed rates. |
| **Three metrics feed nothing** | `appointments.completed_today`, `appointments.upcoming_today`, `revenue.clinic_share_today`. Computed for no consumer. |
| **`accepted_pending_scheduling` under-reports** | Accepted and documented, but must be labelled as a floor wherever surfaced, or it will be read as an all-clear. |

---

## Recommended order

1. **MVP-3, MVP-4, MVP-7** — Easy, no repository change, immediately actionable.
2. **Window support in the snapshot** (§6A) — unlocks the rest.
3. **MVP-1, MVP-2, MVP-5, MVP-8** — the forward-looking and rate-based set.
4. **Remove** the three orphan metrics.
5. **Then** revisit case acceptance as the one schema change worth making.
