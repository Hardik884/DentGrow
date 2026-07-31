/**
 * The Business Brain must not be reachable by the live pilot clinic.
 *
 * Everything else in this codebase can be fixed forward. This cannot: a dentist
 * seeing an unfinished analysis of their own practice is a trust failure, not a
 * bug report, and no later correction unsees it.
 *
 * The allow-list itself is asserted in dashboard-view.spec.ts. This file guards
 * the thing a unit test on the list cannot: that every ROUTE INTO the feature
 * actually consults it. A perfectly correct allow-list protects nothing if a new
 * page, action or endpoint forgets to ask.
 *
 * So this reads the source. It is unusual for a test, and it is the only way to
 * assert a property about code that has not been written yet.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BUSINESS_BRAIN_CLINIC_IDS, isBusinessBrainEnabled } from "@/lib/feature-flags";

const DEMO_CLINIC = "00000000-0000-0000-0000-000000000001";
const PILOT_CLINIC = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";

/** Files that reach the Business Brain and therefore must gate on the clinic. */
const GATED_ENTRY_POINTS = [
  "app/(dashboard)/dentist/business-brain/page.tsx",
  "app/(dashboard)/layout.tsx",
  "actions/business-brain.ts",
  "app/api/cron/metric-history/route.ts",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the pilot clinic can never reach the Business Brain", () => {
  it("refuses the pilot clinic and every other clinic", () => {
    expect(isBusinessBrainEnabled(PILOT_CLINIC)).toBe(false);
    expect(isBusinessBrainEnabled(CLINIC_B)).toBe(false);
    expect(isBusinessBrainEnabled(DEMO_CLINIC)).toBe(true);
  });

  it("fails CLOSED for a missing or empty clinic", () => {
    // A session that lost its clinic must see nothing, not everything.
    expect(isBusinessBrainEnabled(null)).toBe(false);
    expect(isBusinessBrainEnabled(undefined)).toBe(false);
    expect(isBusinessBrainEnabled("")).toBe(false);
  });

  it("lists exactly one clinic, and it is the demo one", () => {
    expect(BUSINESS_BRAIN_CLINIC_IDS).toEqual([DEMO_CLINIC]);
  });

  it("gates every known entry point on the clinic", () => {
    // A route that renders the Brain without asking is the whole failure mode.
    const ungated = GATED_ENTRY_POINTS.filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        !source.includes("isBusinessBrainEnabled") &&
        !source.includes("BUSINESS_BRAIN_CLINIC_IDS")
      );
    });
    expect(ungated, "entry point does not consult the clinic allow-list").toEqual([]);
  });

  it("has no OTHER route reaching the Brain without gating", () => {
    // Catches a page or action added later that imports the pipeline and forgets
    // the gate — the failure a fixed list of entry points cannot see coming.
    const offenders: string[] = [];
    for (const root of ["app", "actions"]) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        const reachesBrain =
          source.includes("runDashboardBrain") ||
          source.includes("runBusinessBrain") ||
          source.includes("persistMetricRange") ||
          source.includes("persistMetricDay");
        if (!reachesBrain) continue;
        if (
          !source.includes("isBusinessBrainEnabled") &&
          !source.includes("BUSINESS_BRAIN_CLINIC_IDS")
        ) {
          offenders.push(file);
        }
      }
    }
    expect(offenders, "reaches the Business Brain without checking the clinic").toEqual([]);
  });

  it("finds the entry points it is supposed to be checking", () => {
    // Without this the scan above could pass by matching nothing at all — the
    // failure mode of every codebase-scanning test.
    let reaching = 0;
    for (const root of ["app", "actions"]) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        if (source.includes("runDashboardBrain") || source.includes("runBusinessBrain")) {
          reaching += 1;
        }
      }
    }
    expect(reaching).toBeGreaterThan(0);
  });
});
