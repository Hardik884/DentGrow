/**
 * Regression net for how DentGrow's authentication email is delivered.
 *
 *   DentGrow → Supabase Auth → Resend SMTP → the patient's inbox
 *
 * Everything here guards a property that is invisible until it fails in
 * production, and that no other test would catch:
 *
 *   - the app must never become the thing that sends auth email;
 *   - no Resend or SMTP credential may ever reach the browser;
 *   - the confirmation links must stay openable on a second device;
 *   - nothing may fetch one of those links before the human does, because they
 *     are single-use and a pre-fetch spends them;
 *   - local development must keep sending to Mailpit, not to Resend;
 *   - email confirmation must stay on.
 *
 * These read the repository as text on purpose. The values they pin live in
 * config files and HTML, not in TypeScript, so importing a module would test
 * nothing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TEMPLATE_DIR = join(ROOT, "supabase", "templates");

/**
 * Read a repository file with line endings normalised.
 *
 * git checks these files out with CRLF on Windows and LF elsewhere, so any
 * assertion spanning two lines would pass on one developer's machine and fail
 * on another's. Normalising here makes the specs describe content, not
 * whichever platform last touched the working tree.
 */
const normalise = (text: string) => text.split("\r\n").join("\n");

const read = (...parts: string[]) =>
  normalise(readFileSync(join(ROOT, ...parts), "utf8"));

const CONFIG = read("supabase", "config.toml");

/**
 * Each template, and the `type` its links must carry. The type is what
 * /auth/callback hands to `verifyOtp`, so a wrong one produces a link that
 * looks perfect and always fails.
 */
/**
 * Templates whose payload is a LINK the recipient clicks.
 *
 * confirmation.html is deliberately absent. It is what Supabase sends for
 * signInWithOtp() on a new account, which is how portal activation starts, and
 * that flow asks for a 6-digit code typed back into the page the patient
 * already has open — so it carries {{ .Token }} and no link at all. It is
 * asserted separately below.
 */
const LINK_TEMPLATES = [
  { file: "recovery.html", type: "recovery", next: "/reset-password" },
  { file: "email_change.html", type: "email_change", next: "/" },
  { file: "invite.html", type: "invite", next: "/reset-password" },
] as const;

/** Every template, for the properties that hold regardless of payload. */
const TEMPLATES = [
  { file: "confirmation.html" },
  { file: "magic_link.html" },
  ...LINK_TEMPLATES,
] as const;

/**
 * Templates whose payload is a 6-digit CODE.
 *
 * Both, because signInWithOtp() does not reliably pick one: production sent the
 * magic-link email for the same call that took the confirmation path locally.
 * Whichever Supabase reaches for has to carry the code, or portal activation
 * asks for something the patient was never sent.
 */
const CODE_TEMPLATES = [
  { file: "confirmation.html" },
  { file: "magic_link.html" },
] as const;

const body = (file: string) =>
  normalise(readFileSync(join(TEMPLATE_DIR, file), "utf8"));

// ── The app never sends email itself ─────────────────────────────────────────

describe("DentGrow does not send its own auth email", () => {
  it("has no email-provider SDK as a dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    // Resend is reached over SMTP, by Supabase, from Supabase's own
    // infrastructure. An SDK here would mean something in this repo had started
    // composing auth mail — which is the architecture this setup exists to
    // avoid, because it puts a second, unverified path to the same inbox.
    for (const forbidden of ["resend", "nodemailer", "@sendgrid/mail", "postmark"]) {
      expect(installed, `${forbidden} must not be a dependency`).not.toContain(forbidden);
    }
  });

  it("defines no verification-token storage of its own", () => {
    const migrations = readdirSync(join(ROOT, "supabase", "migrations"));
    const suspicious = migrations.filter((f) =>
      /(verification|email_otp|email_token|confirm_token)/i.test(f)
    );
    // Supabase Auth owns the token, its hash and its expiry. A table here would
    // be a second source of truth for whether an address is confirmed.
    expect(suspicious).toEqual([]);
  });
});

// ── No credential can reach the browser ──────────────────────────────────────

describe("Resend and SMTP credentials stay server-side", () => {
  /** Credentials this setup actually uses, and must therefore document. */
  const SECRET_NAMES = [
    "RESEND_SMTP_PASSWORD",
    "SUPABASE_ACCESS_TOKEN",
    "AUTH_SMTP_SENDER_EMAIL",
  ];

  /**
   * Names that must never become browser-visible. Wider than the list above:
   * RESEND_API_KEY is deliberately absent from this project — the Resend HTTP
   * API is not used — but if a Send Email Hook is ever added, the rule that it
   * cannot be a NEXT_PUBLIC_ variable should already be in place.
   */
  const NEVER_PUBLIC = [...SECRET_NAMES, "RESEND_API_KEY", "SMTP_PASS"];

  it("never prefixes an email credential with NEXT_PUBLIC_", () => {
    const example = read(".env.example");
    for (const name of NEVER_PUBLIC) {
      expect(example).not.toContain(`NEXT_PUBLIC_${name}`);
    }
    // Nor any NEXT_PUBLIC_ name that mentions Resend or SMTP at all.
    const publicNames = example.match(/^NEXT_PUBLIC_[A-Z0-9_]+/gm) ?? [];
    for (const name of publicNames) {
      expect(name).not.toMatch(/RESEND|SMTP|MAIL/);
    }
  });

  it("reads the SMTP password only from the configuration script, never from app code", () => {
    // The Next.js app has no reason to know it. Anything under app/,
    // components/, actions/, hooks/ or lib/ could end up in a client bundle or
    // in a server log; the push script runs once, by hand, from a terminal.
    const appDirs = ["app", "components", "actions", "hooks", "lib"];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
        const source = read(...path.split("/"));
        for (const name of ["RESEND_SMTP_PASSWORD", "RESEND_API_KEY", "SMTP_PASS"]) {
          if (source.includes(`process.env.${name}`)) offenders.push(`${path} → ${name}`);
        }
      }
    };
    for (const dir of appDirs) walk(dir);

    expect(offenders).toEqual([]);
  });

  it("keeps the real .env files out of git", () => {
    const ignored = read(".gitignore");
    expect(ignored).toMatch(/^\.env$/m);
    expect(ignored).toMatch(/^\.env\.local$/m);
  });

  it("documents every credential in .env.example with a placeholder, not a value", () => {
    const example = read(".env.example");
    for (const name of SECRET_NAMES) {
      expect(example, `${name} must be documented`).toContain(name);
    }
    // A real Resend key starts re_ followed by a long random string; the
    // placeholder must not look like one.
    expect(example).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    expect(example).not.toMatch(/sbp_[a-f0-9]{20,}/);
  });
});

// ── The links in the emails ──────────────────────────────────────────────────

describe("auth email templates", () => {
  it.each(TEMPLATES)("$file is wired into config.toml", ({ file }) => {
    expect(CONFIG).toContain(`content_path = "./supabase/templates/${file}"`);
  });

  // The PKCE guard applies to EVERY template, whatever its payload.
  it.each(TEMPLATES)("$file never uses the PKCE ConfirmationURL", ({ file }) => {
    // {{ .ConfirmationURL }} finishes in the PKCE flow, which needs the
    // code_verifier cookie from the browser that started the request. Opening
    // the email on a phone after starting on a laptop then fails.
    expect(body(file)).not.toContain("{{ .ConfirmationURL }}");
  });

  it.each(LINK_TEMPLATES)(
    "$file links through /auth/callback with a token hash",
    ({ file, type, next }) => {
      const html = body(file);

      // TokenHash is verified by verifyOtp and needs no cookie, so the link
      // works on a different device than the one that asked for it.
      expect(html).toContain("{{ .TokenHash }}");

      const expected = `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=${type}&amp;next=${next}`;
      expect(html).toContain(expected);

      // Every link in the file is that link — a stray absolute URL would be
      // either a broken action or an unreviewed outbound destination.
      const urls = new Set(html.match(/https?:\/\/[^"'\s<]+/g) ?? []);
      expect([...urls]).toEqual([]);
    }
  );

  it.each(CODE_TEMPLATES)("$file carries a 6-digit code and NO link", ({ file }) => {
    const html = body(file);

    // The activation payload.
    expect(html).toContain("{{ .Token }}");

    // No link, and specifically not the old one. It used to point at
    // /auth/callback?type=signup&next=/portal/setup — the phone-matching flow
    // that asked the patient to choose a clinic. Leaving it would have given
    // this email two routes ending in different places, one of them the flow
    // clinic-issued activation exists to replace.
    expect(html).not.toContain("/auth/callback");
    expect(html).not.toContain("/portal/setup");
    expect(new Set(html.match(/https?:\/\/[^"'\s<]+/g) ?? []).size).toBe(0);
  });

  it.each(TEMPLATES)("$file never routes its link through a tracker", ({ file }) => {
    const html = body(file);
    // Any redirector that fetches the URL spends the single-use token before
    // the patient clicks. This is the same reason Resend click tracking has to
    // stay off (supabase/EMAIL.md §5.2) — it just cannot be asserted from here.
    for (const tracker of ["click.", "/track/", "utm_", "bit.ly", "sendgrid.net", "list-manage"]) {
      expect(html.toLowerCase(), `${file} must not contain ${tracker}`).not.toContain(tracker);
    }
  });

  it.each(TEMPLATES)("$file renders without downloading anything", ({ file }) => {
    const html = body(file);
    // Gmail strips <svg> and blocks remote images by default, and web fonts do
    // not load in most clients. The lockup is drawn with table cells and live
    // text so it looks the same everywhere and needs no network.
    expect(html).not.toMatch(/<svg/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/fonts\.googleapis|@import|@font-face/i);
  });

  it.each(TEMPLATES)("$file survives a client that strips the <style> block", ({ file }) => {
    const html = body(file);
    // Gmail removes <style> entirely. Everything structural must therefore be
    // inline; the head block may only carry the dark-mode and narrow-screen
    // media queries, which are enhancements.
    const styleBlock = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const outsideMediaQueries = styleBlock.replace(/@media[^{]+\{[\s\S]*?\n {6}\}/g, "").trim();
    expect(outsideMediaQueries.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
  });

  it.each(TEMPLATES)("$file greets safely when the account has no name", ({ file }) => {
    // An invited user, or anyone who signed up without metadata, has no
    // full_name. Without the else branch the email opens with a bare "Hi ,".
    expect(body(file)).toContain(
      "{{ if .Data.full_name }}Hi {{ .Data.full_name }},{{ else }}Hi there,{{ end }}"
    );
  });
});

// ── Environment split, and the setting nobody may quietly flip ───────────────

describe("supabase/config.toml", () => {
  it("requires email confirmation", () => {
    // The point of the whole exercise. `enable_confirmations = false` would let
    // an unproven address own a patient's clinical history.
    expect(CONFIG).toMatch(/^enable_confirmations = true$/m);
  });

  it("keeps local development on Mailpit and away from the Resend account", () => {
    expect(CONFIG).toMatch(/\[local_smtp\]\nenabled = true/);

    // `supabase start` reads this same file, so an enabled SMTP block here
    // would push every local signup through production Resend — real mail, real
    // quota, real sending reputation, from a laptop. Production SMTP is applied
    // to the hosted project by scripts/push-auth-email-config.mjs instead.
    const smtpSection = /^\[auth\.email\.smtp\]/m.test(CONFIG);
    expect(smtpSection, "[auth.email.smtp] must stay commented out").toBe(false);
  });

  it("agrees with the resend cooldown the UI shows", async () => {
    // The button on /patient/verify-email locks for RESEND_COOLDOWN_SECONDS.
    // If Supabase's own minimum is longer, the button re-enables into a
    // rejection the patient reads as a failure.
    const { RESEND_COOLDOWN_SECONDS } = await import("../verification");
    const configSeconds = Number(/^max_frequency = "(\d+)s"$/m.exec(CONFIG)?.[1]);

    expect(configSeconds).toBeGreaterThan(0);
    expect(RESEND_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(configSeconds);
  });

  it("keeps the cooldown constant out of the client component", () => {
    // Regression: it originally lived in VerifyEmailPanel.tsx, which carries
    // "use client". Every export of such a module is an opaque client
    // REFERENCE on the server, so the page's `RESEND_COOLDOWN_SECONDS -
    // elapsed` evaluated to NaN, Math.max(0, NaN) is NaN, and the button
    // rendered enabled into a guaranteed throttle rejection. TypeScript sees
    // the real declared type and cannot catch it; only running it does.
    const panel = read("app", "(auth)", "patient", "verify-email", "VerifyEmailPanel.tsx");
    expect(panel).toMatch(/^"use client";/);
    expect(panel).not.toMatch(/export const RESEND_COOLDOWN_SECONDS/);
    expect(panel).toContain('from "@/lib/auth/verification"');

    const page = read("app", "(auth)", "patient", "verify-email", "page.tsx");
    expect(page).toContain('from "@/lib/auth/verification"');

    // And the module it now lives in must never become a client module itself.
    // Matched as a leading directive, not a substring — the file's own comment
    // explains the trap and necessarily names it.
    expect(read("lib", "auth", "verification.ts")).not.toMatch(/^\s*["']use client["']/);
  });

  it("allows enough email per hour for a full e2e run", () => {
    const perHour = Number(/^email_sent = (\d+)$/m.exec(CONFIG)?.[1]);
    expect(perHour).toBeGreaterThanOrEqual(30);
  });

  it("allow-lists every URL an auth email can send someone to", () => {
    for (const path of ["/auth/callback", "/reset-password", "/portal/setup"]) {
      expect(CONFIG).toContain(`http://localhost:3000${path}`);
    }
  });
});

// ── The hosted project's transport is a switch, not a rewrite ────────────────

describe("push-auth-email-config", () => {
  const SCRIPT = join(ROOT, "scripts", "push-auth-email-config.mjs");

  const BASE_ENV = {
    SUPABASE_ACCESS_TOKEN: "sbp_fake_token_for_tests",
    SUPABASE_PROJECT_REF: "fakeprojectref",
    AUTH_SITE_URL: "https://dent-grow.vercel.app",
  };

  const RESEND_ENV = {
    RESEND_SMTP_PASSWORD: "re_fake_key_for_tests",
    AUTH_SMTP_SENDER_EMAIL: "no-reply@auth.example.com",
  };

  /**
   * Run the script in --dry-run and return what it would have sent.
   *
   * A subprocess rather than an import because the script is a top-level
   * program that reads process.env and calls process.exit — and because this
   * is exactly how a human runs it, so the test exercises the real thing.
   * --dry-run guarantees no network call: the script exits before its fetch.
   */
  function dryRun(env: Record<string, string>, ...args: string[]) {
    const stdout = execFileSync(process.execPath, [SCRIPT, "--dry-run", ...args], {
      // A clean environment, so a developer's own real credentials sitting in
      // the shell can never leak into an assertion — or into this output.
      // Cast because Next's type augmentation marks NODE_ENV required on
      // ProcessEnv, and deliberately withholding it is the point here.
      env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
    }).toString();
    const json = stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1);
    return { stdout, payload: JSON.parse(json) as Record<string, unknown> };
  }

  it("defaults to Supabase's built-in service when no Resend credentials exist", () => {
    const { stdout, payload } = dryRun(BASE_ENV);

    expect(stdout).toContain("provider: default");
    // An empty smtp_host is what makes Auth fall back to the built-in service.
    expect(payload.smtp_host).toBe("");
    // Every other credential field is cleared too, so a later switch can never
    // half-apply leftovers from a previous run.
    for (const field of ["smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name"]) {
      expect(payload[field], field).toBe("");
    }
  });

  it("does not pretend to set limits the built-in service pins", () => {
    const { payload } = dryRun(BASE_ENV);
    // Supabase fixes both under its own service. Sending a value it will not
    // honour makes the pushed configuration a lie about what the project does.
    expect(payload).not.toHaveProperty("rate_limit_email_sent");
    expect(payload).not.toHaveProperty("smtp_max_frequency");
  });

  it("warns, in the open, that the built-in service cannot reach real patients", () => {
    const { stdout } = dryRun(BASE_ENV);
    expect(stdout).toMatch(/only to addresses on the project's team/i);
    expect(stdout).toMatch(/2 \/ hour/);
  });

  it("still switches to Resend on demand — the integration stays ready", () => {
    const { stdout, payload } = dryRun({ ...BASE_ENV, ...RESEND_ENV }, "--provider=resend");

    expect(stdout).toContain("provider: resend");
    expect(payload.smtp_host).toBe("smtp.resend.com");
    expect(payload.smtp_port).toBe("587");
    expect(payload.smtp_user).toBe("resend");
    expect(payload.smtp_admin_email).toBe("no-reply@auth.example.com");
    expect(payload.rate_limit_email_sent).toBe(30);
  });

  it("infers Resend from the credentials being present, without a flag", () => {
    const { stdout } = dryRun({ ...BASE_ENV, ...RESEND_ENV });
    expect(stdout).toContain("provider: resend");
  });

  it("refuses --provider=resend when Resend cannot actually send", () => {
    expect(() => dryRun(BASE_ENV, "--provider=resend")).toThrow();
  });

  // ── Resend's shared sender, for when there is no domain ───────────────────

  describe("resend-test (onboarding@resend.dev)", () => {
    const SHARED_ENV = { RESEND_SMTP_PASSWORD: "re_fake_key_for_tests" };

    it("sends through Resend SMTP from the shared address", () => {
      const { stdout, payload } = dryRun(
        { ...BASE_ENV, ...SHARED_ENV },
        "--provider=resend-test"
      );

      expect(stdout).toContain("provider: resend-test");
      expect(payload.smtp_host).toBe("smtp.resend.com");
      expect(payload.smtp_user).toBe("resend");
      expect(payload.smtp_admin_email).toBe("onboarding@resend.dev");
      // Custom SMTP is genuinely on here, so these limits do apply.
      expect(payload.rate_limit_email_sent).toBe(30);
      expect(payload.smtp_max_frequency).toBe(60);
    });

    it("needs no domain and no sender address of its own", () => {
      // The whole point: it works with nothing but an API key.
      expect(() =>
        dryRun({ ...BASE_ENV, ...SHARED_ENV }, "--provider=resend-test")
      ).not.toThrow();
    });

    it("is inferred when the configured sender is a resend.dev address", () => {
      const { stdout } = dryRun({
        ...BASE_ENV,
        ...SHARED_ENV,
        AUTH_SMTP_SENDER_EMAIL: "onboarding@resend.dev",
      });
      expect(stdout).toContain("provider: resend-test");
    });

    it("says plainly that it reaches one inbox and cannot serve patients", () => {
      const { stdout } = dryRun(
        { ...BASE_ENV, ...SHARED_ENV },
        "--provider=resend-test"
      );
      expect(stdout).toMatch(/only to the address your Resend\s+account was created with/);
      expect(stdout).toMatch(/real patient will NOT receive/i);
    });

    it("still refuses to pose as the production configuration", () => {
      // Pointing --provider=resend at resend.dev would configure a project that
      // silently reaches nobody but the account owner. It must be an explicit
      // choice, never something a stray env var slides you into.
      expect(() =>
        dryRun(
          { ...BASE_ENV, ...SHARED_ENV, AUTH_SMTP_SENDER_EMAIL: "onboarding@resend.dev" },
          "--provider=resend"
        )
      ).toThrow();
    });

    it("keeps confirmation on and the templates identical to every other mode", () => {
      const shared = dryRun({ ...BASE_ENV, ...SHARED_ENV }, "--provider=resend-test").payload;
      const production = dryRun({ ...BASE_ENV, ...RESEND_ENV }, "--provider=resend").payload;

      expect(shared.mailer_autoconfirm).toBe(false);
      expect(shared.mailer_templates_confirmation_content).toEqual(
        production.mailer_templates_confirmation_content
      );
    });
  });

  it("sends the same templates and keeps confirmation on under both providers", () => {
    const asDefault = dryRun(BASE_ENV).payload;
    const asResend = dryRun({ ...BASE_ENV, ...RESEND_ENV }, "--provider=resend").payload;

    for (const payload of [asDefault, asResend]) {
      // Switching transport must never quietly switch confirmation off, and the
      // branding is Supabase's rendering — so what arrives does not change.
      expect(payload.mailer_autoconfirm).toBe(false);
      expect(payload.site_url).toBe("https://dent-grow.vercel.app");
      expect(payload.mailer_subjects_confirmation).toBe("Verify your email for OraMedha");
    }
    expect(asDefault.mailer_templates_confirmation_content).toEqual(
      asResend.mailer_templates_confirmation_content
    );
  });

  describe("the delivery probe", () => {
    const PROBE = join(ROOT, "scripts", "probe-resend-smtp.mjs");

    /** Run the probe and capture output, whether it exits 0 or not. */
    function runProbe(env: Record<string, string>, ...args: string[]) {
      try {
        return execFileSync(process.execPath, [PROBE, ...args], {
          env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).toString();
      } catch (error) {
        const e = error as { stdout?: string; stderr?: string };
        return `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
    }

    // These paths all exit before any socket is opened, so the suite stays
    // offline-safe — the probe itself is a manual tool, not something CI runs.
    it("refuses to run without a key, and names the one it wants", () => {
      const out = runProbe({}, "--to", "someone@example.com");
      expect(out).toContain("RESEND_SMTP_PASSWORD");
    });

    it("insists on a recipient, and explains why two are better than one", () => {
      const out = runProbe({ RESEND_SMTP_PASSWORD: "re_fake" });
      expect(out).toMatch(/No --to given/);
      expect(out).toMatch(/difference between those two results IS the answer/i);
    });

    it("never echoes the key back, even while complaining", () => {
      const key = "re_a_very_recognisable_fake_key";
      const out = runProbe({ RESEND_SMTP_PASSWORD: key });
      expect(out).not.toContain(key);
    });
  });

  it("never prints a secret, even in the payload it echoes back", () => {
    const { stdout } = dryRun({ ...BASE_ENV, ...RESEND_ENV }, "--provider=resend");

    expect(stdout).not.toContain(RESEND_ENV.RESEND_SMTP_PASSWORD);
    expect(stdout).not.toContain(BASE_ENV.SUPABASE_ACCESS_TOKEN);
    expect(stdout).toContain("<redacted>");
  });
});
