/**
 * lib/__tests__/subprocessors.spec.ts
 *
 * A subprocessor inventory is only worth having if it stays true, and the way
 * it stops being true is not malice — it is `npm install some-sdk` eleven
 * months from now by someone who has never read docs/subprocessors.json.
 *
 * So this cross-checks the file against the codebase in both directions:
 *
 *   - every dependency that sends data somewhere is accounted for, either as a
 *     subprocessor or as an explicit "this one does not";
 *   - every provider claimed to be absent really is absent.
 *
 * It also asserts the file stays HONEST about the things nobody has done yet.
 * An inventory that quietly starts claiming DPAs exist is worse than no
 * inventory: it would be read as evidence.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const INVENTORY = JSON.parse(
  readFileSync(join(ROOT, "docs/subprocessors.json"), "utf8")
) as {
  subprocessors: Array<{
    id: string;
    provider: string;
    receives_patient_data: boolean;
    dpa: string;
    status: string;
    evidence?: { packages?: string[] };
  }>;
  not_used: Record<string, string>;
  open_items: string[];
};

const PACKAGE_JSON = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8")
) as { dependencies: Record<string, string> };

const DEPENDENCIES = Object.keys(PACKAGE_JSON.dependencies);

describe("every outbound dependency is accounted for", () => {
  /**
   * Runtime dependencies that talk to a third party. Everything else in
   * package.json is a local library — a date formatter, a class-name joiner, a
   * chart renderer — that sends nothing anywhere.
   */
  const OUTBOUND = ["@supabase/supabase-js", "@supabase/ssr", "@google/generative-ai"];

  it("lists a subprocessor for each one", () => {
    const declared = INVENTORY.subprocessors.flatMap((s) => s.evidence?.packages ?? []);

    for (const pkg of OUTBOUND) {
      expect(DEPENDENCIES, `${pkg} is no longer a dependency`).toContain(pkg);
      expect(declared, `${pkg} sends data but names no subprocessor`).toContain(pkg);
    }
  });

  it("still has no analytics, telemetry or error-reporting SDK", () => {
    // Each of these was either removed deliberately or was never present, and
    // the inventory says so. Re-adding one without updating the file fails here.
    const FORBIDDEN = [
      "@vercel/analytics",
      "@sentry/nextjs",
      "@sentry/node",
      "posthog-js",
      "mixpanel-browser",
      "@amplitude/analytics-browser",
    ];

    for (const pkg of FORBIDDEN) {
      expect(
        DEPENDENCIES,
        `${pkg} was added. It is a new subprocessor: add it to ` +
          `docs/subprocessors.json and remove it from this list.`
      ).not.toContain(pkg);
    }
  });

  it("records that Vercel Analytics was removed rather than never present", () => {
    // The distinction matters: it DID run on clinical routes, and a future
    // reader should find that fact rather than assume it never happened.
    expect(INVENTORY.not_used["vercel-analytics"]).toMatch(/REMOVED/);
  });

  it("does not mount an analytics component in the root layout", () => {
    // The root layout wraps EVERY route, so anything mounted here runs on the
    // patient portal and every clinical screen. That is precisely how page
    // paths containing patient and treatment UUIDs reached a third party.
    //
    // The file still MENTIONS @vercel/analytics, in a comment explaining why it
    // is gone — so this asserts on the import and the JSX, not on the string.
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");

    expect(layout).not.toMatch(/^\s*import[^\n]*@vercel\/analytics/m);
    expect(layout).not.toMatch(/<Analytics\b/);
  });
});

describe("the inventory stays honest", () => {
  it("does not claim a DPA that does not exist", () => {
    // Every provider currently has none. If one is genuinely signed, this test
    // should be updated in the same change as the evidence — not before it.
    for (const entry of INVENTORY.subprocessors) {
      expect(
        ["none-on-record", "signed"],
        `${entry.provider} has an unrecognised dpa value`
      ).toContain(entry.dpa);
    }

    const claimed = INVENTORY.subprocessors.filter((s) => s.dpa === "signed");
    expect(
      claimed.map((s) => s.provider),
      "A DPA is claimed here. Confirm the agreement actually exists before " +
        "updating this assertion — this file gets read as evidence."
    ).toEqual([]);
  });

  it("keeps the open items visible", () => {
    const items = INVENTORY.open_items.join(" ");
    expect(items).toMatch(/Data Processing Agreement/i);
    expect(items).toMatch(/region/i);
    expect(items).toMatch(/training/i);
  });

  it("marks every provider that receives patient data", () => {
    const receiving = INVENTORY.subprocessors.filter((s) => s.receives_patient_data);
    // Non-vacuous: if this ever drops to zero, something has been quietly
    // reclassified rather than changed.
    expect(receiving.length).toBeGreaterThanOrEqual(4);

    for (const id of ["supabase", "vercel", "google-gemini"]) {
      const entry = INVENTORY.subprocessors.find((s) => s.id === id);
      expect(entry?.receives_patient_data, `${id} must be marked`).toBe(true);
    }
  });

  it("keeps WhatsApp marked as allow-listed rather than active", () => {
    // Widening it before communications consent is in force is the specific
    // mistake this flag exists to make visible.
    const whatsapp = INVENTORY.subprocessors.find((s) => s.id === "meta-whatsapp");
    expect(whatsapp?.status).toBe("allow-listed");
  });

  it("keeps Resend marked as not active while no credential is configured", () => {
    const resend = INVENTORY.subprocessors.find((s) => s.id === "resend");
    expect(resend?.status).toBe("not-active");
  });
});
