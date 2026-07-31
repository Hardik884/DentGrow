/**
 * Guards the money math against a silent omission.
 *
 * `treatments.cost` is the GROSS list price; what a patient owes is
 * `cost - discount_amount`. The balance helpers net that off, but they can only
 * net off a column the query actually selected — and a query that forgets it
 * gets `undefined`, which coerces to a zero discount and quietly OVER-STATES
 * what the patient owes.
 *
 * There is no way to catch that at runtime: a missing column and a genuine zero
 * discount are indistinguishable by the time the rows reach the helper. It
 * cannot be caught by types either, because the Supabase client is untyped at
 * these call sites (see the TYPING NOTE in lib/business-brain/metrics-repository).
 *
 * So it is caught here, at the query. Any treatment select that pulls `cost`
 * must also pull `discount_amount`. The failure mode this prevents is the kind a
 * clinic discovers from a patient complaint rather than from a log.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["actions", "lib", "app", "components"];
const SKIP = new Set(["node_modules", ".next", "__tests__"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `.select("...")` string in the repo, with its file. */
function selects(): { file: string; select: string }[] {
  const found: { file: string; select: string }[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.select\(\s*"([^"]*)"/g)) {
        found.push({ file, select: match[1] });
      }
    }
  }
  return found;
}

describe("treatment cost queries", () => {
  it("always select the discount alongside the cost", () => {
    const offenders = selects().filter(({ select }) => {
      // Only treatment-shaped selects: `cost` as a standalone column. Guards
      // against matching xray_cost or a substring in another table's projection.
      const columns = select.split(",").map((c) => c.trim());
      if (!columns.includes("cost")) return false;
      return !columns.includes("discount_amount");
    });

    expect(
      offenders.map((o) => `${o.file}: select("${o.select}")`),
      "a treatment query selects cost without discount_amount, which over-states what the patient owes",
    ).toEqual([]);
  });

  it("finds the queries it is supposed to be checking", () => {
    // Without this, deleting the pattern above would make the guard vacuously
    // pass — the failure mode of every codebase-scanning test.
    const withCost = selects().filter(({ select }) =>
      select.split(",").map((c) => c.trim()).includes("cost"),
    );
    expect(withCost.length).toBeGreaterThan(5);
  });
});
