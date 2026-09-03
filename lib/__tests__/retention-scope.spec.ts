/**
 * lib/__tests__/retention-scope.spec.ts
 *
 * The one thing about retention that must never quietly change: a scheduled
 * job, running unattended, must not be able to delete a clinical or audit
 * record.
 *
 * That property lives in SQL, in the explicit CASE inside run_retention_purge
 * (migration 20260903000500). A unit test cannot execute it without a database,
 * but it can read it — and reading it is enough to catch the change that would
 * actually happen: someone adds a policy row and a matching `delete from
 * treatments` branch because it seemed symmetrical with the others.
 *
 * So this parses the migration and asserts what the function is allowed to
 * delete from. It is a blunt instrument and it is aimed at exactly the right
 * thing.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

const RETENTION_MIGRATION = readdirSync(MIGRATIONS).find((f) =>
  f.endsWith("_retention_policies.sql")
);

const SQL = RETENTION_MIGRATION
  ? readFileSync(join(MIGRATIONS, RETENTION_MIGRATION), "utf8")
  : "";

/** The body of run_retention_purge, so policy INSERTs elsewhere do not count. */
function purgeFunctionBody(): string {
  const start = SQL.indexOf("create or replace function run_retention_purge");
  expect(start, "run_retention_purge not found").toBeGreaterThan(-1);
  const end = SQL.indexOf("$$;", start);
  return SQL.slice(start, end);
}

/** Every table the function issues a DELETE against. */
function deletedTables(body: string): string[] {
  return [...body.matchAll(/delete\s+from\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
}

describe("the retention job's reach", () => {
  const body = purgeFunctionBody();
  const tables = deletedTables(body);

  it("deletes from something — otherwise this whole file is vacuous", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it("deletes ONLY from operational tables", () => {
    const permitted = new Set([
      "queue_entries",
      "reminder_logs",
      "webhook_logs",
      "metric_history",
      "problem_dismissals",
      "phi_access_log",
    ]);

    for (const table of tables) {
      expect(
        permitted.has(table),
        `run_retention_purge deletes from "${table}". If that is genuinely ` +
          `intended, it needs a deliberate decision and this list needs updating ` +
          `— it is not a formality.`
      ).toBe(true);
    }
  });

  const CLINICAL_AND_AUDIT = [
    "patients",
    "appointments",
    "treatments",
    "payments",
    "follow_ups",
    "consents",
    "patient_teeth",
    "tooth_history",
    "appointment_history",
    "consent_audit",
    "treatment_history",
    "data_consent_records",
    "data_consent_notices",
    "patient_portal_links",
    "profiles",
    "clinics",
  ];

  for (const table of CLINICAL_AND_AUDIT) {
    it(`never deletes from ${table}`, () => {
      expect(tables).not.toContain(table);
    });
  }

  it("uses an explicit CASE rather than SQL built from a policy key", () => {
    // The structural reason a new policy row cannot cause a new deletion: the
    // set of reachable tables is fixed at migration time. Dynamic SQL would
    // move that decision into data, where it is not reviewed.
    expect(body).toMatch(/case\s+policy\.key/i);
    expect(body).not.toMatch(/\bexecute\s+format\b/i);
    expect(body).not.toMatch(/\bexecute\s+'/i);
  });
});

describe("the purge defaults to counting", () => {
  it("declares p_dry_run default true", () => {
    expect(SQL).toMatch(/run_retention_purge\s*\(\s*p_dry_run\s+boolean\s+default\s+true\s*\)/i);
  });

  it("is not executable from a browser session", () => {
    expect(SQL).toMatch(
      /revoke\s+all\s+on\s+function\s+run_retention_purge\(boolean\)\s+from\s+anon,\s*authenticated/i
    );
  });
});

describe("the policy table is honest about what its numbers are", () => {
  it("ships every period as legally unconfirmed", () => {
    // The default is false and no INSERT overrides it. If one ever does, that
    // is a claim about the law being made by a migration.
    expect(SQL).toMatch(/legally_confirmed\s+boolean\s+not\s+null\s+default\s+false/i);

    const insertBlock = SQL.slice(SQL.indexOf("insert into retention_policies"));
    expect(insertBlock).not.toMatch(/legally_confirmed/);
  });

  it("defines no policy for any clinical or audit table", () => {
    const insertBlock = SQL.slice(
      SQL.indexOf("insert into retention_policies"),
      SQL.indexOf("-- 3. THE PURGE")
    );

    for (const forbidden of ["'patients'", "'treatments'", "'appointments'", "'consents'"]) {
      expect(insertBlock).not.toContain(forbidden);
    }
  });
});
