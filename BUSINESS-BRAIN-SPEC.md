# The OraMedha Business Brain — Definitive Specification and Product Audit

**Version audited:** pipeline `0.5.0` (`BUSINESS_BRAIN_VERSION`)
**Date:** 31 July 2026
**Audience:** product owner. Written in plain English, no engineering background assumed.
**Scope:** everything that is built today. Workflow, WhatsApp, AI explanations and automation are *not* built, and this document says where they would attach.

**What was audited:** every source file under `business-brain/` (13,640 lines, tests excluded) plus the application-side wiring in `lib/business-brain/`. Nothing in this document is inferred from naming or documentation alone. Where the code and an older internal note disagree, the code wins and the disagreement is called out.

---

## Table of contents

| Part | Subject |
|---|---|
| 1 | High level flow |
| 2 | Metrics Engine (28 metrics) |
| 3 | Signal Engine (18 signals) |
| 4 | Diagnosis Engine (10 patterns) |
| 5 | Constraint Engine (6 categories) |
| 6 | Value Engine (5 sized categories) |
| 7 | Strategy Engine (11 corrective templates + investigative) |
| 8 | End-to-end walkthrough with a real clinic |
| 9 | Product review through a dentist's eyes |
| 10 | Weaknesses, brutally honest |
| 11 | Prioritised improvements |
| 12 | Final verdict |

---

## A note on the one discipline that runs through everything

Before the parts, the single idea the whole system is built around, because nothing else makes sense without it.

**A threshold breach is a fact. A cause is not.**

Nothing in daily clinic data can tell you whether cancellations rose because reminders stopped sending or because there was a flu outbreak. So the system is built to refuse to guess. It says what it measured, it says which explanations are consistent with what it measured, and it explicitly marks the ones it could not separate as *undetermined* while naming the exact measurement that would settle them.

Four consequences you will see repeatedly:

1. **"I could not measure this" is never reported as zero.** A metric that cannot be computed honestly is withheld, and the signal that depends on it skips and records why. A dashboard that shows ₹0 outstanding when it actually failed to read the payments table is worse than one that says nothing.
2. **Confidence means data completeness, not probability of being right.** A confidence of 0.9 means "we saw 90% of the picture", never "we are 90% sure this is the cause". The dashboard labels it "Mostly measured" rather than "high confidence" for exactly this reason.
3. **Only one engine is allowed to give advice.** Metrics, Signals and Diagnosis are held to silence on what to do, and there is an automated test (`no-advice.spec.ts`) that scans every string those three engines can emit against nine advisory words and fails the build if any appear. Advice appears in exactly one place, the Strategy Engine, with its reasoning attached.
4. **The whole pipeline is deterministic and read-only.** No language model, no clock, no randomness, no database writes. The same clinic data always produces byte-identical output. Time is injected by the caller. This is what makes the output auditable and testable at all.

---

# Part 1 — High Level Flow

```
Clinic Data  (Supabase: appointments, patients, treatments, payments, queue, follow-ups, availability)
     │
     ▼
Metrics      28 facts about the clinic for one date
     │
     ▼
Signals      18 rules asking "is this number outside its limit?"  → 0..18 signals
     │
     ▼
Diagnosis    10 patterns asking "are these signals one story, and what could explain it?"
     │
     ▼
Constraints  Collapse overlapping diagnoses into the 2-3 bottlenecks actually limiting the clinic
     │
     ├────► Value      How much money / time / patients is sitting in each bottleneck, today
     │
     ▼
Strategy     What to do about it, or what to go measure — the only advisory output
```

Everything is orchestrated by one file, `business-brain/services/business-brain-service.ts`, which resolves dependencies, threads a single execution context through every stage, and records what happened at each stage. It contains no business logic of its own. Every threshold and every judgement stays inside the engine that owns it.

## Why each engine exists

### Metrics Engine
**Exists because:** you cannot reason about a clinic you have not measured. It is the only component that touches clinic data, through a narrow read-only port.
**Input:** a `ClinicDataSnapshot` for one clinic and one business date, supplied by a repository.
**Output:** up to 28 `Metric` objects, each with a stable id (`key:clinicId:date`), a value, a unit and a category.
**Contains no opinions.** It never says a number is good or bad.

### Signal Engine
**Exists because:** 28 numbers is a spreadsheet, not intelligence. Somebody has to say which of them is outside its normal range, and a dentist should not have to hold 28 thresholds in their head.
**Input:** the metrics, plus a date and an injected timestamp.
**Output:** 0 to 18 `Signal` objects, each with severity, priority, confidence and evidence, **plus a decision trace with one entry per rule** recording whether it fired, measurably found nothing, or could not run.
**Contains no causes.** A signal states what is happening, never why.

### Diagnosis Engine
**Exists because:** on a bad day, eight signals fire and they are not eight problems. Cancellations, an idle chair and low revenue on the same day are three views of one story. Without correlation, the dentist has to do the joining up themselves.
**Input:** the signals, **the signal trace** (this is required, not optional, see below), the metrics, and up to 7 days of prior metrics.
**Output:** `Diagnosis` objects, each carrying competing hypotheses with explicit statuses, discriminators naming what would separate them, a persistence classification (one-off / on and off / ongoing / worsening / improving) and full evidence.
**Contains no advice.**

> **Why the trace is required input.** "Utilization was low and cancellations were fine" and "utilization was low and the cancellation rule could not run" look identical if you only have a list of signals: in both cases the cancellation signal is simply absent. Only the trace preserves the difference, and the difference changes the diagnosis. This is the single most important structural decision in the pipeline.

### Constraint Engine
**Exists because:** diagnoses deliberately overlap. Six diagnoses describing three problems is correct for diagnosis (each pattern is a different lens) and useless for deciding what to do, because six items with no ordering is the same as no guidance. A constraint is what several diagnoses are all pointing at.
**Input:** the day's diagnoses.
**Output:** up to 6 `Constraint` objects, one per bottleneck category, severity = the *worst* contributing diagnosis (never an average).

### Value Engine
**Exists because:** severity answers "how alarming", not "how much". Two constraints can both read `high` while one holds ₹80,000 of unbooked treatment and the other ₹2,000.
**Input:** the constraints plus the metrics.
**Output:** value at stake per constraint, in money, minutes, appointments or patients.
**Deliberately does not forecast.** It reports the present size of the problem, never "fixing this would earn you ₹40,000".

### Strategy Engine
**Exists because:** everything above stops short of telling anyone what to do, on purpose, so that when advice finally appears it appears in one place with its licence to speak clearly bounded.
**Input:** the constraints, the diagnoses, and the value at stake (used only to order equally urgent items).
**Output:** at most one *corrective* strategy per settled cause, and at most one *investigative* strategy per constraint that settled nothing.

## Why the order matters

Each stage is only possible because the previous one exists, and each stage adds exactly one kind of claim:

| Stage | The kind of claim it is allowed to make |
|---|---|
| Metrics | "This is the number." |
| Signals | "This number is outside its limit, and here is the limit." |
| Diagnosis | "These breaches are one story, and here are the explanations consistent with it." |
| Constraints | "Those stories point at this bottleneck." |
| Value | "This much is sitting in that bottleneck right now." |
| Strategy | "Do this" or "go measure this." |

You cannot correlate signals you have not raised. You cannot raise a signal without a measurement. You cannot pick a bottleneck without knowing which findings are the same problem. And critically, **you cannot honestly recommend anything until you know which causes were settled and which were not** — which is precisely what the Diagnosis Engine produces and nothing earlier can.

## Why not one engine

Four reasons, all of which have bitten real systems:

1. **Different failure modes need different handling.** A metric that cannot be computed should be withheld. A signal rule that throws should be skipped while the other 17 still run. A strategy failure should cost the advice, not the findings the dentist came for. One engine means one failure mode: all or nothing. The orchestrator wraps the strategy stage in its own try/catch for exactly this reason, and every calculator, evaluator and matcher runs in isolation.
2. **The honesty boundary is enforceable only if it is a boundary.** "The engines must not give advice" is a comment. "These three directories may not emit advisory language, checked by a test, and may not import a database client, checked by an eslint rule" is a guarantee.
3. **Determinism is testable in units, not in monoliths.** Each engine is a pure function over its input. You can hand a matcher four literal signals and assert the diagnosis. You cannot do that to a single function that also reads Supabase.
4. **Explainability falls out of the structure.** Because each stage records what it did and why, the dashboard can show a dentist "here are the checks that could not run today" without anyone building a separate audit feature. That list comes straight from the Signal Engine's trace.

## What is not built

`WorkflowEngine`, `ActionEngine`, `OutcomeEngine`, `LearningEngine` and `AIExplanationEngine` exist as contracts only. The AI explanation contract is worth noting because it is more than a stub: it already contains a deterministic verifier (`verifyExplanation`) that rejects any generated text containing a number absent from the supplied facts, or any advisory verb, or anything over 600 characters. The model is designed in as a *writer*, never a reasoner. No language model is wired up.

---

# Part 2 — Metrics Engine

The Metrics Engine turns one day of clinic data into plain facts. It has no opinions: it never says a number is good or bad, it just measures. Twenty-eight calculators run, each a pure function that takes the day's data snapshot and returns exactly one metric — or returns *nothing* when the honest answer is "I cannot measure this from what I was given". A calculator that throws is logged and skipped; the other 27 still produce their numbers.

Three ideas repeat across every metric, so they are stated once here:

- **Withheld, not zero.** Several calculators return "withheld" (`null`) rather than a number. That is deliberate. A collection rate against zero production is undefined; reporting 0% would read as "we collected nothing" when the truth is "we delivered nothing". Withheld means the dependent signal skips instead of firing on a fabricated number.
- **Money is gross.** Every rupee figure is what the patient owes, before any split with a visiting consultant. This matches the app's own billing rule.
- **Two window lengths.** "Today" metrics describe the single business date. "30-day" and "7-day" metrics describe a trailing or forward window. Dentistry is lumpy — one implant can outweigh a month of cleanings — so a single day is statistical noise, and the windowed metrics are where the real intelligence lives.

## 2.1 The metric catalogue

Metrics are grouped by what they describe. For each, the business question, the exact calculation, and the honest limits.

### Appointments (today)

**`appointments.total_today` — Total Appointments Today**
- *Question:* how busy is the book today?
- *Why care:* it is the denominator for every rate, and the activity guard that separates "we under-performed" from "we were closed".
- *Calculation:* count of appointments scheduled on the date.
- *Data:* today's appointments.
- *Limits:* a single day is a tiny sample. This metric feeds six different signal rules, so it is load-bearing despite being simple. Misleading on a normally-quiet weekday.
- *Verdict:* **keep.** Structurally essential.

**`appointments.cancelled_today` — Cancelled Appointments Today**
- *Question:* how many of today's slots were cancelled?
- *Calculation:* count of today's appointments with status `cancelled`.
- *Limits:* a raw count, not a rate. Two cancellations out of four is a crisis; out of forty it is noise. The rate version (below) is what the signals actually judge.
- *Verdict:* **keep**, but as an input to the rate, not as intelligence on its own.

**`appointments.no_shows_today` — No-Shows Today**
- *Question:* how many patients simply did not turn up today?
- *Calculation:* count of today's appointments with status `no_show`.
- *Limits:* same small-sample problem as cancellations. A no-show is worse than a cancellation because the slot could not be refilled.
- *Verdict:* **keep** as a rate input.

### Scheduling (30-day trailing window)

**`scheduling.cancellation_rate_30d` — Cancellation Rate (30 days)**
- *Question:* what share of appointments get cancelled, over a period long enough to mean something?
- *Calculation:* cancelled appointments ÷ all appointments in the trailing 30 days × 100.
- *Data:* the trailing schedule window.
- *Edge cases:* withheld when the window is absent (repository did not supply it) or empty (no appointments, so no denominator).
- *Limits:* counts appointments in the window by their scheduled date; a data-migrated clinic with backdated rows could distort it.
- *Verdict:* **keep.** This is the benchmarkable version (industry cancellation is a known figure); the daily count is not comparable to anything.

**`scheduling.no_show_rate_30d` — No-Show Rate (30 days)**
- Same shape as cancellation rate, for no-shows. Industry no-show runs around 10%, so a rate can be judged against the world; a count cannot. **Keep.**

**`scheduling.booking_lead_time_days` — Median Booking Lead Time**
- *Question:* how far in advance are patients booking?
- *Why care:* the clearest read on demand pressure. Near zero means the clinic lives hand-to-mouth on walk-ins; a lengthening lead time means demand is outrunning capacity.
- *Calculation:* median of (scheduled time − booking time), in days, across the window. Median not mean, so one appointment booked six months out does not distort it.
- *Assumptions/edge cases:* negative lead times (backdated migration rows, where the record was created after the visit) are excluded as historical noise. Withheld when the window is absent or no appointment has a usable lead time.
- *Limits:* not yet consumed by any signal or diagnosis — it is computed and stored but nothing reasons on it *yet*. It was built as the future discriminator between "capacity ceiling" and "demand/supply mismatch".
- *Verdict:* **keep**, and wire a signal to it — see Part 11.

### Patients

**`patients.new_today` — New Patients Today**
- *Question:* did any first-time patients arrive?
- *Calculation:* count of patient records created on the date.
- *Limits:* the threshold that judges it is one patient per day, which is binary and jumpy — hence the signal's severity is capped. A steady trickle of first visits is how a practice stays alive, but at n=1/day this is noisy.
- *Verdict:* **keep** the metric; the *signal basis* should move to a 30-day count (Part 11).

**`patients.returning_today` — Returning Patients Today**
- *Question:* how many established patients came back today?
- *Calculation:* distinct patients seen today whose record was created before today.
- *Limits:* counts visits, not retention. A patient returning today says nothing about whether the base as a whole is being retained. Used as the current-vs-prior input to the "returning volume dropping" signal.
- *Verdict:* **keep**; true retention needs the active-count metric (Part 11).

**`patients.reactivation_candidates` — Patients Due for Reactivation**
- *Question:* how many patients have gone quiet and could be called back?
- *Why care:* this is not a number, it is a **call list**, and reactivation is the cheapest revenue in dentistry — these people already chose you.
- *Calculation:* count of roster patients last seen more than 180 days ago, with no upcoming appointment, who have been seen at least once (never-attended patients are excluded — they are an acquisition problem, not a lapsed one).
- *Assumptions:* 180 days = one standard recall interval. This is the one genuinely clinic-specific number (a paediatric or orthodontic practice recalls differently) and the first candidate for per-clinic configuration.
- *Edge cases:* withheld when the snapshot carries no roster.
- *Verdict:* **keep. Among the most actionable things the whole system produces.**

### Revenue

**`revenue.collected_today` — Revenue Collected Today**
- *Calculation:* sum of payments recorded on the date. *Weak alone at n=1*, but it is the base for collection-rate reasoning. **Keep.**

**`revenue.outstanding` — Outstanding Payments**
- *Question:* how much earned money has not been collected?
- *Calculation:* (sum of costs of `completed` and `in_progress` treatments) − (all payments ever), floored at zero.
- *Assumptions:* `planned` treatment is deliberately excluded — accepted-but-not-started work is not yet owed. The billable-status set intentionally mirrors the app's own billing rule and is asserted by a test so the two can never silently diverge.
- *Limits:* loads *all* treatments and *all* payments clinic-wide every run — correct for a cumulative balance, but linear in clinic history (see Part 10).
- *Verdict:* **keep. The number every owner checks.**

**`revenue.pending_treatment_value` — Pending Treatment Value**
- *Calculation:* sum of costs of `planned` and `in_progress` treatments. The clinic's forward book of accepted-but-undelivered work. **Keep** — genuinely predictive.

**`revenue.production_30d` — Production (30 days)**
- *Question:* how much treatment did we actually deliver this month?
- *Calculation:* sum of costs of treatments `completed` within the trailing window, dated by when they were performed.
- *Why care:* production and collection are dentistry's fundamental pair. Reporting only collection hides the most common failure mode — a busy, well-delivering clinic that is not getting paid looks identical to one with no demand.
- *Verdict:* **keep.** Also the basis on which several thresholds are calibrated per clinic.

**`revenue.collection_rate_30d` — Collection Rate (30 days)**
- *Calculation:* payments in window ÷ production in window × 100.
- *Edge cases:* withheld when production is zero. *Not* capped at 100% — collecting historic dues can genuinely exceed the window's production, and flattening that would hide it.
- *Verdict:* **keep.** This is what separates a collections problem from a demand problem.

**`revenue.collected_30d` — Revenue Collected (30 days)**
- *Calculation:* sum of payments in the trailing window. Read directly by an owner as "what I took in this month", and it is the yardstick used to calibrate the daily-revenue threshold per clinic. **Keep.**

### Queue (real-time)

**`queue.patients_waiting` — Patients Waiting**
- *Calculation:* count of today's queue entries with status `waiting`. Live, cheap, and the one number a receptionist acts on within the hour. **Keep.**

**`queue.average_waiting_time` — Average Waiting Time**
- *Calculation:* mean wait across today's entries. For a patient already called in, wait = check-in → called-in; for one still waiting, wait = check-in → the snapshot's capture time (`asOf`, not the wall clock, so it stays deterministic). Entries with unusable timestamps are skipped; returns 0 when nothing to measure.
- *Limits:* an average hides a single very long wait; measured correctly against the snapshot moment rather than "now". **Keep.**

### Follow-ups

**`followups.due_today` — Follow-ups Due Today**
- *Calculation:* pending follow-ups whose due date is today. A work-queue count, not intelligence on its own; used as an optional input to the backlog signal. **Keep as a dashboard number.**

**`followups.overdue` — Overdue Follow-ups**
- *Calculation:* pending follow-ups whose due date is before today. Recall failure is the quietest revenue leak in dentistry, and this is directly a call list. **Keep.**

### Treatment

**`treatment.accepted_pending_scheduling` — Planned Treatments With No Next Visit Booked**
- *Question:* how much planned work is sitting with patients who have nothing in the book?
- *Calculation:* count of `planned` treatments whose patient has no upcoming appointment.
- *The two honest caveats, baked into the name:* (1) `planned` is **not** consent — the schema has no "presented" or "declined" state, so a plan the patient refused looks identical to one they accepted; (2) "unscheduled" is resolved **per patient**, not per treatment, because no treatment-to-appointment link exists — a patient booked for a cleaning reads as booked for their crown too.
- *Edge cases:* withheld entirely when any planned treatment's booking state is unknown, rather than guessing "unbooked".
- *Known error direction:* it **under-reports** (some genuinely unbooked work is missed because the patient has an unrelated appointment).
- *Verdict:* **keep the key** (it is persisted in history and cannot change), but the display name must stay patient-level and must never be re-worded into the language of acceptance. This is the single most caveated metric in the system.

**`treatment.completed_today` — Treatments Completed Today**
- *Calculation:* count of `completed` treatments performed on the date. Feeds the collection-lag signal. **Keep.**

**`treatment.average_case_value_30d` — Average Case Value (30 days)**
- *Calculation:* total cost ÷ count of treatments completed in the window. Withheld when nothing completed.
- *Why care:* separates a *volume* problem from a *value* problem — revenue can fall with patient count flat because the case mix shifted to cleanings. Built to settle the "case mix" hypothesis in the revenue-shortfall diagnosis.
- *Limits:* not yet consumed by a signal. **Keep**, and wire it up (Part 11).

### Capacity (measured in chair-minutes, not slots)

This group deserves a note, because it is where the most careful engineering lives. Capacity is measured in **chair-minutes**, never in slot counts. A "slot" in the booking system is a candidate start time generated every few minutes, and those overlap — a four-hour window stepped every 10 minutes yields 24 candidates, but you cannot book 24 half-hour appointments in four hours. Counting candidates would inflate capacity and, worse, make the same clinic read differently on a Monday than a Friday because the step size differs by weekday. Minutes have none of these problems.

**`capacity.open_minutes_today` — Chair Time Open Today**
- *Calculation:* open minutes × chair count (chairs is always at least 1). The denominator behind utilization, published as a fact so the percentage can be checked and a closed day reads as a visible zero. **Keep.**

**`capacity.appointment_capacity_today` — Appointments That Fit Today**
- *Calculation:* open chair-minutes ÷ typical appointment length, floored. The unit every volume judgement is actually made in, and the basis for calibrating the low-volume threshold per clinic. **Keep.**

**`capacity.chair_utilization` — Chair Utilization**
- *Calculation:* booked chair-minutes ÷ open chair-minutes × 100, capped at 100%. A cancelled or no-show appointment frees the chair and does not count as booked. A missing duration falls back to 30 minutes (the app default) rather than zero, so a real booking is never erased.
- *Edge cases:* returns 0 on a closed day rather than dividing by zero — safe only because every consumer pairs it with available capacity, so "empty" and "closed" are told apart downstream.
- *Verdict:* **keep**, but the 30-day version is the stronger decision basis.

**`capacity.available_slots_today` — Room For More Appointments Today**
- *Calculation:* free chair-minutes ÷ typical appointment length, floored and never negative. Rounded *down* on purpose — half an appointment's gap is not a bookable appointment, and reporting room that does not exist would send a receptionist chasing a patient to fill it. **Keep.**

**`capacity.chair_utilization_30d` — Chair Utilization (30 days)**
- *Calculation:* booked ÷ open chair-minutes across the trailing window. Withheld when the window is absent or the clinic offered no capacity across it. Daily utilization swings double digits on one cancellation; this is the figure that tells an owner whether to hire, extend hours, or market. **Keep.**

**`capacity.booked_next_7d` — Schedule Filled (next 7 days)**
- *Question:* how full is next week?
- *Calculation:* booked ÷ offered chair-minutes across the forward 7-day window. Withheld when the forward window is absent or the clinic is closed for the week.
- *Why care:* **the only forward-looking metric in the system, and the only one that can warn rather than diagnose.** Every other metric reports what already happened, by which time the week is lost; a thin week ahead can still be filled from the recall list.
- *Limits:* not yet consumed by a signal. **Keep, and this is the highest-value wiring job outstanding** (Part 11).

## 2.2 Reviewing the Metrics Engine as a whole

**What is strong.** It is honest to a fault. Withholding rather than zeroing, gross-money consistency enforced by a test, chair-minutes instead of slot counts, deterministic time — these are the decisions of someone who has watched dashboards lie and refused to build another one. The 30-day and 7-day windows fixed the engine's original and most serious flaw (that it only looked at a single day).

**What I would change if redesigning today.**

1. **Three good metrics feed nothing.** `scheduling.booking_lead_time_days`, `treatment.average_case_value_30d` and `capacity.booked_next_7d` are all computed, correct, and consumed by no signal or diagnosis. They were built ahead of the rules that will use them. The forward-schedule metric in particular is the most valuable capability in the whole system and currently reaches no dentist. This is a wiring gap, not a measurement gap, and it is the first thing I would close.
2. **Per-clinic configuration is missing where it matters.** The 180-day reactivation window is a clinical judgement that varies by practice type and is currently a global constant.
3. **The unbounded clinic-wide load is a scaling time-bomb.** Outstanding balance correctly needs all history, but recomputing it from all treatments and all payments on every dashboard load will not survive a clinic with years of data. It is fine at pilot scale and must be bounded (or maintained as a running balance) before it is not.
4. **Case acceptance is the one metric worth a schema change, and it cannot be faked.** It was built once and deliberately reverted, because without a "declined" state an unrecorded decline is indistinguishable from an acceptance and the metric reads ~100% — authoritative and wrong, worse than absent. It should return only alongside a workflow that makes recording a decline unavoidable.

---

# Part 3 — Signal Engine

The Signal Engine reads the metrics and asks, for each rule, "is this number outside its limit?" It emits 0 to 18 signals. Crucially it also produces a **decision trace** — one entry per rule, recording whether it fired, measurably found nothing (`no_signal`), or could not run (`skipped`, with the missing metrics named). That trace is what the Diagnosis Engine needs to tell a measured absence from an unmeasurable one.

## 3.1 How severity, priority and confidence are computed (once, for all signals)

No evaluator decides its own severity. Severity is a single function of **breach magnitude** — how far past the threshold the value landed — mapped onto bands, then optionally clamped per signal.

- **Breach magnitude** = distance past the threshold ÷ the threshold (relative), or the absolute distance when the threshold is zero. Rounded to two decimals.
- **Bands** (breach → severity): ≥0.1 low, ≥0.25 medium, ≥0.5 high, ≥1.0 critical; below 0.1 is info.
- **Per-signal clamps** override the band where the band would mislead. Four are configured: near-full-capacity capped at medium ("being busy is not an emergency"), follow-up backlog floored at low ("a backlog is always worth surfacing"), low appointment volume capped at high ("a quiet day is a business problem, not a crisis"), low new patients capped at medium (its threshold is one patient, so relative breach maths is jumpy).
- **Priority** is a fixed projection of severity (critical→critical, high→high, medium→medium, low/info→low). Never an independent opinion.
- **Confidence means data completeness, never probability.** It starts at 1.0 and is docked: −0.1 per absent optional metric, −0.15 when the governing denominator is below the minimum sample (5), −0.2 when a metric describes a different date than requested. Floored at 0.3. **A signal below 0.4 confidence is suppressed** and recorded as `no_signal` rather than emitted — the engine would rather stay quiet than show a number it barely measured.

Missing a *required* metric never lowers confidence — the rule skips entirely, because a signal you cannot compute is not a low-confidence signal, it is no signal.

## 3.2 The thresholds, and why they are what they are

All thresholds live in one file; evaluators contain no literals. Defaults are sized for a single-chair to small (2–3 chair) Indian practice, in INR:

| Threshold | Default | Reasoning |
|---|---|---|
| Minimum daily revenue | ₹5,000 | ~8–12 patients/day at consult/filling/RCT prices puts a normal day above this |
| Outstanding balance limit | ₹25,000 | working capital sitting outside the clinic |
| Outstanding growth rate / floor | 20% / ₹5,000 | direction matters; floor keeps small balances out of the feed |
| High cancellation rate | 10% | industry benchmark |
| High no-show rate | 8% | tighter than cancellation — a no-show cannot be refilled |
| Minimum daily appointments | 5 | volume floor |
| Minimum appointment sample | 5 | below this, rates are noise |
| Minimum new patients/day | 1 | |
| Returning volume drop rate / floor | 30% / 2 patients | |
| Max waiting time | 30 min | experience threshold |
| Max queue length | 5 | small waiting-room limit |
| Queue growth rate / floor | 50% / 3 | |
| Overdue follow-up limit | 10 | |
| Min chair utilization | 50% | idle capacity |
| Near-capacity utilization | 90% | effectively full |
| Pending treatment value limit | ₹50,000 | forward book too large to ignore |
| Accepted-unscheduled limit | 5 | |

**Per-clinic calibration.** The clinic-dependent thresholds are automatically re-sized from the clinic's own facts before each run, so "low volume" means the same thing at any scale. Four are calibrated: minimum daily appointments (30% of the appointments that fit in today's opening hours), minimum daily revenue (40% of typical daily takings over 30 days), outstanding limit (1 month of production), pending-value limit (1.5 months of production). Rate thresholds (no-show %, cancellation %, utilization %) stay global on purpose — they are industry benchmarks and holding them fixed keeps clinics comparable. Calibration is still deterministic (it reads metrics already produced) and every derived value is recorded with its plain-language basis, so a tailored threshold is never applied silently. This directly fixes the "fires every quiet Tuesday" problem that trains users to ignore the dashboard.

## 3.3 The 18 signals

**Financial**

1. **`revenue.low_daily_revenue`** — collected today < daily minimum, *guarded by* an activity floor (≥3 appointments) so a closed Sunday stays silent. Triggers on: collected-today, total-appointments. *False positive:* a genuinely light but fine day. *False negative:* a clinic that collected the minimum on one large payment while doing nothing else. **Deserves to exist.**
2. **`revenue.high_outstanding`** — outstanding balance > limit. Simplest possible rule, and the number owners care about most. **Yes.**
3. **`revenue.outstanding_increasing`** — outstanding grew faster than 20% vs the prior period, with a ₹5,000 floor so tiny balances and a zero baseline are handled. *Requires a caller-supplied prior period* — the engine never fetches one. Catches a receivable book climbing while still under the absolute ceiling. **Yes.**
4. **`revenue.collection_lagging_completions`** — treatments were completed today (≥2) yet collection is still below the daily minimum. Neither metric alone shows this; only the pair does. **Yes** — this is the seed of the collection-gap diagnosis.

**Scheduling**

5. **`scheduling.high_cancellation_rate`** — cancellation rate > 10%, *only once* the day holds ≥5 appointments. The sample guard is what stops "2 of 3 cancelled" reading as a 67% crisis. **Yes.**
6. **`scheduling.high_no_show_rate`** — same shape, no-shows, > 8%. **Yes.**
7. **`scheduling.low_appointment_volume`** — booked below the (calibrated) minimum. Severity capped at high. *False positive risk* was the original sin here, now largely fixed by calibration. **Yes.**

**Retention / acquisition**

8. **`acquisition.low_new_patients`** — new patients below 1/day, severity capped at medium (the threshold is a single patient, so breach maths is jumpy). *High false-positive rate at n=1/day* — the reason the signal basis should move to a 30-day count. **Yes, but improve the basis.**
9. **`retention.returning_volume_dropping`** — returning patients fell > 30% vs prior period, floor of 2 patients. Requires a prior period. **Yes.**
10. **`retention.followup_backlog`** — overdue follow-ups > 10, severity floored at low so it never disappears. Optional input: follow-ups due today. **Yes** — the quietest revenue leak.

**Operational**

11. **`operational.long_waiting_time`** — average wait > 30 min. Optional input: patients waiting. **Yes.**
12. **`operational.queue_backlog`** — patients waiting > 5. A live operational number. **Yes.**
13. **`operational.queue_building_up`** — queue grew > 50% vs prior period, floor of 3. Requires a prior period. Direction, not just level. **Yes.**
14. **`operational.low_chair_utilization`** — utilization < 50%, *guarded* by "there must be open slots to sell" so a closed day stays silent. **Yes.**
15. **`operational.near_full_capacity`** — utilization ≥ 90% *or* ≤1 slot left, severity capped at medium. Has a careful closed-day guard: when only the slots branch fires and the appointment count is unavailable, it *skips* rather than call a shut clinic "near full". **Yes.**

**Clinical**

16. **`clinical.large_pending_treatment_value`** — pending treatment value > ₹50,000. The forward book is itself the observation. **Yes.**
17. **`clinical.accepted_treatments_unscheduled`** — planned-with-no-next-visit count > 5. Wording is carefully patient-level and makes no consent claim. **Yes.**
18. **`clinical.pipeline_stalled`** — a three-way relationship no single metric shows: a large pending book **and** a below-minimum day **and** open slots remaining. Demand and capacity both exist on the same day and are not meeting. **Yes** — one of the most genuinely intelligent rules in the set.

## 3.4 Reviewing the Signal Engine as a whole

**What is strong.** Severity is a formula, not a mood, so it cannot drift between rules. The trace makes silence legible. The confidence-suppression floor means the engine chooses quiet over noise. Per-clinic calibration is the fix that turns the dashboard from "cried wolf every Tuesday" into something worth reading each morning — and it does it without sacrificing determinism.

**What I would change.**

1. **Trend signals depend on a prior period the orchestrator does not currently pass.** Three signals (outstanding-increasing, returning-volume-dropping, queue-building-up) require `previousMetrics`, and the main pipeline run supplies history to the *Diagnosis* engine but not as a prior period to the *Signal* engine's current run. In practice these three rarely fire in the live pipeline today. This is the most important gap in the engine — see Part 10.
2. **The one-patient thresholds are a smell.** Two signals need severity caps purely to compensate for a threshold of 1. Moving their basis to 30-day counts removes the need for the cap.
3. **Everything still judges a single day.** The metrics gained windows; the signals mostly have not followed. Cancellation and no-show rates now have 30-day metric versions that no signal reads yet — the signals still compute rates from today's counts behind their sample guard.

---

# Part 4 — Diagnosis Engine

This is the cleverest and the most disciplined part of the system. It takes the signals and asks two questions only: **which of these are one story?** and **what causes are consistent with that story, and what would tell them apart?** It never asserts a single cause, because nothing in daily clinic data can prove one. Every diagnosis carries competing *hypotheses*, each marked `supported`, `contradicted` or `undetermined`, plus *discriminators* naming the exact measurement that would settle the undetermined ones. **A diagnosis whose every hypothesis is undetermined is a correct, expected output — not a failure.**

## 4.1 The machinery shared by every pattern

**Matchers.** Nine pattern matchers run, each a pure rule. Each declares required signals (without which it does not fire) and optional signals (which strengthen it). A tenth "pattern", *unclustered*, runs last and sweeps up any signal no other pattern claimed. Patterns are overlapping **views**, not a partition — one signal legitimately feeds several diagnoses.

**Persistence** is classified once, the same way, for every diagnosis, from up to 7 days of prior metrics (the pipeline re-derives historical signals from historical metrics using the Signal Engine's pure core):
- `insufficient_history` — fewer than 3 days supplied; nothing is assumed.
- `transient` — fired today and on no known prior day.
- `sustained` — fired 3+ consecutive days including today.
- `worsening` / `improving` — the breach magnitude is trending up / down beyond a tolerance.
- `intermittent` — on and off, *or* a call that unknown days prevent.
- **The rule that matters most:** a history day whose evaluator *skipped* for missing data is **unknown**, never "healthy". Treating a gap as a good day would manufacture a recovery that never happened, so a window with unknowns is capped at `intermittent` and lowers confidence.

**Severity** = the worst contributing signal's severity, then moved one band for persistence (worsening/sustained up, improving down), then clamped per pattern. So the same breach is graded worse when it has run three days and better when it is receding.

**Confidence** = data-and-pattern completeness, and it is **capped at the weakest contributing signal** — correlating three observations cannot make any of them better-measured than it was. It is docked for missing history, unknown days, and skipped required evaluators. Undetermined hypotheses are additionally capped (never above 0.5) so "I could not tell" can never render as a confident claim. Diagnoses below 0.4 are suppressed.

**Entity resolution (the settle-what-you-can stage).** After the matchers run, the orchestrator fetches *only* the per-patient / per-appointment rows the day's discriminators actually name (a run raising no cancellation question pays for no cancellation query). Those rows can flip an `undetermined` hypothesis to `supported` or `contradicted`. Rules: a matcher's verdict is never re-opened; contradiction beats support on a tie; a discriminator whose data arrived is marked `available`. Without this stage — or when a fetch fails — the hypotheses simply stay undetermined, which is the correct answer when the measurement was never taken.

## 4.2 The nine patterns

**`demand_supply_mismatch` (operational)** — *idle chairs and a thin book on the same day are one observation.* Requires low utilization **and** low volume. Hypotheses: *insufficient demand* vs *unconverted demand* (a large accepted-but-unscheduled book while the chair sat idle proves demand existed and was not converted) vs *capacity not offered*. The last is partly settleable now: `open_minutes_today` = 0 means nothing was rostered (supported); > 0 rules it out; but whether the open slots were actually *offered through a booking channel* still needs data OraMedha does not hold, so it settles only in the direction the open-minutes figure can settle it. *Could be wrong when* pending-value is just below its threshold — real unconverted demand can hide under the line.

**`capacity_ceiling` (operational)** — *a full chair AND a queue is a different story from either alone: demand met the service ceiling.* Requires near-full capacity plus a queue signal. *Demand exceeded capacity* is directly measured → supported. But *capacity suppresses acquisition* (is a full book turning new patients away?) stays **undetermined even when the low-new-patient signal is present**, because that co-occurrence is not evidence — nothing records a booking request that was declined. This restraint is the pattern at its best. Severity clamped at high.

**`throughput_congestion` (operational)** — *a long queue and a long wait are one episode of congestion.* Requires queue backlog **or** long wait. Cleanly separable: utilization ≥ near-capacity → *capacity-bound* (no slack to absorb the queue); below it → *flow-bound* (capacity sat idle while people waited). What stays undetermined: whether the bunching came from patients *arriving off-schedule* or appointments *overrunning* — both consistent with every available metric, both needing per-appointment timing.

**`schedule_attrition` (scheduling)** — *booked appointments lost before delivery.* Requires high cancellation **or** high no-show rate. Separates *cancellation-dominant* (recoverable — released in advance) from *no-show-dominant* (not — held to the appointment time) using a dominance ratio of 1.5, so a 6/5 day is not called either way and instead asks for the ratio over more days. What it refuses to claim: **why** — a reminder that never sent vs one ignored, an awkward slot vs an unpopular treatment. Those stay undetermined with discriminators attached.

**`collection_gap` (financial)** — *treatment delivered, money did not arrive.* Requires the collection-lagging signal. Its discrimination rests **entirely on persistence**: a one-day gap is normal billing lag (payment lands tomorrow) → *billing_lag* supported; the same gap for 3 consecutive days is not, because tomorrow kept arriving → *systemic_process* supported. With too little history it honestly refuses to call it. A third hypothesis, *patient balances*, stays undetermined pending invoice ageing.

**`revenue_shortfall` (financial)** — *a day that collected below the working-day minimum.* Requires low daily revenue. Reads the pair (appointments delivered, treatments completed): both at/above threshold → *yield* (work done, money not collected); both below → *volume* (less work delivered); split → both undetermined. *Case mix* (lower-value procedures) stays undetermined pending the completed-treatment mix — the metric that would settle it (`average_case_value_30d`) exists but is not yet wired in.

**`pipeline_conversion_failure` (clinical)** — *planned treatment not reaching the chair.* Requires the stalled-pipeline signal, or the full pending-value + unscheduled pair. Idle capacity alongside an unscheduled book rules out "no room for it" → *booking follow-through* supported; a full schedule supports the opposite. *Patient deferral* and *cost barrier* stay undetermined (need the plans themselves, and OraMedha has no payment-plan concept). Careful throughout not to claim the patient consented.

**`patient_base_erosion` (retention)** — *both ends of the base contracting.* Requires low new patients **and** dropping returning volume. The discipline here is that when both fire, both hypotheses stay **supported together** rather than one winning — the pattern only fires when both breached, so calling a single driver would be an invention. *External demand* (did the catchment move?) stays undetermined forever — nothing in the clinic's own data can see outside it.

**`recall_process_failure` (retention)** — *returning volume falling with an overdue recall list, while new-patient acquisition is fine.* Requires follow-up backlog **and** dropping returning volume, **with the low-new-patients signal absent.** Deliberately mutually exclusive with base-erosion. The negative condition is checked against the **trace**: "acquisition ran and found nothing" supports it; "acquisition could not run" leaves it undetermined at reduced confidence and says so. What stays undetermined: whether recalls were never attempted, attempted-but-not-reaching, or reaching-but-declined.

**`unclustered_signal` (safety net)** — any signal no pattern claimed becomes its own minimal diagnosis, always `undetermined` with a single hypothesis restating the signal's own condition. Nothing disappears silently between phases. Severity clamped at high.

## 4.3 Reviewing the Diagnosis Engine as a whole

**What is strong.** The `undetermined` status is the best design decision in the entire product. It is the difference between a tool a dentist trusts and one they catch being wrong once and never open again. The discriminator catalogue is doubly clever: it doubles as the *specification for future data capture* — the list of non-`available` discriminators is literally the roadmap for what to record next. Persistence-from-history, the required trace, contradiction-beats-support, the weakest-signal confidence cap — every one of these is a decision that resists over-claiming.

**What I would change / watch.**

1. **Its intelligence is only as good as the history it is fed.** With the default 0 history days, *every* diagnosis is `insufficient_history` and no persistence, no worsening/improving, and the entire collection-gap discrimination collapses. The value of this engine is unlocked by the metric-history store being populated — see Part 10.
2. **Several discriminators are settleable from metrics that exist but are not wired in** (case mix, lead time). Closing those turns standing `undetermined`s into settled causes, which turns investigative strategies into corrective ones.
3. **Entity resolution depends on a context port the pilot may not implement.** Without it, the richest discriminations (cancellation timing, no-show history, invoice ageing) never resolve, and the engine stays at the "we know the schedule is leaking, we cannot yet tell why" level — honest, but less useful than it could be.

---

# Part 5 — Constraint Engine

Diagnoses overlap on purpose, so a bad day can surface six of them describing three problems. That is right for diagnosis and useless for deciding what to do. The Constraint Engine collapses them into the handful of **bottlenecks** actually limiting the clinic, by grouping diagnoses into categories.

**The mapping (many diagnoses → one bottleneck):**

| Constraint category | Fed by which diagnoses | What it names |
|---|---|---|
| **Capacity** | demand/supply mismatch, capacity ceiling, throughput congestion | Chair capacity and how much of it was used |
| **Scheduling** | schedule attrition | Appointments booked and then lost |
| **Revenue leakage** | collection gap, revenue shortfall | Work delivered against money received |
| **Treatment acceptance** | pipeline conversion failure | Planned treatment with no next visit booked |
| **Retention** | patient base erosion, recall process failure | Patients returning, and being brought back |
| **Acquisition** | *(nothing maps here yet)* | New patients reaching the clinic |

- **The capacity grouping is the point.** "Idle chairs" (demand/supply mismatch) and "full chairs" (capacity ceiling) are opposite readings of the *same resource*, so they go in one bucket. That stops the clinic being handed two contradictory headlines on a day when both fire.
- **`unclustered_signal` maps to nothing on purpose** — promoting "we noticed one odd number" to a business bottleneck would dress up noise as a problem.
- **Severity = the maximum across contributing diagnoses, never the average.** Averaging would let two mild findings dilute one critical one into something that reads as routine.
- Output is sorted by severity, then category name — never by how many diagnoses contributed, because that count measures the catalogue's coverage, not the clinic's pain.
- Still gives no advice; a constraint *names* a bottleneck.

**Assumptions/limits:** the category map is fixed and hand-authored; a new diagnosis pattern needs a line added here or it silently contributes to no constraint. Acquisition is a defined category with no diagnosis feeding it, because the system cannot yet see enquiries that never became appointments.

**Review.** Simple, correct, and doing exactly one valuable job: turning a scattered findings list into a short ranked list of what is actually limiting the clinic. The max-not-average rule and the capacity grouping are the two decisions that make it trustworthy. Nothing here worries me.

---

# Part 6 — Value Engine

Severity says "how alarming". This says "how much". Two constraints can both read `high` while one holds ₹80,000 of unbooked treatment and the other ₹2,000 — value at stake is what separates them.

**The single most important thing about this engine: it reports present size, never projected gain.** "₹80,000 of planned treatment is undelivered" is a measured fact. "Fixing this would earn you ₹40,000" would require knowing how effective an intervention is, which nothing here measures — it would be an invented number arriving in the same confident voice as the measured ones. The engine refuses to produce it, and every value it does produce carries the sentence "This is what is at stake now, not an estimate of what acting would recover."

**How each bottleneck is sized:**

| Constraint | Measured as | From | Unit |
|---|---|---|---|
| Revenue leakage | Billed work not yet paid | outstanding balance | money |
| Treatment acceptance | Planned/in-progress treatment value | pending treatment value | money |
| Capacity | Open chair time that went unbooked = open minutes × (1 − utilization) | open minutes + utilization | minutes |
| Scheduling | Appointments booked and lost | cancelled + no-shows today | count |
| Retention | Lapsed patients with nothing booked | reactivation candidates | count |
| Acquisition | **Not sized** | — | — |

- **Money only where money is genuinely at stake.** A lost appointment is *not* converted to rupees by multiplying by an average case value — the appointments that were lost are not a random sample of the ones that were kept, so that multiplication would be the same invented number in disguise. Lost appointments are reported as a count; empty chair time as minutes.
- **Missing metrics leave a constraint unsized, never sized at zero.** Zero would read as "nothing at stake here" and push a real problem down any ranking. "We measured nothing" and "we measured, and it is nothing" are kept distinct.
- **Acquisition is unsized on principle** — no metric records the patients who did not arrive, and sizing it from those who did would measure the opposite of the thing.
- Value only ever breaks ties *within* an urgency level; it never lets a large slow problem outrank a small urgent one (that would invent an exchange rate between money and risk nobody chose), and different units (rupees vs appointments) compare as equal.

**Review.** The refusal to forecast is the whole value of this engine, and it is correct. My one caution: "value at stake" is subtle, and a busy dentist may read "₹80,000" as "₹80,000 I will get back". The disclaimer sentence is there precisely because of this risk; the UI must carry it prominently (Part 9). One structural note — the domain type calls Value "what a strategy delivered", which is *realised* value belonging to a future Outcome Engine; this engine measures present stakes with the same type, and says which on every value it emits.

---

# Part 7 — Strategy Engine

The first and only component allowed to say what to do. The silence of everything upstream is enforced by a test that scans every string Metrics, Signals and Diagnosis can emit against advisory language and fails the build on a match — so that advice appears in exactly one place, with its reasoning attached.

**The rule that keeps it honest: a strategy may only propose acting on a cause the engine actually settled.** Advising a fix for an `undetermined` cause is confident guessing. So the engine emits two kinds, and never confuses them:

- **Corrective** — the diagnosis *settled* a cause (a `supported` hypothesis); act on that cause. Keyed by hypothesis **slug**, so the advice is bound to the specific explanation, not the pattern in general. There are 11 corrective templates:
  - `cancellation_dominant` → keep a short-notice waitlist to refill released slots
  - `no_show_dominant` → confirm attendance the day before
  - `patient_level_pattern` → handle repeat non-attenders differently
  - `slot_clustering` → look at the times/treatments being lost
  - `unconverted_demand` → book the patients who have a plan and no next visit
  - `insufficient_demand` → bring patients back before adding capacity
  - `capacity_not_offered` → open chair time before treating the day as quiet
  - `uncollected` → collect for work already delivered
  - `case_mix` → look at what is being treated, not what is collected
  - `overrunning` → book the time appointments actually take
  - `arrival_bunching` → spread arrivals across the session
  - *A settled cause with no template in this table produces no advice — silence is the safe direction, never generic advice that happens to fit the category.*

- **Investigative** — the diagnosis could *not* settle a cause; the proposal is to obtain the specific missing measurement, and the discriminator already names which one. Emitted only when nothing was settled for that constraint, so a clinic with an answer is not simultaneously told to go looking for one. Its priority is capped below the constraint's (knowing something is unexplained is less urgent than acting on something understood). "We know the schedule is leaking and cannot yet tell why; here is the measurement that would tell us" is a genuinely useful, honest output.

**Caps and ordering.** At most one corrective per settled cause (deduplicated by slug across diagnoses), at most one investigative per unsettled constraint. Corrective before investigative at equal priority. Value at stake breaks ties only within a priority band. Expected value is stated as a *type* (revenue recovered, appointments booked…), never an amount.

**Review.** The corrective/investigative split is the design that makes this safe to ship. An investigative strategy is a first-class, honest answer, not a fallback. My concerns are about coverage, not correctness:

1. **Every corrective template depends on a hypothesis reaching `supported`, which depends on history and entity data.** With a cold history store and no context port, almost everything the clinic sees will be *investigative*. That is honest, but a dashboard that only ever says "go measure this" will feel unsatisfying — and it is the direct consequence of Parts 10's data gaps, not of this engine.
2. **The advice is sound but generic** ("keep a waitlist", "confirm the day before"). That is appropriate for a deterministic engine; making it specific and warm is exactly the job of the future AI explanation layer, rephrasing a finished strategy — never inventing one.

---

# Part 8 — End-to-End Walkthrough

One realistic clinic, one day, followed the whole way through. This is not a rigged demo — I have let it produce exactly what the code produces, including one awkward result that is itself a finding.

## The clinic

**Sri Dental**, single chair, open 8 hours today (480 open chair-minutes), typical appointment 30 minutes. It has been running long enough to have a 30-day history in the metric store. Over the last 30 days it collected ₹150,000 and produced ₹120,000 of treatment.

**Today's raw data:**
- 3 appointments booked (30 min each), all attended.
- ₹1,200 collected today; 1 treatment completed.
- ₹90,000 of planned treatment on the books; 8 of those planned treatments belong to patients with no upcoming appointment.
- ₹30,000 outstanding across billed-but-unpaid work.
- Nobody waiting in the queue.

## Step 1 — Metrics

The engine computes, among others:
- `appointments.total_today` = 3
- `capacity.open_minutes_today` = 480; `capacity.appointment_capacity_today` = 16 (480 ÷ 30)
- `capacity.chair_utilization` = 90 booked min ÷ 480 = **18.8%**; `capacity.available_slots_today` = (480−90)÷30 = **13**
- `revenue.collected_today` = ₹1,200; `revenue.collected_30d` = ₹150,000; `revenue.production_30d` = ₹120,000
- `revenue.pending_treatment_value` = ₹90,000; `revenue.outstanding` = ₹30,000
- `treatment.accepted_pending_scheduling` = 8; `treatment.completed_today` = 1

## Step 2 — Calibration, then Signals

Thresholds are sized to Sri Dental first: minimum daily appointments = 30% of 16 ≈ **5**; minimum daily revenue = 40% of (150,000÷30) = **₹2,000**; outstanding limit = 1 month of production = **₹120,000**; pending-value limit = 1.5 months = **₹180,000**.

Now the rules fire:
- **`scheduling.low_appointment_volume`** — 3 < 5. ✔ (severity capped at high)
- **`operational.low_chair_utilization`** — 18.8% < 50% and 13 slots open. ✔
- **`revenue.low_daily_revenue`** — ₹1,200 < ₹2,000, on 3 appointments (≥ the activity floor of 3). ✔
- **`clinical.accepted_treatments_unscheduled`** — 8 > 5. ✔
- **`clinical.pipeline_stalled`** — pending ₹90,000 > ₹50,000 limit **and** 3 < 5 appointments **and** 13 slots open. ✔
- `clinical.large_pending_treatment_value` — ₹90,000 < the *calibrated* ₹180,000 limit → **no signal** (calibration correctly suppresses it for a clinic this size).
- `revenue.high_outstanding` — ₹30,000 < calibrated ₹120,000 → **no signal**.

Five signals, each with evidence and a breach magnitude; the trace also records the rules that measured nothing.

## Step 3 — Diagnosis

- **`demand_supply_mismatch`** — requires low utilization + low volume, both present. Banked demand is evident (8 unscheduled plans ≥ 5). So *unconverted demand* → **supported**, *insufficient demand* → **contradicted**, and because open minutes = 480 > 0, *capacity not offered* → **contradicted**. A clean settled cause: **the demand exists and was not converted into bookings.**
- **`pipeline_conversion_failure`** — the pending/unscheduled pair (and the stalled signal) are present. Idle capacity is present, so *booking follow-through* → **supported** (there was room; the visits were not booked), *no available capacity* → **contradicted**; *patient deferral* and *cost barrier* stay undetermined.
- **`revenue_shortfall`** — low daily revenue present. Appointments (3 < 5) and completions (1 < 2) are both low → *volume* → **supported** (less work was delivered, so there was less to collect), *yield* → **contradicted**; *case mix* undetermined.

With no prior bad days in the history window, persistence on each is `transient` and severity is not escalated.

## Step 4 — Constraints

Diagnoses collapse into bottlenecks:
- **Capacity** (from demand/supply mismatch)
- **Treatment acceptance** (from pipeline conversion failure)
- **Revenue leakage** (from revenue shortfall)

Ranked by worst severity.

## Step 5 — Value at stake

- **Capacity:** open chair time unbooked = 480 × (1 − 0.188) ≈ **390 minutes** idle today.
- **Treatment acceptance:** **₹90,000** of planned/in-progress treatment sitting undelivered.
- **Revenue leakage:** **₹30,000** billed and unpaid.

Each carries the disclaimer that this is present size, not projected recovery.

## Step 6 — Strategy (including the awkward part)

- **Capacity → corrective.** *unconverted_demand* is supported and it *has* a template: **"Book the patients who have a plan and no next visit."** Rationale attached: demand existed and the chair sat idle. This is the clean, satisfying output.
- **Treatment acceptance → investigative, unexpectedly.** The settled cause here is *booking_follow_through* — but there is **no corrective template keyed to that slug**, so no corrective strategy is produced and the constraint falls through to an investigative one: *"Establish why patients with planned treatment are leaving without a next visit booked."* The engine *settled* the cause and then gave investigative advice anyway, because the playbook has a hole.
- **Revenue leakage → investigative.** Same story: *volume* is supported but has no template, so the output is *"Establish why delivered work is not turning into money"* — which is also slightly off, because the settled cause was "less work was delivered", not "delivered work went unpaid".

**What this walkthrough exposes.** The reasoning pipeline did its job perfectly — it measured, correlated, settled three causes and sized three bottlenecks honestly. The **corrective playbook is the weak link**: its templates key off hypothesis slugs that several matchers do not emit (`volume`, `yield`, `billing_lag`, `booking_follow_through`, `demand_exceeds_capacity`, and more), while three templates (`uncollected`, `overrunning`, `arrival_bunching`) key off slugs **no matcher emits at all**. The safe-direction design means the failure is graceful — an unmatched settled cause yields an investigative strategy rather than wrong advice — but the effect is that a clinic with genuinely diagnosed problems is often told to "go investigate" what the engine already worked out. This is the highest-value fix in the whole system and is picked up in Parts 10 and 11.

---

# Part 9 — Product Review

Stepping out of the engineering and reading every output as a dentist who owns the practice, checks the dashboard between patients, and needs to make a decision by 9am. For each stage: is it understandable, actionable, trustworthy, and would I open it every morning?

**Metrics.** Understandable and trustworthy — the honesty (withholding rather than zeroing) actually *builds* trust once a dentist realises the tool never bluffs. The risk is the opposite: a screen of 28 numbers is a spreadsheet, and an owner does not want to read 28 things each morning. The windowed numbers (production, collection rate, next-7-days) are the ones they would act on; the daily counters are context. **Verdict: keep the metrics, but the dashboard must lead with 4–5 and tuck the rest away.**

**Signals.** This is where a dentist would start their morning — "what needs me today?". Understandable and actionable. The single biggest trust risk is false alarms on quiet days, and calibration is the feature that addresses it. **Would use daily**, provided the noise stays low.

**Diagnosis.** The most valuable *and* the most fragile from a product view. "Your schedule is leaking and it's mostly advance cancellations, so a waitlist would recover them" is exactly what a consultant would say and would earn deep trust. But "we found a pattern and cannot tell you why, here's what to go measure" — while honest — will frustrate an owner who wanted an answer. The `undetermined` discipline is right, but the *product* has to frame investigative findings as progress, not a shrug.

**Constraints & Value.** "Here are the 2–3 things limiting you, and ₹90,000 is sitting in this one" is the single most decision-useful screen in the system. The one danger is the value disclaimer being missed — "₹90,000" read as "₹90,000 I'll get back". Must be visually unmissable.

**Strategy.** When corrective, genuinely useful. When investigative (which, today, is most of the time — see Part 10), less satisfying. An owner wants to be told what to do, and too often the honest answer is "we don't have the data yet".

## Categorisation

**Essential** (the clinic would miss these if removed):
- Metrics: outstanding, collected-today, production-30d, collection-rate-30d, pending-treatment-value, reactivation-candidates, chair-utilization-30d, booked-next-7d, overdue follow-ups, patients-waiting/average-wait.
- Signals: low daily revenue, high outstanding, high cancellation/no-show rate, low chair utilization, pipeline stalled, follow-up backlog.
- Strategies: the corrective waitlist / confirm-attendance / book-the-planned-treatment set.

**Useful** (real value, not first thing every morning):
- Metrics: cancellation/no-show rate 30d, average case value, lead time, appointments-that-fit, returning-today.
- Signals: outstanding increasing, returning volume dropping, queue building up, near-full capacity, large pending value, accepted-unscheduled.
- Diagnosis: collection gap, schedule attrition, recall process failure, pipeline conversion failure.

**Low value today** (correct, but not yet earning their place for a small pilot clinic):
- Metrics: appointments-total as a *standalone* display (it's an input, not a headline), follow-ups-due-today as intelligence, clinic-share style single-day figures.
- Diagnosis: capacity ceiling and throughput congestion (matter only for a busy multi-chair clinic; a 1-chair pilot rarely triggers them).
- Any investigative strategy whose discriminator needs data the clinic does not record — honest, but reads as a to-do list for the software, not the dentist.

---

# Part 10 — Weaknesses (brutally honest)

**1. The corrective strategy playbook does not match the diagnosis engine.** The most serious functional gap. Several matchers only ever produce settled causes with slugs the strategy table does not recognise (`volume`, `yield`, `billing_lag`, `systemic_process`, `booking_follow_through`, `demand_exceeds_capacity`, `retention_driven`, `recall_execution`, `acquisition_driven`), and three template keys (`uncollected`, `overrunning`, `arrival_bunching`) are dead — no matcher emits them. Net effect: the system frequently settles a cause and then, for want of a template, tells the dentist to go investigate it. Demonstrated live in Part 8.

**2. Almost everything is investigative until history and entity data exist.** Of the corrective causes that *do* have templates, most (`slot_clustering`, `patient_level_pattern`, `cancellation_timing`, `case_mix`) are only ever settled by entity resolution or a longer history window. With a cold metric-history store and no `DiagnosisContextPort` implemented, the only corrective strategies that can fire from same-day metrics are the demand/supply and cancellation/no-show ones. A fresh pilot clinic will see mostly investigative output.

**3. The pipeline runs on almost no history by default.** `historyDays` defaults to 0, and the Diagnosis Engine needs ≥3 to classify anything. Until the metric-history store is populated (there is a cron endpoint for it, `app/api/cron/metric-history/`), every diagnosis is `insufficient_history`: no persistence, no worsening/improving, and the entire collection-gap discrimination (which rests *only* on persistence) cannot resolve. The engine's headline capability is dormant until history accrues.

**4. The Signal Engine's trend rules rarely fire in the live pipeline.** Three signals require a caller-supplied `previousMetrics`, but the main run supplies history to the *Diagnosis* engine rather than as a prior period to the *Signal* run. So "outstanding increasing", "returning volume dropping" and "queue building up" are effectively dark in production even though the code is complete.

**5. Three good metrics reach nobody.** `booking_lead_time_days`, `average_case_value_30d` and `booked_next_7d` are computed and correct but consumed by no signal or diagnosis. The forward-schedule metric is the single most valuable capability in the system and currently surfaces to no dentist.

**6. Approximations and inferred values that must be remembered.**
- *Planned ≠ accepted.* The schema has no "declined" state, so the treatment-acceptance metric cannot mean consent, and case acceptance rate (the most important dental KPI) cannot be built honestly at all.
- *Booking is per-patient, not per-treatment.* "Unscheduled treatment" under-reports, by a known, one-way margin.
- *Duration fallback of 30 minutes* when an appointment has none — reasonable, but it means utilization is partly inferred.
- *Reminders, discounts, write-offs, feedback, payment plans, booking enquiries* — none are recorded, so a whole class of discriminators can never resolve. The discriminator catalogue is admirably explicit about which these are.

**7. Scaling: unbounded clinic-wide loads.** Outstanding balance and pending value load *all* treatments and *all* payments every run. Correct at pilot scale, linear in clinic history, and it will not survive a clinic with years of data without a bounded or maintained-balance strategy.

**8. Calibration depends on data a new clinic does not have.** Threshold calibration reads 30-day production and collection. A brand-new clinic has neither, so it correctly falls back to global defaults — meaning the very clinics most likely to be small and quiet (and thus most prone to false alarms) get the un-calibrated thresholds until a month of data exists.

**9. Determinism vs. reality of clinic behaviour.** The whole system is only as good as the data staff enter. If cancellations are logged as "cancelled" inconsistently, or treatments are not marked completed on the day, the metrics are quietly wrong while looking authoritative. Nothing here can detect sloppy data entry, and the pilot depends on it. **This is the biggest real-world risk, and it is a behavioural one, not a code one.**

**10. Where real clinic validation is still required.** Every threshold default (₹5,000/day, 10% cancellation, 50% utilization, 180-day recall) is a reasoned guess for a "typical" Indian practice, not a validated figure. They need to be checked against real clinics before anyone treats the severities as calibrated truth rather than sensible starting points.

---

# Part 11 — Future Improvements

Ordered by value-to-effort. For each: why it helps, business impact, engineering effort, and whether it should land before the Workflow Engine, before WhatsApp, and before AI explanations.

### 11.1 Complete the corrective strategy playbook ⭐ (do first)
- **Why:** the diagnosis engine already settles causes the strategy engine cannot act on, so the system tells clinics to "investigate" problems it has diagnosed. Fixing the slug mismatches (add templates for `volume`, `yield`, `billing_lag`, `systemic_process`, `booking_follow_through`, `demand_exceeds_capacity`, `retention_driven`, `recall_execution`, `acquisition_driven`; remove or re-point the dead `uncollected`/`overrunning`/`arrival_bunching` keys) turns diagnosed problems into actionable advice.
- **Impact:** High — directly changes what the dentist sees from "go measure" to "do this".
- **Effort:** Low — a data table and a test asserting every matcher slug has coverage.
- **Before Workflow?** **Yes — essential.** The Workflow Engine decomposes strategies into steps; there is nothing to decompose if strategies are mostly investigative.
- **Before WhatsApp?** Yes — WhatsApp would otherwise send "we're not sure" messages.
- **Before AI explanations?** Yes — the AI layer rephrases strategies; give it real ones to rephrase.

### 11.2 Populate and depend on the metric-history store ⭐ (do first)
- **Why:** persistence, trends, and the entire collection-gap discrimination are dormant without ≥3 days of history, and the default run requests 0. Run the existing history cron, and default the pipeline to ~7 history days.
- **Impact:** High — switches the diagnosis engine's headline capability (worsening/sustained/improving, one-off vs systemic) from dark to live.
- **Effort:** Low–Medium — the store, the cron endpoint, and the recompute path all exist; this is wiring and a default change.
- **Before Workflow / WhatsApp / AI?** Yes to all — every downstream layer is more truthful with history behind it.

### 11.3 Feed the Signal Engine a prior period
- **Why:** three complete trend signals are effectively dark because the live run never passes `previousMetrics`. Pass yesterday's stored metrics as the prior period.
- **Impact:** Medium–High — unlocks "outstanding increasing", "returning volume dropping", "queue building up", which are among the best early-warning signals.
- **Effort:** Low once 11.2 exists (the data is already loaded for diagnosis).
- **Before Workflow / WhatsApp / AI?** Yes — cheap and additive.

### 11.4 Wire the three orphan metrics into rules
- **Why:** `booked_next_7d` (forward warning), `average_case_value_30d` (settles the revenue-shortfall case-mix hypothesis), `booking_lead_time_days` (separates capacity-ceiling from demand/supply mismatch) are computed and unused.
- **Impact:** High for the forward-schedule signal specifically — it is the only *warning* the system can give while there is still time to act.
- **Effort:** Medium — new evaluators plus a diagnosis hook or two.
- **Before Workflow?** The forward-schedule signal, yes — a warning a workflow can act on early is worth more than a diagnosis after the week is lost. The others can follow.
- **Before WhatsApp / AI?** Not blocking, but valuable.

### 11.5 Implement the DiagnosisContextPort (entity resolution)
- **Why:** it flips the richest hypotheses (cancellation timing, no-show history, invoice ageing, pending-plan age) from undetermined to settled, which then produces corrective rather than investigative strategies.
- **Impact:** High — but only *after* 11.1, or the settled causes still have no templates.
- **Effort:** Medium — several read-only query methods against existing tables.
- **Before Workflow?** Ideally yes; it is what makes strategies specific. Not strictly blocking.

### 11.6 Bound the clinic-wide loads
- **Why:** outstanding/pending currently load all history every run; fine now, fatal at scale.
- **Impact:** Medium (invisible until it isn't).
- **Effort:** Medium — a maintained running balance or a bounded query.
- **Before Workflow / WhatsApp / AI?** No — a scaling task, not a capability. Do it before broad rollout, not before the next engine.

### 11.7 Per-clinic configuration surface (recall interval, chair count nuance)
- **Why:** the 180-day recall window is clinical and varies by practice type; today it is global.
- **Impact:** Medium.
- **Effort:** Low–Medium.
- **Before anything?** No — a refinement.

### 11.8 Case-acceptance capture (the one schema change worth making)
- **Why:** the single most important dental KPI, impossible to build honestly without a `declined`/`presented` state.
- **Impact:** High, long-term — unlocks true conversion analytics and revenue-leakage reasoning.
- **Effort:** High — schema change *plus* a workflow that makes recording a decline unavoidable, or the metric reads a false ~100%.
- **Before Workflow?** **No — it needs the Workflow Engine** to make the capture reliable. This is a case *for* building Workflow, and a thing to build *with* it, not before it.

**Recommended sequence:** 11.1 + 11.2 together (they unlock each other), then 11.3 and 11.4's forward-schedule signal, then 11.5, then Workflow Engine (carrying 11.8 with it), then WhatsApp, then AI explanations. Do 11.6 before onboarding clinics with long histories.

---

# Part 12 — Final Verdict

**If this were my product:**

**What I would remove.** Nothing from the reasoning core — it is unusually principled. I would remove the three dead strategy template keys (`uncollected`, `overrunning`, `arrival_bunching`) as part of fixing the playbook, and I would stop *displaying* the pure single-day counters as headline metrics (keep them as inputs). I would not build a clinic health score, week-over-week revenue, or revenue-per-chair — all noise or vanity at pilot scale.

**What I would simplify.** The dashboard surface, not the engine. 28 metrics and 18 signals is the right amount to *compute* and the wrong amount to *show*. Lead with 4–5 numbers, the day's signals, the 2–3 constraints with value at stake, and the strategies. Everything else one click away.

**What I would redesign.** The strategy playbook, so its templates are keyed to the slugs the matchers actually emit, with a test that fails if any settleable cause lacks a template. That one change does more for perceived usefulness than any new metric.

**What I am most proud of.** The `undetermined` discipline and the honesty rules around it — withholding instead of zeroing, confidence meaning data-completeness rather than probability, the enforced no-advice boundary, and the discriminator catalogue doubling as the data-capture roadmap. This is a system built by someone who understood that the fastest way to lose a clinician's trust is to be confidently wrong once. It refuses to be.

**What worries me most.** Two things. First, that on real pilot data — cold history store, no context port, incomplete playbook — the clinic mostly sees "we found something, go investigate", which undersells how much the engine actually worked out. That is a wiring-and-playbook problem (Parts 11.1–11.2), not a design flaw, and it is fixable in days, not months. Second, and harder: the whole edifice rests on staff entering clean data, and nothing in it can tell good data from sloppy data. A pilot will live or die on data hygiene.

**Is it ready for real clinics?** The reasoning engine is genuinely ready — it is careful, auditable, and honest. The *product experience* is not quite ready, for one reason: the last-mile wiring (history, prior period, playbook coverage, orphan metrics) means the clinic would see a fraction of the intelligence that is actually computed. Close 11.1 through 11.4 — a small, well-scoped body of work — and it is ready for a supervised pilot with a data-hygiene commitment from the clinic.

**What to build next.** In order: (1) fix the strategy playbook and turn on history [11.1, 11.2]; (2) light up the trend signals and the forward-schedule warning [11.3, 11.4]; (3) entity resolution [11.5]; (4) **then** the Workflow Engine, carrying case-acceptance capture with it [11.8]; (5) WhatsApp as the delivery channel for workflows and strategies; (6) the AI explanation layer last, as a *writer* over finished, verified outputs — never a reasoner. The order matters for the same reason the pipeline's order matters: each layer is only honest if the one beneath it already is.
