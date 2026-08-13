/**
 * Regression for getPatientPrescriptions (audit B9).
 *
 * getPatientPrescriptions deliberately delegates to getPatientTreatments for
 * ALL authorization and column-safety (patient resolved via
 * patient_portal_links.user_id = auth.uid(), never from client input; no
 * internal_notes, no cost splits) — that function is already relied on
 * elsewhere (TreatmentHistoryList) and unmodified here. What IS new is the
 * "only treatments with medications" filter, and that an error/failure from
 * the underlying call is passed straight through rather than swallowed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/treatments", () => ({ getPatientTreatments: vi.fn() }));

import { getPatientTreatments } from "@/actions/treatments";
import { getPatientPrescriptions } from "@/actions/prescriptions";
import type { TreatmentForPatientWithSignature } from "@/types";

const mockGetPatientTreatments = getPatientTreatments as unknown as ReturnType<typeof vi.fn>;

function treatment(
  overrides: Partial<TreatmentForPatientWithSignature>,
): TreatmentForPatientWithSignature {
  return {
    id: "t1",
    clinic_id: "c1",
    appointment_id: "a1",
    patient_id: "p1",
    treatment_type: "Consultation",
    patient_visible_notes: null,
    medications: [],
    cost: 0,
    status: "completed",
    performed_at: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    signature: null,
    ...overrides,
  } as TreatmentForPatientWithSignature;
}

beforeEach(() => vi.clearAllMocks());

describe("getPatientPrescriptions (audit B9)", () => {
  it("keeps only treatments with a non-empty medications array", async () => {
    mockGetPatientTreatments.mockResolvedValue({
      data: [
        treatment({ id: "t1", medications: [{ name: "Amoxicillin", number: 10, days: 5 }] }),
        treatment({ id: "t2", medications: [] }), // no prescription — must be excluded
        treatment({ id: "t3", medications: null as unknown as [] }), // not an array — must be excluded
      ],
      error: null,
    });

    const result = await getPatientPrescriptions();
    expect(result.error).toBeNull();
    expect(result.data?.map((t) => t.id)).toEqual(["t1"]);
  });

  it("returns an empty list, not an error, when the patient has no prescriptions", async () => {
    mockGetPatientTreatments.mockResolvedValue({
      data: [treatment({ id: "t1", medications: [] })],
      error: null,
    });

    const result = await getPatientPrescriptions();
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it("passes through an authorization failure rather than masking it", async () => {
    mockGetPatientTreatments.mockResolvedValue({
      data: null,
      error: "Portal account not linked.",
    });

    const result = await getPatientPrescriptions();
    expect(result.data).toBeNull();
    expect(result.error).toBe("Portal account not linked.");
  });

  it("relies entirely on getPatientTreatments for patient scoping — never queries a table itself", async () => {
    // If this function ever starts building its own query, this test's mock
    // (which only stubs getPatientTreatments) would no longer be sufficient
    // to prove scoping — a deliberate tripwire for that refactor.
    mockGetPatientTreatments.mockResolvedValue({ data: [], error: null });
    await getPatientPrescriptions();
    expect(mockGetPatientTreatments).toHaveBeenCalledTimes(1);
  });
});
