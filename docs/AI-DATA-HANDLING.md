# AI data handling

**What reaches a third-party model, what does not, and what is still unsettled.**

---

## 1. The provider, stated plainly

| | |
|---|---|
| Provider | **Google** |
| API | **Gemini Developer API** (`generativelanguage.googleapis.com`) |
| SDK | `@google/generative-ai` |
| **Not** used | Vertex AI |
| Model | `gemini-3.1-flash-lite` |
| Data Processing Agreement | ⚖️ **none on record** |
| Retention position | ⚖️ **not established** |
| Training-use position | ⚖️ **not verified** — depends on the billing tier this key sits on |
| Region control | ⚖️ **none** — the Developer API offers no regional pinning |

The difference between the Developer API and Vertex AI is **governance, not
capability**. Vertex is where Google Cloud's data-processing terms, regional
endpoints and enterprise controls live.

**None of that is fixed by code, and none of it is claimed to be.** What code
can do is make the question smaller: send less.

---

## 2. Every path that reaches the model

There are four, and `lib/ai/__tests__/ai-surface.spec.ts` asserts there are no
others — it reads the source, requires that the SDK is constructed in exactly
one module, and fails if a `generateContent` caller appears outside a declared
list.

| Feature | What is sent | Identifiers |
|---|---|---|
| **Patient Summary** (dentist) | Age **band**, gender, visit count, last visit as a **month**, outstanding balance, treatment types/status/dates/patient-visible notes, open follow-ups | ✅ **none** |
| **AI Insights** (dentist) | Clinic-level counts and sums for the day and week; clinic name | ✅ none |
| **Portal assistant** (patient) | The patient's own appointments, treatments, payments and queue position; the clinic's published contact details | 🟨 the patient's own data, at their own request |
| **Business Brain explanation** (dentist) | A closed set of pre-computed facts from the deterministic engines | ✅ none |

### What changed

`buildPatientSummaryPrompt` interpolated `Name: ${patient.name}` alongside
treatment history and outstanding balance. The name is gone — and not merely
omitted from the prompt: **the column is no longer selected**, so it never
enters the process. Age became a ten-year band and last-visit a month, because
an exact date of birth is a re-identification key while an age band is a
clinical fact. The model is told the patient is deliberately unnamed and must
not invent one.

---

## 3. The outbound guard

Every prompt passes `guardOutboundPrompt()` inside the provider module, so a
feature added later cannot bypass it.

**Secrets are rejected outright, always.** A Supabase service key, a JWT, a
Google API key or a Resend key interpolated into a prompt would be handed to a
third party in plaintext and written to their logs. String interpolation is
exactly how an environment variable ends up somewhere it was never meant to go.

**Contact identifiers are rejected unless a call site waives that rule
explicitly.** Exactly one does: the portal assistant, whose job includes
answering "what is the clinic's phone number". A *patient's* contact details are
never waived anywhere.

It **throws rather than redacting**. A silently rewritten prompt hides the
defect that produced it; every AI feature already degrades to a non-blocking
message when a call fails, so the cost of throwing is one missing summary.
A withheld prompt raises an `AI_PROMPT_WITHHELD` security event carrying the
*rule name*, never the prompt.

---

## 4. Business Brain stays aggregate-first

The pipeline is unchanged and remains the right architecture:

```
Clinic data (RLS-scoped, caller's own session) → Metrics → Signals
  → Diagnosis → Strategy → Actions
```

Metrics and signals are counts, sums and ratios. Only `metric_history` is
persisted, and it stores `(clinic_id, metric_key, metric_date, value)` — **no
patient identifier at all**.

The model is a **writer, not an analyst**: it restates findings the
deterministic engines already computed, is forbidden from stating a number that
does not appear in its input, and its output is verified *after* generation by
`verifyExplanation()`, which discards anything that invents a figure or gives
advice. Business Brain does not depend on the model — if Gemini is unavailable,
the findings are unaffected and only the plain-English paragraph is missing.

---

## 5. The model can never mutate a clinical record

- ✅ It has **no database access** — no credentials, no SQL, no Supabase client.
- ✅ All data access is through typed tool functions executed server-side, with
  inputs Zod-validated before any query.
- ✅ `actions/ai.ts` writes to **no clinical table**; a spec asserts this by
  searching for a mutation verb chained off each clinical table name.
- ✅ Booking, rescheduling and cancelling use a **two-turn confirmation**
  enforced by the backend: the first call mints a token and changes nothing, and
  a token issued during the current turn is refused — so a booking always
  requires a real patient reply, not just a model that claims one happened.

---

## 6. Should this move to Vertex AI?

**Probably, and it was not done here.** Honestly:

**What migrating would settle:** a Google Cloud data-processing agreement
covering the API; a regional endpoint (`asia-south1` is Mumbai) so requests are
served in-region; a documented enterprise retention position; and a training-use
position that does not depend on a billing tier nobody has checked.

**What it would not settle:** it is still a transfer to a third party, still
requires the disclosure and contractual basis a DPA provides, and would not by
itself make any statutory claim true.

**Why it was not done in this change:** it needs a Google Cloud project, service-account
credentials, a billing account and a different SDK (`@google-cloud/vertexai`) —
infrastructure decisions with cost implications that belong to whoever operates
OraMedha, not to a code change. Doing it half-way, with an unverified project,
would produce a system that *looks* migrated and carries none of the guarantees.

**What was done instead**, because it was available today and is worth having
either way: data minimisation, the provider isolated behind one module so the
switch is a change to `lib/ai/gemini.ts` rather than a search across the
codebase, and this document.

⚖️ **REQUIRES PROVIDER ACTION:** confirm the billing tier and training-use
position for the current API key. That single answer decides how urgent the
migration is.

---

## 7. What is NOT claimed

- **Pseudonymised is not anonymous.** A treatment history is distinctive, and a
  party holding other data could sometimes re-identify a patient from it. This
  reduces exposure; it does not eliminate it.
- No claim that Google does not retain prompts.
- No claim that Google does not train on them.
- No claim about where a request is served.
- No claim of compliance with any regime.
