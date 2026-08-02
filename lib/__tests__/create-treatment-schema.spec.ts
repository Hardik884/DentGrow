/**
 * Regression guard for "Add Treatment" from the Patient tab.
 *
 * Root cause: TreatmentFormDialog was invoked with only `patientId` (no
 * `appointmentId`), so TreatmentForm rendered a hidden `appointment_id` input
 * defaulting to "". CreateTreatmentSchema.appointment_id is a required uuid,
 * so every submission from that entry point failed validation silently — the
 * user saw a generic error with no way to act on it.
 *
 * The UI fix (an appointment picker, shown only when no appointmentId prop is
 * supplied) is exercised by hand in the browser; what's tested here, cheaply
 * and permanently, is the two things that made the bug possible: that an
 * empty appointment_id is rejected with a message a user could actually act
 * on, and that a real selection still validates.
 */

import { describe, expect, it } from "vitest";

import { CreateTreatmentSchema } from "@/types";

const BASE = {
  patient_id: "9fd00000-0000-4000-8000-000000000021",
  treatment_type: "Cleaning",
  cost: 500,
};

describe("CreateTreatmentSchema.appointment_id", () => {
  it("rejects an empty appointment_id with an actionable message", () => {
    const result = CreateTreatmentSchema.safeParse({ ...BASE, appointment_id: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe("Please select an appointment");
    }
  });

  it("accepts a real appointment_id", () => {
    const result = CreateTreatmentSchema.safeParse({
      ...BASE,
      appointment_id: "9fd00000-0000-4000-8000-000000000031",
    });
    expect(result.success).toBe(true);
  });
});
