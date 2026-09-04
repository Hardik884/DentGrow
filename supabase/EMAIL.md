# OraMedha — Auth email delivery

How OraMedha's authentication emails are sent, which transport carries them in
each environment, and what a human still has to do outside this repository.

> **Status today:** the hosted project sends through **Supabase's built-in email
> service**. Resend is fully implemented and one flag away in two shapes — the
> shared `resend.dev` sender (no domain, one inbox) and a verified domain
> (everyone). See §2 for what each reaches.
>
> **No option in this repository can email a real patient until a domain is
> verified.** That is a vendor policy, verified against Resend's own
> documentation in §2 — not a missing feature and not a setting.

---

## 1. The shape of it

```
OraMedha  ──▶  Supabase Auth  ──▶  a mail transport  ──▶  the inbox
(asks)         (mints the token,     (delivers)
                renders the email)
```

**Supabase Auth remains the whole of authentication**, whichever transport is
underneath. It creates the token, decides when it expires, marks the address
confirmed when the link is opened, and refuses a sign-in until then. The
transport is a delivery van: it accepts a finished message and carries it.

**OraMedha itself never sends an auth email.** There is no `resend` package in
`package.json`, no `RESEND_API_KEY` in the running app, no OTP table, no token
column, no custom verification backend. The app's only involvement is asking
Supabase to send (`auth.signUp`, `auth.resetPasswordForEmail`, `auth.resend`)
and handling the link when it comes back (`/auth/callback`).

That is deliberate, and it is why the Resend path is SMTP rather than the Resend
HTTP API. Using the API would require a Send Email Hook — an Edge Function that
re-implements rendering and becomes a second thing that can break confirmation
email. There is no rendering requirement here that a template cannot meet.

It is also what makes the transport a genuine switch: because nothing in the
application knows who delivers the mail, changing provider touches
configuration only. No code, no templates, no tests.

## 2. What runs where

| | Local | `default` | `resend-test` | `resend` |
|---|---|---|---|---|
| Transport | Mailpit | Supabase built-in | Resend SMTP | Resend SMTP |
| Sender | — | Supabase's own | `onboarding@resend.dev` | your own domain |
| **Who it reaches** | anyone | Supabase project **team members** | **one** address — the Resend account owner | **anyone** |
| Volume | unlimited | 2/hour, fixed | 100/day (Resend free plan) | plan quota |
| Needs a domain | no | no | **no** | **yes** |
| Credentials | none | none | a Resend API key | a Resend API key |

Templates, subjects and "confirmation required" are identical in all four — the
branding is Supabase's rendering, not the transport's, so what arrives never
changes when the transport does.

Only the last column can email a patient. The middle two differ in *whose* inbox
they reach while you build, not in whether they can serve real users:

- **`default`** reaches **several people** — anyone added to the Supabase
  project team — but only twice an hour.
- **`resend-test`** reaches **exactly one person** — the address the Resend
  account was created with — but a hundred times a day, and with OraMedha's own
  `From` name on it.

Pick whichever matches whose inbox needs to see the mail. Neither is a pilot
path.

Local development sends nothing through any real provider, so nobody burns quota
or sending reputation by running the test suite.

### ⚠️ Neither no-domain option reaches a patient

**Supabase's built-in service** delivers only to addresses on the project's
team; every other recipient fails with `Email address not authorized`. It allows
two messages an hour, project-wide. To test with an address, add it under
**Organization → Team** in the Supabase dashboard first.

**Resend's shared `resend.dev` sender** delivers only to the address the Resend
account was created with. Every other recipient is refused with a 403, and this
is Resend's own wording:

> You can only send testing emails to your own email address
> (your-email-address@domain.com). To send emails to other recipients, please
> verify a domain at resend.com/domains, and change the `from` address to an
> email using this domain.

— <https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>

Over SMTP — which is how Supabase talks to Resend — the same refusal arrives as
a 5xx at `RCPT TO` rather than an HTTP 403, and Supabase surfaces it as a
failure to send.

**Confirm it against your own account** rather than taking the docs' word or
this file's. The probe asks the real server, over the same protocol Supabase
uses:

```bash
RESEND_SMTP_PASSWORD=re_... npm run auth:email:probe --   --to <the address your Resend account was created with>   --to <any unrelated external address>
```

Two recipients, because the *difference* between the results is the answer. It
reports which SMTP step refused, so an expired API key is never mistaken for a
recipient restriction, and it sends one real message per accepted recipient.

So the hosted project is a working **staging** environment under either option,
and **not a patient-facing signup path** under either. Nothing in the code is
missing; the gap is a verified sending domain, and §6 closes it.

OraMedha handles both failures honestly rather than showing a raw error:
`describeEmailSendFailure` in [`lib/auth/verification.ts`](../lib/auth/verification.ts)
turns the throttle into a real wait time and the recipient rejection into
"contact your clinic", and logs the underlying cause for the operator.

## 3. Which emails are covered

Every email Supabase Auth sends for this project. There is no per-email
setting — the transport moves all of them at once, and all of them use the
OraMedha templates regardless of which transport is active.

| Email | Sent when | Template | Link lands on |
|---|---|---|---|
| Confirm signup | a new patient submits `/patient/signup` | `confirmation.html` | `/auth/callback` → `/portal/setup` |
| Resend confirmation | "Resend email" on `/patient/verify-email` | `confirmation.html` | same |
| Password recovery | a dentist, receptionist or patient submits `/forgot-password`. **The platform admin is excluded** — see `resolveResetAudience` | `recovery.html` | `/auth/callback` → `/reset-password` |
| Email change | an address on an account is changed | `email_change.html` | `/auth/callback` → `/` |
| Invite | a user is invited from the Supabase dashboard | `invite.html` | `/auth/callback` → `/reset-password` |

> OraMedha has no in-app email-change screen today. The template is configured
> so that a change made from the Supabase dashboard is still branded and still
> lands somewhere sensible; nothing in the app has to change if that screen is
> added later.

## 4. Applying the configuration

One command, from a checkout with the environment variables set:

```bash
npm run auth:email:push
```

Print what it would send first, with secrets redacted and nothing transmitted:

```bash
npm run auth:email:check
```

It PATCHes only the auth-email fields of the linked project
(`scripts/push-auth-email-config.mjs`): the transport, the four templates,
confirmation-required, Site URL and the redirect allow-list. It is idempotent
and safe to re-run.

### Choosing the transport

| Command | Transport |
|---|---|
| `npm run auth:email:push` | **Supabase's built-in service** — what to run today |
| `npm run auth:email:push -- --provider=resend` | **Resend SMTP** — once a domain is verified |

With no flag the script infers the provider: the Resend variables being present
means you meant Resend. `--provider=resend` without those variables is refused
rather than half-applied, because a project configured for an unverified domain
bounces every message it tries to send — which looks like a broken app, not a
missing DNS record.
Switching either way is a full switch, not an overlay: the losing provider's
settings are cleared, so a stale credential can never half-apply.
Environment variables — see `.env.example` for the annotated list:

| Variable | Needed for | Where it comes from |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | both | <https://supabase.com/dashboard/account/tokens> |
| `SUPABASE_PROJECT_REF` | both | the subdomain of the project's API URL |
| `AUTH_SITE_URL` | both | the deployed origin |
| `RESEND_SMTP_PASSWORD` | Resend only | a Resend API key, <https://resend.com/api-keys> |
| `AUTH_SMTP_SENDER_EMAIL` | Resend only | e.g. `no-reply@auth.your-domain.com` |

> ### Do not run `supabase config push`
>
> It uploads the whole of `supabase/config.toml`, which is tuned for LOCAL
> development — Mailpit, and a rate limit sized for the test suite. Pushing it
> drags those settings onto the hosted project. Use `npm run auth:email:push`
> instead; if `supabase config push` is ever run, re-run it immediately
> afterwards.

### Doing it by hand instead

**Today (built-in service).** Supabase Dashboard → **Project Settings →
Authentication → SMTP Settings**: leave *Enable Custom SMTP* **off**. That is
the whole of it — the built-in service is the fallback.
**Later (Resend).** Same screen, *Enable Custom SMTP* **on**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` (the literal word) |
| Password | your Resend API key |
| Sender email | `no-reply@auth.your-domain.com` |
| Sender name | `OraMedha` |
| Minimum interval between emails | `60` seconds |

Either way: **Authentication → Providers → Email** — *Confirm email* **on**;
**Authentication → URL Configuration** — Site URL and redirect allow-list;
**Authentication → Emails** — paste each file from `supabase/templates/`.

## 5. Resend setup — for when a domain exists

**Not needed for `resend-test`**, which works with nothing but an API key. This
section is the checklist for the verified-domain switch, kept here so nothing
has to be rediscovered later. None of it can be done from this repository: it
needs access to the Resend account and to the domain's DNS.

### 5.1 Verify a sending domain

1. Resend → **Domains → Add Domain** → enter the domain you will send from.
   A subdomain such as `auth.your-domain.com` is the better choice: a
   deliverability problem with transactional mail then cannot damage the
   reputation of the root domain, and vice versa.
2. Resend shows the exact records to create. Add them at your DNS host:

   | Type | Purpose | Shape |
   |---|---|---|
   | `TXT` on the sending domain | **SPF** | `v=spf1 include:amazonses.com ~all` |
   | `TXT` on `resend._domainkey.<domain>` | **DKIM** | the long public key Resend generates |
   | `MX` on `send.<domain>` | bounce/feedback handling | `feedback-smtp.<region>.amazonses.com`, priority 10 |

   Copy the values from the Resend dashboard rather than from this table — the
   DKIM key is unique to your domain and the MX host varies by region.

3. Add a **DMARC** record. Resend does not require it, but Gmail and Yahoo now
   do for bulk senders, and it is what stops someone spoofing your clinic:

   | Type | Name | Value |
   |---|---|---|
   | `TXT` | `_dmarc.<root-domain>` | `v=DMARC1; p=none; rua=mailto:dmarc@<root-domain>;` |

   Start at `p=none`, watch the reports for a week or two, then tighten to
   `p=quarantine` and eventually `p=reject`.

4. Wait for Resend to show the domain as **Verified**. Until it does, every
   send is rejected — Supabase will surface it as a failure to send.

### 5.2 Turn OFF click and open tracking

Resend → **Domains → your domain → Settings**: **Click tracking** and **Open
tracking** must both be **off**.

This is not a preference. Click tracking rewrites every link in the email to
pass through a Resend redirector. Supabase Auth tokens are **single-use**: any
scanner, corporate mail filter or preview fetcher that follows the rewritten
link consumes the token, and the patient's own click then lands on "this link
has expired". Supabase documents this explicitly. Open tracking is off for the
same class of reason plus the obvious privacy one — there is no case for
tracking whether someone opened a password reset.

### 5.3 Sender address

Use something clearly transactional on the verified domain:

```
no-reply@auth.<your-domain>
```

Never a personal Gmail/Outlook address — those domains publish DMARC policies
that forbid third-party sending, so the mail is rejected or spam-filed.

`onboarding@resend.dev` is not a production sender either, for the reason in §2:
it reaches only the Resend account owner. It is still genuinely useful while
building, which is what `--provider=resend-test` is for — but
`--provider=resend` refuses it, so nobody can configure a "production" project
that quietly reaches one inbox.

## 6. Switching to Resend later

### Why it is not on now

`NEXT_PUBLIC_APP_URL` is `https://dent-grow.vercel.app`.

**A `vercel.app` subdomain cannot be verified in Resend.** Verification requires
publishing SPF, DKIM and MX records in the domain's DNS zone, and that zone
belongs to Vercel, not to OraMedha. There is no workaround and no setting that
skips it — Resend will not send from an unverified domain.

Without a domain the choice is between two transports that each reach a
different single audience — Supabase's built-in service (project team) or
`resend-test` (the Resend account owner). Neither reaches a patient. §2 has the
comparison.

### The switch, when the time comes

1. **Register a domain** for OraMedha (e.g. `oramedha.in`, `oramedha.app`).
2. **Point the app at it** — add it as a custom domain in Vercel, and set
   `AUTH_SITE_URL` (and the Supabase Site URL, via the push script) to the new
   origin. Do this *before* the first real send: every link in every email is
   built from the Site URL, so switching domains later invalidates links already
   sitting in people's inboxes.
3. **Verify a sending subdomain** in Resend (§5.1) — `auth.<domain>` — and turn
   click and open tracking **off** (§5.2).
4. **Run it:**
   ```bash
   npm run auth:email:push -- --provider=resend
   ```
   with `RESEND_SMTP_PASSWORD` and `AUTH_SMTP_SENDER_EMAIL` set. Dry-run it
   first with `npm run auth:email:check -- --provider=resend`.
5. **Confirm** in the dashboard that *Enable Custom SMTP* now reads **on**, then
   send yourself a real signup and a real password reset, and check both links
   work from a phone that never visited the site.

Nothing else changes. No application code, no templates, no tests, no
migrations — the switch is entirely inside step 4, which is why it is worth
keeping the Resend path warm rather than deleting it and rebuilding later.

### What this unblocks

Until the switch, the hosted project can only mail one small, known group —
whichever the active transport allows (§2) — so real patient self-registration
is not available there under any setting.

Patients can still be created by a receptionist in the app; that path never
involved email and is unaffected. Local development is unaffected in every
respect.

## 7. Verifying it works

**Locally** — no Resend involved:

```bash
npm run db:start
npm run db:reset
npm run dev:local
```

Sign up at <http://localhost:3000/patient/signup>. You land on
`/patient/verify-email` with the resend button already counting down — signup
sent one, and Supabase measures its throttle from that. Open Mailpit at
<http://127.0.0.1:55324>, find "Verify your email for OraMedha", click through,
and you arrive at `/portal/setup`. After the countdown, "Resend email" produces
a second message and locks again.

> **After editing a file in `supabase/templates/`, restart the stack**
> (`npm run db:stop && npm run db:start`). GoTrue loads the templates when its
> container starts and does not re-read them per send, so an edited file goes on
> producing the old email until it is restarted — which looks exactly like a
> template that does not work.

**On the hosted project with the built-in service**, using an address on the
project's team:

- Supabase → **Logs → Auth** shows every send attempt and its outcome.
- `Email address not authorized` means the recipient is not a team member. Add
  it under **Organization → Team**, or accept that this transport cannot mail
  that person. The app shows "contact your clinic" and logs the real cause.
- `For security purposes, you can only request this after N seconds` is the
  2/hour cap or the 60s per-user gap. The app quotes the real wait back.

**On the hosted project with `resend-test`**, using the address the Resend
account was created with:

- Resend → **Logs** shows a `delivered` event. Nothing appears there for a
  refused recipient — it never entered the sending pipeline.
- Any other recipient fails at `RCPT TO`. Run `npm run auth:email:probe` to see
  the server's exact wording, and see §2 for why.
- The `From` reads `OraMedha <onboarding@resend.dev>`.

**After switching to a verified domain** (§6):

- Resend → **Logs** shows a `delivered` event per send. A `bounced` or
  `complained` event there is a deliverability problem, not an app problem.
- Supabase → **Logs → Auth** shows the send attempt and any SMTP rejection.
- If mail is accepted by Resend but never arrives, it is almost always DNS:
  re-check SPF/DKIM in §5.1.
- If the link says "expired" on the first click, it is almost always click
  tracking: re-check §5.2.

## 8. Security notes

- No mail-provider credential exists in the application at all — not in a
  `NEXT_PUBLIC_` variable, not in a server-only one, not in the database. Under
  the built-in service there is no credential anywhere; under either Resend mode
  the key is held by the Supabase project and by whoever runs the scripts.
- `scripts/probe-resend-smtp.mjs` reads the key from the environment, never
  echoes it — not even while reporting an authentication failure — and is never
  imported by the application.
- `scripts/push-auth-email-config.mjs` reads secrets from the environment,
  prints only field names, and redacts `smtp_pass` even in `--dry-run`.
- `.env` and `.env.local` are already git-ignored; `.env.example` carries
  placeholders only.
- The address a "Resend email" request is sent to comes from an httpOnly
  cookie written at signup, never from the browser's request body — so the
  endpoint cannot be used to aim confirmation mail at an arbitrary address.
- Failure messages are classified before display (`describeEmailSendFailure`),
  so no raw Supabase or SMTP wording — including status codes and internal error
  codes — reaches a patient's screen. The operator gets it in the server log.
- Password recovery deliberately does NOT surface the classification. That
  action only reaches a send for an address that resolved to a real account, so
  echoing "not authorized" back would confirm the account exists. It returns the
  same generic line either way and logs the detail. This matters more now that
  recovery covers staff: the same form is the route to a dentist's account, so a
  differentiated response would say which addresses are worth attacking. It is
  also what hides the admin exclusion — an admin address gets the same generic
  success and no email, so the form cannot be used to find out which address
  holds the admin flag.
- **Recovery now reaches staff, and the transport therefore decides whether it
  works.** Under `default`, Supabase's built-in service refuses any recipient
  who is not a project team member — so a real clinic's dentist submits the
  form, sees the same generic success, and no email ever arrives. The failure is
  visible only in the server log. Staff password reset is not usable in
  production until the `resend` transport is configured with a verified domain.
- Changing the email transport changes nothing about authorisation. Roles,
  `clinic_id` resolution, portal linking and every RLS policy are untouched, and
  switching between transports touches configuration only.
