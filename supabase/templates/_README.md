# OraMedha — Supabase Auth email templates

These are the HTML bodies Supabase Auth renders and hands to the SMTP provider
(Resend in production, Mailpit locally). They are **not** sent by OraMedha: the
app never composes or delivers an auth email. Supabase mints the token, renders
one of these files, and posts it to SMTP.

| File | Supabase template | When it is sent |
|---|---|---|
| `confirmation.html` | `[auth.email.template.confirmation]` | New patient signs up at `/patient/signup` |
| `recovery.html` | `[auth.email.template.recovery]` | Patient uses `/forgot-password` |
| `email_change.html` | `[auth.email.template.email_change]` | A signed-in user changes their address |
| `invite.html` | `[auth.email.template.invite]` | A staff account is invited from the Supabase dashboard |

They are wired up in `supabase/config.toml`, so `supabase start` / `db reset`
uses them locally and they render in Mailpit at <http://127.0.0.1:55324>.

## Why every link goes through `{{ .TokenHash }}`, not `{{ .ConfirmationURL }}`

`{{ .ConfirmationURL }}` points at Supabase's own `/auth/v1/verify` endpoint,
which finishes in the **PKCE** flow — it needs the `code_verifier` cookie that
was written in the browser that started the flow. A patient who signs up on a
laptop and opens the email on their phone does not have that cookie, and the
link dies with "invalid request".

`{{ .TokenHash }}` is verified by `verifyOtp({ token_hash, type })` in
[`app/auth/callback/route.ts`](../../app/auth/callback/route.ts), which needs no
cookie at all. Same security (a single-use, server-minted, expiring token), but
it survives being opened on a different device — which is the normal case.

Every link therefore has the shape:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=<type>&next=<path>
```

`{{ .SiteURL }}` is the project's **Site URL** (`auth.site_url` locally, the
Authentication → URL Configuration value in production). If that is wrong, every
link in every email is wrong — it is the single most important production
setting. See [`../EMAIL.md`](../EMAIL.md).

## Rules for editing these files

- **Inline the CSS.** Gmail strips `<style>` blocks. The `<style>` head block
  here only carries the dark-mode media query, which is a progressive
  enhancement — the inline styles must stand alone.
- **No external images, no SVG.** Gmail strips `<svg>` and blocks remote images
  by default. The OraMedha lockup is drawn with a bordered table cell and live
  text, so it renders everywhere and needs nothing downloaded.
- **No web fonts.** They do not load in most mail clients. The stack falls back
  to the platform UI font.
- **Never wrap the action URL.** No tracking redirect, no URL shortener, no
  extra query parameters. These tokens are single-use; anything that fetches
  the URL before the human does burns the token and the patient gets an
  "invalid or expired link" page. This is also why Resend click tracking must
  stay **off** — see `../EMAIL.md`.
- **Keep the raw URL visible.** The paragraph under the button repeats the link
  as text so a client that mangles the button still leaves a usable link.
