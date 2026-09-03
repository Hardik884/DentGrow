/**
 * lib/ai/__tests__/prompt-boundary.spec.ts
 *
 * What actually crosses the boundary to Google.
 *
 * These are not tests of the redaction helpers in isolation — they build the
 * REAL prompts, with realistic patient data, and assert on the finished string
 * that would go over the wire. That distinction matters: a helper can be
 * perfect and still be bypassed by a prompt template that interpolates the raw
 * record, and it is the template that gets edited.
 *
 * Four properties are pinned:
 *   1. the patient-summary prompt names nobody;
 *   2. no prompt can carry a secret, ever, waiver or not;
 *   3. the Business Brain prompt carries no patient-level data at all;
 *   4. the clinic's own contact details are allowed through only where the
 *      product's purpose requires them, and only by an explicit waiver.
 */

import { describe, it, expect } from "vitest";
import {
  buildPatientSummaryPrompt,
  buildInsightsPrompt,
  buildDiagnosisExplanationPrompt,
} from "../prompts";
import {
  ageBand,
  coarsenToMonth,
  findForbiddenContent,
  assertPromptIsSafe,
  PromptSafetyError,
} from "../redaction";
import { guardOutboundPrompt } from "../gemini";

// A realistic patient, of the kind that would actually be summarised.
const PATIENT = {
  name: "Rohan Sharma",
  phone: "+919812345678",
  email: "rohan.sharma@example.com",
  dateOfBirth: "1988-04-02",
  lastVisit: "2026-03-14T09:30:00.000Z",
};

function summaryPrompt() {
  return buildPatientSummaryPrompt({
    ageBand: ageBand(38),
    gender: "male",
    totalVisits: 6,
    lastVisit: coarsenToMonth(PATIENT.lastVisit),
    outstandingBalance: "₹4500.00",
    treatments: [
      {
        treatmentType: "Root Canal",
        status: "completed",
        performedAt: "2026-03-14",
        patientVisibleNotes: "Upper left molar. Crown to follow.",
      },
    ],
    followUps: [{ notes: "Crown placement", dueDate: "2026-04-20", status: "pending" }],
  });
}

describe("patient summary prompt — the patient is not named", () => {
  const prompt = summaryPrompt();

  it("contains no patient name", () => {
    expect(prompt).not.toContain(PATIENT.name);
    expect(prompt).not.toContain("Rohan");
    expect(prompt).not.toContain("Sharma");
  });

  it("contains no phone number, email or date of birth", () => {
    expect(prompt).not.toContain(PATIENT.phone);
    expect(prompt).not.toContain("9812345678");
    expect(prompt).not.toContain(PATIENT.email);
    expect(prompt).not.toContain(PATIENT.dateOfBirth);
  });

  it("passes the outbound guard with no waiver", () => {
    expect(() => guardOutboundPrompt(prompt)).not.toThrow();
    expect(findForbiddenContent(prompt)).toBeNull();
  });

  it("still carries what the summary is actually for", () => {
    // Non-vacuous: minimisation must not have emptied the prompt.
    expect(prompt).toContain("Root Canal");
    expect(prompt).toContain("₹4500.00");
    expect(prompt).toContain("Crown placement");
    expect(prompt).toContain("30-39");
  });

  it("tells the model not to invent a name", () => {
    expect(prompt.toLowerCase()).toContain("the patient");
    expect(prompt.toLowerCase()).toMatch(/never invent, guess or ask for a name/);
  });

  it("coarsens the last visit to a month rather than a day", () => {
    expect(prompt).toContain("March 2026");
    expect(prompt).not.toContain("2026-03-14T09:30");
  });
});

describe("no prompt may carry a secret", () => {
  const secrets = [
    ["a Supabase JWT", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghij"],
    ["a Google API key", "AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q"],
    ["a Supabase secret key", "sb_secret_abcdefgh12345678"],
    ["a management access token", `sbp_${"a".repeat(40)}`],
    ["a Resend key", "re_abcdefgh12345678ijkl"],
  ] as const;

  for (const [label, secret] of secrets) {
    it(`rejects ${label}`, () => {
      expect(() => assertPromptIsSafe(`Context: ${secret}`)).toThrow(PromptSafetyError);
    });

    it(`rejects ${label} even when every waivable rule is waived`, () => {
      // Waivers exist for the clinic's published contact details. They must
      // never become a route for a credential.
      expect(() =>
        assertPromptIsSafe(`Context: ${secret}`, ["phone-number", "email-address"])
      ).toThrow(PromptSafetyError);
    });
  }
});

describe("patient contact details cannot reach a prompt", () => {
  it("rejects a prompt containing a patient phone number", () => {
    expect(findForbiddenContent(`Call the patient on ${PATIENT.phone}`)).toBe(
      "phone-number"
    );
  });

  it("rejects a prompt containing an email address", () => {
    expect(findForbiddenContent(`Reach them at ${PATIENT.email}`)).toBe(
      "email-address"
    );
  });

  it("allows the CLINIC's own published number only under an explicit waiver", () => {
    const clinicPrompt = "Clinic phone: +919812345678";
    expect(() => assertPromptIsSafe(clinicPrompt)).toThrow(PromptSafetyError);
    expect(() =>
      assertPromptIsSafe(clinicPrompt, ["phone-number"])
    ).not.toThrow();
  });
});

describe("AI Insights prompt — clinic aggregates, no patient rows", () => {
  const prompt = buildInsightsPrompt({
    today: "2026-09-03",
    clinicName: "Dr. Liying's Dental Care",
    overdueFollowUpsCount: 5,
    metrics: {
      totalAppointmentsToday: 12,
      seenPatientsToday: 9,
      noShowsToday: 1,
      walkInsToday: 3,
      revenueToday: 18400,
      revenueLastWeek: 92000,
      noShowsThisWeek: 4,
      noShowsLastWeek: 2,
      walkInsThisWeek: 11,
      walkInsLastWeek: 9,
      busiestHourThisWeek: null,
    },
  });

  it("passes the guard with no waiver", () => {
    expect(() => guardOutboundPrompt(prompt)).not.toThrow();
  });

  it("carries counts and sums rather than records", () => {
    expect(prompt).toContain("totalAppointmentsToday");
    expect(prompt).not.toMatch(/patient_id/i);
    expect(prompt).not.toMatch(/\bname\b\s*[:=]/i);
  });
});

describe("Business Brain explanation prompt — no patient-level data", () => {
  // The facts the deterministic engines produce. Aggregate by construction.
  const prompt = buildDiagnosisExplanationPrompt({
    title: "Chair time is going unused",
    summary: "Booked hours fell below the configured threshold for three weeks.",
    facts: [
      "Chair utilisation was 41% against a 65% threshold",
      "Booked appointment volume was 38 against a 60 threshold",
    ],
    supported: ["Demand is below capacity"],
    ruledOut: ["Capacity was reduced"],
    undetermined: ["Whether marketing reach changed"],
    persistence: "three consecutive weeks",
  });

  it("passes the guard with no waiver", () => {
    expect(() => guardOutboundPrompt(prompt)).not.toThrow();
  });

  it("contains no patient identifier of any kind", () => {
    for (const forbidden of ["patient_id", "Rohan", "@", "+91"]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("forbids the model from inventing figures or giving advice", () => {
    expect(prompt).toMatch(/Do not state any number/i);
    expect(prompt).toMatch(/Do not tell the dentist what to do/i);
  });
});

describe("age banding", () => {
  it("never returns an exact age", () => {
    expect(ageBand(38)).toBe("30-39");
    expect(ageBand(7)).toBe("under 13");
    expect(ageBand(84)).toBe("80 or older");
    expect(ageBand(null)).toBe("unknown");
    expect(ageBand(undefined)).toBe("unknown");
    expect(ageBand(NaN)).toBe("unknown");
  });
});

describe("date coarsening", () => {
  it("keeps the month and drops the day", () => {
    expect(coarsenToMonth("2026-03-14T09:30:00.000Z")).toBe("March 2026");
    expect(coarsenToMonth(null)).toBeNull();
    expect(coarsenToMonth("not a date")).toBeNull();
  });
});
