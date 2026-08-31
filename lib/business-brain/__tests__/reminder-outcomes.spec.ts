/**
 * Outcome look-back on sent reminders.
 *
 * This is the first thing in the whole system that asks whether acting on a
 * finding worked, so the two ways it could quietly lie are the tests that matter
 * most:
 *
 *   1. Counting a reminder sent yesterday as a failure, which would drag the
 *      numbers down hardest immediately after a big send — exactly when a
 *      dentist is most likely to look.
 *   2. Counting reminder rows instead of patients, which would turn one
 *      repeatedly-reminded patient into several failures, or several successes.
 */

import { describe, expect, it } from "vitest";

import { computeReminderOutcomes, RESPONSE_WINDOW_DAYS } from "../reminder-outcomes";

const NOW = "2026-08-31T12:00:00.000Z";

/** ISO timestamp N days before NOW. */
function daysAgo(n: number): string {
  return new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();
}

const noEvents = new Map<string, readonly string[]>();

function outcomes(
  reminders: readonly { patientId: string; kind: string; sentAt: string }[],
  opts: {
    payments?: Map<string, readonly string[]>;
    bookings?: Map<string, readonly string[]>;
  } = {},
) {
  return computeReminderOutcomes({
    reminders,
    paymentsByPatient: opts.payments ?? noEvents,
    bookingsByPatient: opts.bookings ?? noEvents,
    now: NOW,
  });
}

describe("only reminders that have had their full window are judged", () => {
  it("excludes a reminder sent too recently, rather than counting it as a miss", () => {
    // Sent 3 days ago against a 14-day window: nobody has had time to respond.
    const result = outcomes([
      { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(3) },
    ]);
    // Not "1 reminded, 0 acted" — absent entirely.
    expect(result).toEqual([]);
  });

  it("includes one sent exactly at the window boundary", () => {
    const result = outcomes([
      { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(RESPONSE_WINDOW_DAYS) },
    ]);
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 0 }]);
  });

  it("does not let a recent send deflate an older cohort's numbers", () => {
    const result = outcomes(
      [
        { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(40) },
        // Five patients reminded yesterday — a big send that has not landed yet.
        ...["B", "C", "D", "E", "F"].map((patientId) => ({
          patientId,
          kind: "payment_reminder",
          sentAt: daysAgo(1),
        })),
      ],
      { payments: new Map([["A", [daysAgo(35)]]]) },
    );
    // 1 of 1, not 1 of 6.
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 1 }]);
  });
});

describe("patients are counted, not reminder rows", () => {
  it("treats one patient reminded three times as one patient", () => {
    const result = outcomes([
      { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(60) },
      { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(40) },
      { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(20) },
    ]);
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 0 }]);
  });

  it("judges from the earliest reminder, so later nudges cannot forgive earlier ones", () => {
    // Reminded 60 days ago and again 20 days ago; paid 18 days ago. Measured from
    // the EARLIEST reminder, the payment falls outside its 14-day window, so this
    // patient has not responded to the reminder being judged.
    const result = outcomes(
      [
        { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(60) },
        { patientId: "A", kind: "payment_reminder", sentAt: daysAgo(20) },
      ],
      { payments: new Map([["A", [daysAgo(18)]]]) },
    );
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 0 }]);
  });
});

describe("what counts as the patient acting", () => {
  it("counts a payment after a payment reminder", () => {
    const result = outcomes(
      [{ patientId: "A", kind: "payment_reminder", sentAt: daysAgo(30) }],
      { payments: new Map([["A", [daysAgo(25)]]]) },
    );
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 1 }]);
  });

  it("counts a booking after a recall invitation", () => {
    const result = outcomes(
      [{ patientId: "A", kind: "recall_invitation", sentAt: daysAgo(30) }],
      { bookings: new Map([["A", [daysAgo(28)]]]) },
    );
    expect(result).toEqual([{ kind: "recall_invitation", reminded: 1, acted: 1 }]);
  });

  it("ignores an event that predates the reminder", () => {
    // Paid before being reminded — the reminder plainly did not produce it.
    const result = outcomes(
      [{ patientId: "A", kind: "payment_reminder", sentAt: daysAgo(30) }],
      { payments: new Map([["A", [daysAgo(45)]]]) },
    );
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 0 }]);
  });

  it("does not credit the wrong event type to the wrong reminder", () => {
    // A booking cannot answer a payment reminder.
    const result = outcomes(
      [{ patientId: "A", kind: "payment_reminder", sentAt: daysAgo(30) }],
      { bookings: new Map([["A", [daysAgo(25)]]]) },
    );
    expect(result).toEqual([{ kind: "payment_reminder", reminded: 1, acted: 0 }]);
  });

  it("omits reminder kinds whose outcome this schema cannot observe", () => {
    // An appointment confirmation is answered by the patient turning up, and
    // attendance is never linked back to the message. Reporting 0% would be a
    // claim about the reminder rather than about the missing measurement.
    const result = outcomes([
      { patientId: "A", kind: "appointment_confirmation", sentAt: daysAgo(30) },
      { patientId: "B", kind: "standby_slot_offer", sentAt: daysAgo(30) },
    ]);
    expect(result).toEqual([]);
  });
});

describe("shape", () => {
  it("reports each kind separately, in a stable order", () => {
    const result = outcomes([
      { patientId: "A", kind: "recall_invitation", sentAt: daysAgo(30) },
      { patientId: "B", kind: "payment_reminder", sentAt: daysAgo(30) },
      { patientId: "C", kind: "treatment_plan_follow_up", sentAt: daysAgo(30) },
    ]);
    expect(result.map((r) => r.kind)).toEqual([
      "payment_reminder",
      "recall_invitation",
      "treatment_plan_follow_up",
    ]);
  });

  it("survives an unparseable timestamp without throwing", () => {
    const result = outcomes([{ patientId: "A", kind: "payment_reminder", sentAt: "not-a-date" }]);
    expect(result).toEqual([]);
  });
});
