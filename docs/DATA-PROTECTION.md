# Data protection — technical architecture

**What OraMedha does with personal and clinical data, described at the level of
what is actually built.**

⚖️ This is engineering documentation. It is **not** a privacy policy, not legal
advice, and makes no compliance claim. The published Privacy Policy is at
**https://oramedha.com/privacy**, maintained with the marketing site.

---

## 1. Where the policy lives, and why not here

The canonical Privacy Policy is published by the marketing site and covers both
the site and this application. The PMS **links to it** and does not host a copy:
two copies drift, and the one people are shown at sign-in would be the copy
nobody maintains.

`lib/legal/links.ts` is the single place that knows the URL. The origin defaults
to the real production domain and is overridable for preview deployments.

⚖️ **No Terms of Service is published.** The marketing site's footer links
`/privacy` and nothing else, so `termsUrl()` returns null and the sign-in footer
degrades to *"By continuing, you acknowledge our Privacy Policy."* A dead link
inside a legal notice is worse than a shorter sentence. Publish Terms, then set
`NEXT_PUBLIC_TERMS_URL`; the full wording appears with no code change.

---

## 2. Roles

- Each **clinic** decides why and how its patients' data is processed. It holds
  the relationship with the patient.
- **OraMedha** provides the software and processes on the clinic's instructions.

This shapes the product: a patient's request about their own record goes to
their clinic first, because the clinic controls it and can act on it. The tools
here — the portal, the export, the consent ledger — exist so a clinic can
actually do that.

⚖️ **No agreement between OraMedha and any clinic exists on record.** That
allocation is currently a description of how the software behaves, not a
contract. **REQUIRES LEGAL ACTION.**

---

## 3. Consent — two different things, deliberately separate

### Clinical consent (pre-existing, unchanged)

`consent_templates` → `consent_template_versions` → `consents` → `consent_audit`.
Versioned templates, a frozen `content_snapshot`, an append-only audit trail, and
immutability of signed rows enforced in the **RLS predicate** rather than in
application code. This is good and nothing in this work touched it.

### Data-processing consent (new, `20260903000200`)

A different act with different properties, which is why it is a different model:

| | Clinical consent | Data-processing consent |
|---|---|---|
| Scope | One procedure | Standing |
| Withdrawable | No — it already happened | **Yes** |
| Divisible | No | **Yes, per category** |
| Recorded as | A signature | A choice, plus what was shown |

Bolting categories onto `consent_templates` would have put a revocable consent
inside a table whose entire design rests on signed rows never changing.

**Four independent categories:** `data_processing`, `communications`,
`marketing`, `ai_assisted`. Independence is enforced by there being no coupling
to enforce — refusing marketing withholds nothing else, and a spec asserts the
defaults for communications and marketing differ.

**Withdrawal never overwrites.** It is a new row; the grant stays. The only
question this ledger is ever asked is *"was this lawful at the time"*, and an
overwritten grant cannot answer it. Each row carries a **frozen copy** of the
notice as it read at that moment, because a notice can be revised and what
someone agreed to cannot be revised retroactively.

**`data_processing` has no toggle.** A clinic cannot treat someone without
keeping a record of the treatment. Offering a switch the product could not
honour would tell a patient something untrue about what they control, so the
portal shows the notice and says what to do instead.

**`actor` distinguishes** a patient's own choice from a staff member recording
one at the front desk — weaker evidence, marked as such. **Staff access to a
record is never treated as the patient's consent, anywhere.**

⚖️ Whether consent is the correct lawful basis for any category, and what a
patient must be told, are legal questions. The mechanism records whatever answer
counsel gives; it does not presume one.

---

## 4. Patient rights, as the software supports them

| Right | Support | Where |
|---|---|---|
| Access | ✅ Complete structured export | Portal → Profile → Download; staff via `exportPatientData` |
| Correction | 🟨 Contact details self-service; clinical fields via the clinic | Portal → Profile |
| Erasure | 🟨 Soft delete with clinical retention | `softDeletePatient` (dentist) |
| Withdraw consent | ✅ Per category, any time | Portal → Profile → Privacy choices |
| Portability | ✅ JSON, complete and structured | Same as access |

**Export delivery.** The export is returned in the authenticated response and
the browser saves it. Nothing is written to storage and no URL is minted — a
generated file in a bucket is a second copy of an entire medical history whose
only protection is a URL. Two scopes: a patient's own export excludes the
dentist's private `internal_notes`; a dentist's export on the patient's behalf
includes them. Neither ever contains another patient, another clinic, staff
credentials, the access logs, or the clinic's consultant fee splits.

⚖️ Whether a patient is entitled to the clinician's private notes on demand is a
legal question. The categories are kept explicit and separable so the answer can
be applied without redesigning anything.

---

## 5. Not implemented

- **No minor / guardian model.** A dental clinic treats children.
  `date_of_birth` is the only signal and it is used to print an age. There is no
  guardian relationship, no guardian contact field, and no verifiable parental
  consent. This is a real gap and it is not addressed here — it needs a data
  model, a UI, and a legal position on verification, and half of it would be
  worse than none.
- **Consent withdrawal IS enforced in the messaging path** — a patient who has
  withdrawn `communications` is removed from every reminder list before a
  message is composed for them (`buildReachable`). Removed rather than flagged:
  the wa.me handoff means the send is a human action this application cannot
  intercept, so a visible "do not contact" row would put a message one mis-click
  away from someone who asked not to receive it.

  Only an **explicit withdrawal** removes anyone. `communications` defaults to
  granted, because an appointment reminder is the thing a patient booked an
  appointment in order to receive — a patient who has never been asked is not
  silently dropped from their own recall.

  WhatsApp remains allow-listed to development clinics regardless.
- **No cookie consent banner.** Only strictly-necessary auth cookies are set,
  and the analytics that changed that analysis has been removed.
- **No data-residency guarantee.** Regions are unverified; see
  `docs/subprocessors.json`.
