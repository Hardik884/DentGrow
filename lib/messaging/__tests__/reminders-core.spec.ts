/**
 * Unit specs for the pure reminder-population core.
 *
 * These cover the rules the WhatsApp reminder system hinges on — distinct
 * patients (not rows), reachable-only, already-sent flagging, and the
 * one-at-a-time cursor the focused workflow walks — with constructed input,
 * no DB.
 */

import { describe, expect, it } from "vitest";
import {
  buildReachable,
  dedupeByPatientId,
  firstUnsentIndex,
  nextUnsentIndex,
  type Candidate,
} from "@/lib/messaging/reminders-core";

/** A reachable candidate with a valid 10-digit number, filled by a trivial template. */
function candidate(id: string, phone: string | null = "9845010000"): Candidate {
  return {
    patientId: id,
    name: `Patient ${id}`,
    phone,
    subject: "Cleaning",
    reason: "No next visit booked",
    vars: { patient_name: `Patient ${id}` },
  };
}

const fillName = (vars: Record<string, string>) => `Hi ${vars.patient_name}, please call us.`;
const ids = (rs: readonly { patientId: string }[]) => rs.map((r) => r.patientId);
const remaining = (rs: readonly { alreadySent: boolean }[]) => rs.filter((r) => !r.alreadySent).length;

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

describe("buildReachable — reachable patients, flagged with sent state", () => {
  it("16 eligible patients produce 16 reachable rows, none sent yet", () => {
    const candidates = Array.from({ length: 16 }, (_, i) => candidate(String(i)));
    const out = buildReachable(candidates, new Set(), fillName);
    expect(out).toHaveLength(16);
    expect(remaining(out)).toBe(16);
    expect(out[0].message).toBe("Hi Patient 0, please call us.");
  });

  it("excludes a patient with no phone on file", () => {
    expect(buildReachable([candidate("a", null)], new Set(), fillName)).toHaveLength(0);
  });

  it("excludes a patient whose phone is too short to dial", () => {
    expect(buildReachable([candidate("a", "12345")], new Set(), fillName)).toHaveLength(0);
  });

  it("keeps reachable and drops unreachable in the same batch", () => {
    const out = buildReachable(
      [candidate("a", "9845010001"), candidate("b", null), candidate("c", "98450 10002")],
      new Set(),
      fillName,
    );
    expect(ids(out)).toEqual(["a", "c"]);
  });

  it("keeps an already-reminded patient but flags them sent (no re-offer, honest progress)", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = buildReachable(candidates, new Set(["b"]), fillName);
    expect(ids(out)).toEqual(["a", "b", "c"]); // all reachable stay
    expect(out.find((r) => r.patientId === "b")!.alreadySent).toBe(true);
    expect(remaining(out)).toBe(2); // only a and c still need contacting
  });

  // ── Consent ──────────────────────────────────────────────────────────────
  // The WhatsApp allow-list was introduced with the honest note that "there is
  // no patient-consent field in the schema yet". There is one now
  // (20260903000200), and these are what make it mean something.

  it("removes a patient who has withdrawn consent to be contacted", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = buildReachable(candidates, new Set(), fillName, new Set(["b"]));

    expect(out.map((r) => r.patientId)).toEqual(["a", "c"]);
  });

  it("removes them entirely rather than flagging them", () => {
    // An already-sent patient stays in the list so the workflow can show
    // progress. An opted-out patient must not: leaving them visible would put a
    // message one mis-click away from someone who asked not to receive it, and
    // the wa.me handoff means the send is a human action this app cannot stop.
    const out = buildReachable([candidate("a")], new Set(), fillName, new Set(["a"]));
    expect(out).toHaveLength(0);
  });

  it("keeps everyone when nobody has withdrawn", () => {
    // Non-vacuous: proves the filter is not simply emptying the list.
    const candidates = [candidate("a"), candidate("b")];
    expect(buildReachable(candidates, new Set(), fillName, new Set())).toHaveLength(2);
    expect(buildReachable(candidates, new Set(), fillName)).toHaveLength(2);
  });

  it("does not compose a message for an opted-out patient at all", () => {
    // The check runs before `fill`, so a message that could be sent by accident
    // is never built in the first place.
    let filled = 0;
    const counting = (vars: Record<string, string>) => {
      filled += 1;
      return fillName(vars);
    };

    buildReachable([candidate("a")], new Set(), counting, new Set(["a"]));
    expect(filled).toBe(0);
  });

  it("never generates a message with an unfilled {{marker}}", () => {
    const brokenFill = (vars: Record<string, string>) =>
      `Hi ${vars.patient_name}, your balance is {{amount_outstanding}}.`;
    expect(buildReachable([candidate("a")], new Set(), brokenFill)).toHaveLength(0);
  });

  it("carries subject, reason and filled message through", () => {
    const [r] = buildReachable([candidate("a")], new Set(), fillName);
    expect(r.subject).toBe("Cleaning");
    expect(r.reason).toBe("No next visit booked");
    expect(r.name).toBe("Patient a");
  });
});

describe("firstUnsentIndex / nextUnsentIndex — the one-at-a-time cursor", () => {
  const list = [{ patientId: "a" }, { patientId: "b" }, { patientId: "c" }, { patientId: "d" }];

  it("firstUnsentIndex finds the first patient still to contact", () => {
    expect(firstUnsentIndex(list, new Set(["a", "b"]))).toBe(2);
    expect(firstUnsentIndex(list, new Set())).toBe(0);
  });

  it("firstUnsentIndex returns null when everyone is done", () => {
    expect(firstUnsentIndex(list, new Set(["a", "b", "c", "d"]))).toBeNull();
  });

  it("nextUnsentIndex advances forward to the next unsent patient", () => {
    expect(nextUnsentIndex(list, new Set(["a"]), 0)).toBe(1);
    expect(nextUnsentIndex(list, new Set(["a", "b"]), 1)).toBe(2);
  });

  it("nextUnsentIndex wraps around to reach an earlier unsent patient", () => {
    // c and d done, on c(2): the only unsent ahead wraps back to a(0) or b(1).
    expect(nextUnsentIndex(list, new Set(["c", "d"]), 2)).toBe(0);
  });

  it("nextUnsentIndex returns null when all are done", () => {
    expect(nextUnsentIndex(list, new Set(["a", "b", "c", "d"]), 1)).toBeNull();
  });

  it("nextUnsentIndex stays on the current patient when it is the only one left", () => {
    // only b unsent, currently on b(1): nowhere else to go.
    expect(nextUnsentIndex(list, new Set(["a", "c", "d"]), 1)).toBe(1);
  });
});
