/**
 * push-auth-email-config — configure the HOSTED Supabase project's Auth email.
 *
 * WHAT IT DOES
 *   One PATCH to the Supabase Management API's auth-config endpoint, setting
 *   only the email-related fields:
 *
 *     • which mail transport Auth uses (see PROVIDERS below)
 *     • email confirmation ON (mailer_autoconfirm = false)
 *     • the emailed code length (mailer_otp_length = 6)
 *     • the four DentGrow templates in supabase/templates/
 *     • Site URL and the redirect allow-list, which is what every link in
 *       every one of those templates is built from
 *
 *   Nothing else on the project is touched.
 *
 * THREE PROVIDERS, ONE SCRIPT
 *
 *   default       Supabase's own built-in email service. No credentials, no
 *                 DNS, nothing to buy. Delivers only to members of the Supabase
 *                 project's TEAM, two messages an hour.
 *
 *   resend-test   Resend SMTP using the shared `onboarding@resend.dev` sender.
 *                 No domain required, 100 messages a day — but it delivers only
 *                 to the ONE address the Resend account was created with.
 *                 Resend refuses every other recipient outright; that is their
 *                 documented policy for the shared domain, not a setting.
 *
 *   resend        Resend SMTP from a domain you have verified. The production
 *                 answer: no recipient restriction at all.
 *
 *   None of the first two can email a real patient. They differ in WHICH single
 *   group they can reach and how often, so pick by whose inbox you need to see
 *   mail in while building. Only `resend` opens the door to everyone, and it
 *   needs a domain.
 *
 *   Pick one with --provider=<name>. With no flag the script infers it: a
 *   verified-domain sender means `resend`, no Resend credentials at all means
 *   `default`. Switching is safe and idempotent — the losing provider's
 *   settings are cleared rather than left behind to half-apply.
 *
 * WHY SMTP AND NOT THE RESEND API
 *   Supabase Auth already mints the token, sets its expiry, renders the
 *   template and sends the message. Handing it an SMTP server changes only the
 *   last of those. Routing through the Resend HTTP API instead would mean a
 *   Send Email Hook — an Edge Function that re-implements rendering and becomes
 *   a new way for confirmation email to fail. There is no rendering requirement
 *   here that a template cannot meet.
 *
 * WHY THIS AND NOT `supabase config push`
 *   That uploads the whole of supabase/config.toml, which has to keep LOCAL
 *   email pointed at Mailpit. Pushing it would drag local settings onto the
 *   hosted project. This script writes the production-only half instead.
 *
 * SECRETS
 *   Read from the environment, never from a file in this repo and never
 *   written back to one. Nothing is logged but the field NAMES.
 *
 * USAGE
 *   # Supabase's built-in service — no credentials needed
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcd... \
 *   AUTH_SITE_URL=https://dent-grow.vercel.app \
 *   npm run auth:email:push
 *
 *   # Resend's shared sender — no domain needed, owner's inbox only
 *   ... RESEND_SMTP_PASSWORD=re_... \
 *   npm run auth:email:push -- --provider=resend-test
 *
 *   # once a domain is verified in Resend
 *   ... RESEND_SMTP_PASSWORD=re_... AUTH_SMTP_SENDER_EMAIL=no-reply@auth.example.com \
 *   npm run auth:email:push -- --provider=resend
 *
 *   Add --dry-run to print exactly what would be sent (secrets redacted)
 *   without touching the project.
 *
 *   Before trusting either Resend mode, confirm what your account will actually
 *   carry — it asks the real server, not the documentation:
 *
 *       RESEND_SMTP_PASSWORD=re_... npm run auth:email:probe -- \
 *         --to you@example.com --to someone-else@example.com
 *
 * Get SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens
 * Get RESEND_SMTP_PASSWORD (a Resend API key) from https://resend.com/api-keys
 * See supabase/EMAIL.md for the whole picture.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "supabase", "templates");

const DRY_RUN = process.argv.includes("--dry-run");

// Resend's published SMTP endpoint. The username is the literal string
// "resend"; the password is a Resend API key. Port 587 is STARTTLS, which is
// what Supabase Auth expects. Do not invent alternatives to these.
const RESEND_SMTP_HOST = "smtp.resend.com";
const RESEND_SMTP_PORT = 587;
const RESEND_SMTP_USER = "resend";

/**
 * Resend's shared sender, usable with no domain of your own.
 *
 * Resend delivers from it ONLY to the address the Resend account was created
 * with; every other recipient is refused. That is documented policy for the
 * shared domain (resend.com/docs/knowledge-base/403-error-resend-dev-domain),
 * not a quota that can be raised or a setting that can be flipped.
 */
const RESEND_TEST_SENDER = "onboarding@resend.dev";

/** Read an env var or explain precisely what is missing and stop. */
function required(name, hint) {
  const value = process.env[name];
  if (!value) {
    console.error(`\n  Missing ${name}\n  ${hint}\n`);
    process.exit(1);
  }
  return value;
}

function template(file) {
  try {
    return readFileSync(join(TEMPLATES, file), "utf8");
  } catch {
    console.error(`\n  Could not read supabase/templates/${file}\n`);
    process.exit(1);
  }
}

function fail(...lines) {
  console.error(`\n  ${lines.join("\n  ")}\n`);
  process.exit(1);
}

// ── Which provider ───────────────────────────────────────────────────────────

const PROVIDERS = ["default", "resend-test", "resend"];

const flag = process.argv.find((a) => a.startsWith("--provider="));
const requested = flag ? flag.slice("--provider=".length) : null;

if (requested && !PROVIDERS.includes(requested)) {
  fail(
    `Unknown --provider=${requested}.`,
    `Valid values are: ${PROVIDERS.join(", ")}.`,
    "  default      Supabase's built-in service (project team only)",
    "  resend-test  Resend via onboarding@resend.dev (account owner only)",
    "  resend       Resend from your own verified domain (anyone)"
  );
}

const resendKey = process.env.RESEND_SMTP_PASSWORD;
const configuredSender = process.env.AUTH_SMTP_SENDER_EMAIL;
const senderIsShared = Boolean(configuredSender && /@resend\.dev$/i.test(configuredSender));

// No flag: infer from what is actually available. A sender on a real domain
// means production Resend; a resend.dev sender means the shared one; nothing
// means Supabase's own service. Never guess upward into a mode that would fail.
const provider =
  requested ??
  (resendKey && configuredSender && !senderIsShared
    ? "resend"
    : resendKey && senderIsShared
      ? "resend-test"
      : "default");

if ((provider === "resend" || provider === "resend-test") && !resendKey) {
  fail(
    `--provider=${provider} needs RESEND_SMTP_PASSWORD.`,
    "A Resend API key (starts with re_): https://resend.com/api-keys",
    "Without one, run with no flag to use Supabase's built-in service."
  );
}

if (provider === "resend" && !configuredSender) {
  fail(
    "--provider=resend needs AUTH_SMTP_SENDER_EMAIL on a domain you have",
    "verified at https://resend.com/domains.",
    "",
    "If you do not have a domain yet, use --provider=resend-test, which sends",
    "from onboarding@resend.dev — to your own Resend account address only."
  );
}

// ── Fields common to both providers ──────────────────────────────────────────

const accessToken = required(
  "SUPABASE_ACCESS_TOKEN",
  "A Supabase personal access token: https://supabase.com/dashboard/account/tokens"
);
const projectRef = required(
  "SUPABASE_PROJECT_REF",
  "The hosted project's reference id — the subdomain of its API URL."
);
const siteUrl = required(
  "AUTH_SITE_URL",
  "The deployed origin, e.g. https://dent-grow.vercel.app. EVERY link in EVERY\n" +
    "  auth email is built from this — getting it wrong breaks all of them at once."
);

const base = siteUrl.replace(/\/+$/, "");

const config = {
  // ── Confirmation stays required ─────────────────────────────────────────
  // mailer_autoconfirm = true would mark every new address as verified without
  // an email. That is the setting this whole exercise exists to avoid, and it
  // does not change with the transport underneath.
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,

  // ── Code length ─────────────────────────────────────────────────────────
  // Six, matching supabase/config.toml. Set here because the two environments
  // had DRIFTED: local issued 6 and production issued 8, which surfaced as a
  // patient being asked for a "6-digit code" and receiving an 8-digit one.
  //
  // The UI no longer states a length, so nothing breaks if this changes again —
  // but a setting that differs between environments for no reason is a trap,
  // and pinning it in the script is what stops it drifting back.
  mailer_otp_length: 6,

  // ── Where links point ───────────────────────────────────────────────────
  site_url: base,
  uri_allow_list: [
    `${base}/auth/callback`,
    `${base}/reset-password`,
    `${base}/portal/setup`,
  ].join(","),

  // ── Templates ───────────────────────────────────────────────────────────
  // Identical under both providers: the branding is Supabase's rendering, not
  // the mail vendor's, so switching transport never changes what arrives.
  mailer_subjects_confirmation: "Verify your email for OraMedha",
  mailer_templates_confirmation_content: template("confirmation.html"),
  mailer_subjects_recovery: "Reset your OraMedha password",
  mailer_templates_recovery_content: template("recovery.html"),
  mailer_subjects_email_change: "Confirm your new OraMedha email address",
  mailer_templates_email_change_content: template("email_change.html"),
  mailer_subjects_invite: "You've been invited to OraMedha",
  mailer_templates_invite_content: template("invite.html"),
};

// ── Provider-specific fields ─────────────────────────────────────────────────

let summary;

if (provider === "resend" || provider === "resend-test") {
  const senderName = process.env.AUTH_SMTP_SENDER_NAME ?? "OraMedha";
  const senderEmail =
    provider === "resend-test"
      ? (senderIsShared ? configuredSender : RESEND_TEST_SENDER)
      : configuredSender;

  if (provider === "resend") {
    // Refuse a sender that cannot work, rather than configuring a project that
    // bounces every message it tries to send.
    if (/@resend\.dev$/i.test(senderEmail)) {
      fail(
        "AUTH_SMTP_SENDER_EMAIL is a resend.dev address, which is not a",
        "production sender — it reaches only the Resend account owner.",
        "",
        "Use --provider=resend-test if that is what you want, or set a sender",
        "on a domain you have verified at https://resend.com/domains."
      );
    }
    if (/@(gmail|yahoo|outlook|hotmail|icloud)\.com$/i.test(senderEmail)) {
      fail(
        "AUTH_SMTP_SENDER_EMAIL is a consumer mailbox address.",
        "Those domains publish a strict DMARC policy that no third party can send",
        "on behalf of, so every message would be rejected or land in spam. Use an",
        "address on a domain you control and have verified in Resend."
      );
    }
  }

  Object.assign(config, {
    smtp_host: RESEND_SMTP_HOST,
    smtp_port: String(RESEND_SMTP_PORT),
    smtp_user: RESEND_SMTP_USER,
    smtp_pass: resendKey,
    smtp_admin_email: senderEmail,
    smtp_sender_name: senderName,
    // Seconds between two confirmation/reset emails to the same user. Matches
    // auth.email.max_frequency in supabase/config.toml and the cooldown the
    // "Resend email" button shows, so all three agree.
    smtp_max_frequency: 60,
    // Per hour, project-wide. Only adjustable with custom SMTP — Supabase pins
    // it under the built-in service.
    rate_limit_email_sent: 30,
  });

  const shared = [
    "  Still to check by hand, because they live in Resend rather than Supabase:",
    "    • Click tracking and Open tracking are OFF — a tracking redirect fetches",
    "      the URL, and these tokens are single-use, so tracking burns the link",
    "      before the patient opens it",
  ];

  summary =
    provider === "resend-test"
      ? [
          `    Transport       ${RESEND_SMTP_HOST}:${RESEND_SMTP_PORT} (Resend SMTP)`,
          `    From            ${senderName} <${senderEmail}>`,
          `    Rate limit      30 / hour here; 100 / day on Resend's free plan`,
          "",
          "  ⚠️  READ THIS — the shared resend.dev sender reaches ONE inbox:",
          "",
          "    Resend delivers from resend.dev only to the address your Resend",
          "    account was created with. Every other recipient is refused, so a",
          "    real patient will NOT receive a verification email. This is",
          "    Resend's documented policy for the shared domain, not a quota and",
          "    not a setting — see supabase/EMAIL.md §5.",
          "",
          "  Confirm it against your own account before relying on it:",
          "",
          "      RESEND_SMTP_PASSWORD=re_... npm run auth:email:probe -- \\",
          "        --to <your Resend account address> --to <any other address>",
          "",
          ...shared,
        ]
      : [
          `    Transport       ${RESEND_SMTP_HOST}:${RESEND_SMTP_PORT} (Resend SMTP)`,
          `    From            ${senderName} <${senderEmail}>`,
          `    Rate limit      30 / hour`,
          `    Recipients      anyone — this is the production configuration`,
          "",
          ...shared,
          "    • the sending domain is Verified (SPF + DKIM green)",
          "    • a DMARC record exists for it",
        ];
} else {
  // Clear every custom-SMTP field. An empty smtp_host is what makes Auth fall
  // back to the built-in service; the rest are cleared too so a later switch
  // never half-applies leftover credentials from a previous run.
  //
  // rate_limit_email_sent and smtp_max_frequency are deliberately NOT sent:
  // Supabase pins both under the built-in service, and asking for a value it
  // will not honour makes the pushed config a lie about what the project does.
  Object.assign(config, {
    smtp_host: "",
    smtp_port: "",
    smtp_user: "",
    smtp_pass: "",
    smtp_admin_email: "",
    smtp_sender_name: "",
  });

  summary = [
    "    Transport       Supabase's built-in email service",
    "    From            Supabase's own sender (not configurable)",
    "    Rate limit      2 / hour, project-wide (fixed)",
    "",
    "  ⚠️  READ THIS — the built-in service has two hard limits:",
    "",
    "    1. It delivers ONLY to addresses on the project's team. Any other",
    "       recipient fails with 'Email address not authorized'. Real patients",
    "       will NOT receive a verification email.",
    "    2. Two messages per hour for the whole project, shared across signup,",
    "       recovery and invites.",
    "",
    "  That is fine for developing and for staging with your own addresses, and",
    "  it is not a production patient-signup path. To test with an address, add",
    "  it under Organization → Team in the Supabase dashboard first.",
    "",
    "  When a domain is available, verify it in Resend and re-run this with",
    "  --provider=resend. Nothing else in the codebase has to change.",
  ];
}

/** The same object with anything secret replaced, for printing. */
function redacted(o) {
  const copy = { ...o };
  if (copy.smtp_pass) copy.smtp_pass = "<redacted>";
  for (const key of Object.keys(copy)) {
    if (key.endsWith("_content")) copy[key] = `<${copy[key].length} bytes of HTML>`;
  }
  return copy;
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

if (DRY_RUN) {
  console.log(`\nprovider: ${provider}${flag ? "" : "  (inferred from the environment)"}`);
  console.log(`\nPATCH ${endpoint}\n`);
  console.log(JSON.stringify(redacted(config), null, 2));
  console.log("\n(dry run — nothing was sent)\n");
  console.log(summary.join("\n"));
  console.log();
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(config),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`\n  Supabase rejected the update (HTTP ${response.status}).\n`);
  // The response echoes field names, never the password we sent.
  console.error(`  ${body}\n`);
  process.exit(1);
}

console.log(`
  Auth email configuration pushed to project ${projectRef}.

${summary.join("\n")}

    Site URL        ${base}
    Confirmations   required
    Templates       confirmation, recovery, email_change, invite

  Confirm in the dashboard under Project Settings → Authentication → SMTP
  Settings that "Enable Custom SMTP" reads ${provider === "resend" ? "ON" : "OFF"}.

  See supabase/EMAIL.md.
`);
