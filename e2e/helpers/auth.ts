import type { Page } from "@playwright/test";

/**
 * e2e/helpers/auth.ts — the one place the e2e suite knows how to sign in.
 *
 * Before the three sign-in doors were separated, five specs each carried their
 * own copy of "goto /login, pick a clinic, fill two placeholders, click". When
 * the clinic dropdown was removed from staff sign-in, all five broke at once.
 * They share these helpers now, so a future change to the form is one edit.
 *
 * Locators are by LABEL, not placeholder: a label is the field's contract with
 * the user (and with a screen reader), whereas placeholder text is decoration
 * and gets reworded in a copy pass.
 */

/** Seeded local accounts. See supabase/seed.sql. */
export const ACCOUNTS = {
  /** Dr. Liying's dentist account — clinic: Dr. Liying's Dental Care. */
  dentist: { email: "dentist@dentgrow.test", password: "password123" },
  /** Dr. Liying's receptionist account — same clinic. */
  receptionist: { email: "receptionist@dentgrow.test", password: "password123" },
  /** Dentist of the demo clinic — clinic: My Dental Clinic. */
  demoDentist: { email: "brain@dentgrow.test", password: "password123" },
  /** An already-registered patient with a portal link. */
  patient: { email: "patient@dentgrow.test", password: "password123" },
  /** The platform admin. Locally seeded; on the hosted project it pre-exists. */
  admin: { email: "owner@dentgrow.local", password: "password123" },
} as const;

export const CLINICS = {
  liying: "Dr. Liying's Dental Care",
  demo: "My Dental Clinic",
} as const;

type Credentials = { email: string; password: string };

async function submitCredentials(page: Page, { email, password }: Credentials) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in|Continue/ }).click();
}

/** Sign in at /login and wait for the dentist or receptionist dashboard. */
export async function signInStaff(
  page: Page,
  account: Credentials = ACCOUNTS.demoDentist,
  expect: "dentist" | "receptionist" = "dentist"
) {
  await page.goto("/login");
  await submitCredentials(page, account);
  await page.waitForURL(`**/${expect}**`, { timeout: 30_000 });
}

/** Sign in at /patient/login and wait for the portal. */
export async function signInPatient(
  page: Page,
  account: Credentials = ACCOUNTS.patient
) {
  await page.goto("/patient/login");
  await submitCredentials(page, account);
  await page.waitForURL("**/portal**", { timeout: 30_000 });
}

/** Sign in at /admin/login and wait for the admin console. */
export async function signInAdmin(
  page: Page,
  account: Credentials = ACCOUNTS.admin
) {
  await page.goto("/admin/login");
  await submitCredentials(page, account);
  await page.waitForURL("**/admin", { timeout: 30_000 });
}

/**
 * Submit a sign-in form and DON'T expect it to succeed.
 * Used by the negative tests, which assert on the error banner instead.
 */
export async function attemptSignIn(
  page: Page,
  path: string,
  account: Credentials
) {
  await page.goto(path);
  await submitCredentials(page, account);
}

/** Clear the session between scenarios without going through the UI. */
export async function signOutViaCookies(page: Page) {
  await page.context().clearCookies();
}
