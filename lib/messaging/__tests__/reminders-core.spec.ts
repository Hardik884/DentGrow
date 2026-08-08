/**
 * Unit specs for the pure reminder-population core.
 *
 * These cover the rules the WhatsApp reminder system hinges on — distinct
 * patients (not rows), reachable-only, no duplicate after a send, and the
 * count-equals-list guarantee — with constructed input, no DB.
 */

import { describe, expect, it } from "vitest";
import {
  buildActionable,
  dedupeByPatientId,
  type Candidate,
} from "@/lib/messaging/reminders-core";

/** A reachable candidate with a valid 10-digit number, filled by a trivial template. */
function candidate(id: string, phone: string | null = "9845010000"): Candidate {
  return {
    patientId: id,
    name: `Patient ${id}`,
    phone,
    reason: "Planned: Cleaning",
    vars: { patient_name: `Patient ${id}` },
  };
}

const fillName = (vars: Record<string, string>) => `Hi ${vars.patient_name}, please call us.`;

describe("dedupeByPatientId — one row per patient", () => {
  it("collapses several rows for the same patient to one, keeping the first", () => {
    const rows = [
      { pid: "a", note: "first" },
      { pid: "a", note: "second" },
      { pid: "b", note: "third" },
    ];
    const out = dedupeByPatientId(rows, (r) => r.pid);
    expect(out.map((r) => r.pid)).toEqual(["a", "b"]);
    expect(out[0].note).toBe("first"); // order preserved, oldest-first kept
  });

  it("drops rows with no patient id", () => {
    const rows = [{ pid: null }, { pid: "x" }, { pid: undefined }];
    expect(dedupeByPatientId(rows, (r) => r.pid as string | null)).toHaveLength(1);
  });
});

describe("buildActionable — reachable, un-reminded patients only", () => {
  it("16 eligible patients produce 16 reminders (count equals list, no hidden cap)", () => {
    const candidates = Array.from({ length: 16 }, (_, i) => candidate(String(i)));
    const out = buildActionable(candidates, new Set(), fillName);
    expect(out).toHaveLength(16);
    expect(out[0].message).toBe("Hi Patient 0, please call us.");
  });

  it("excludes a patient with no phone on file", () => {
    const out = buildActionable([candidate("a", null)], new Set(), fillName);
    expect(out).toHaveLength(0);
  });

  it("excludes a patient whose phone is too short to dial", () => {
    const out = buildActionable([candidate("a", "12345")], new Set(), fillName);
    expect(out).toHaveLength(0);
  });

  it("keeps reachable and drops unreachable in the same batch", () => {
    const out = buildActionable(
      [candidate("a", "9845010001"), candidate("b", null), candidate("c", "98450 10002")],
      new Set(),
      fillName,
    );
    expect(out.map((r) => r.patientId)).toEqual(["a", "c"]);
  });

  it("excludes a patient already reminded for this kind (no duplicate on refresh)", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = buildActionable(candidates, new Set(["b"]), fillName);
    expect(out.map((r) => r.patientId)).toEqual(["a", "c"]);
  });

  it("never generates a message with an unfilled {{marker}}", () => {
    // A template referencing a var the candidate does not supply.
    const brokenFill = (vars: Record<string, string>) =>
      `Hi ${vars.patient_name}, your balance is {{amount_outstanding}}.`;
    const out = buildActionable([candidate("a")], new Set(), brokenFill);
    expect(out).toHaveLength(0);
  });

  it("carries the reason and filled message through unchanged", () => {
    const [r] = buildActionable([candidate("a")], new Set(), fillName);
    expect(r.reason).toBe("Planned: Cleaning");
    expect(r.name).toBe("Patient a");
  });
});
