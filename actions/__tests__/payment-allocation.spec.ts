/**
 * Regression for getPatientTreatmentCollections (audit B8).
 *
 * Worked example from the approved definition: Treatment A = ₹10,000 (older),
 * Treatment B = ₹5,000 (newer), one ₹12,000 payment pooled across them →
 * A fully settled (₹0 remaining), B partially settled (₹3,000 remaining).
 * Uses a lightweight mock DB (no database) since the function only reads two
 * tables and pipes them through the already-tested allocateCollectionsToTreatments.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));

import { resolveSession } from "@/lib/auth/session";
import { getPatientTreatmentCollections } from "@/actions/payments";

const CLINIC = "clinic-1";
type Row = Record<string, unknown>;

function makeDb(tables: { treatments: Row[]; payments: Row[] }) {
  function builder(table: "treatments" | "payments") {
    const eq: Record<string, unknown> = {};
    const inFilters: [string, unknown[]][] = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        eq[col] = val;
        return api;
      },
      is: () => api,
      in: (col: string, vals: unknown[]) => {
        inFilters.push([col, vals]);
        return api;
      },
      then: (onResolve: (v: unknown) => unknown) => {
        let rows = [...tables[table]];
        for (const [col, val] of Object.entries(eq)) rows = rows.filter((r) => r[col] === val);
        for (const [col, vals] of inFilters) rows = rows.filter((r) => vals.includes(r[col]));
        return Promise.resolve({ data: rows, error: null }).then(onResolve);
      },
    };
    return api;
  }
  return { from: (table: "treatments" | "payments") => builder(table) };
}

function asStaff(tables: { treatments: Row[]; payments: Row[] }) {
  (resolveSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    db: makeDb(tables),
    profile: { id: "u1", clinic_id: CLINIC, role: "dentist" },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("getPatientTreatmentCollections (audit B8)", () => {
  it("pools a single payment oldest-treatment-first — matches the approved worked example", async () => {
    asStaff({
      treatments: [
        // A is older (earlier performed_at) — settles first.
        { id: "A", cost: 10000, status: "completed", patient_id: "p1", clinic_id: CLINIC, performed_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z" },
        { id: "B", cost: 5000, status: "completed", patient_id: "p1", clinic_id: CLINIC, performed_at: "2026-08-05T00:00:00Z", created_at: "2026-08-05T00:00:00Z" },
      ],
      payments: [
        { amount: 12000, treatment_id: null, patient_id: "p1", clinic_id: CLINIC },
      ],
    });

    const result = await getPatientTreatmentCollections("p1");
    expect(result.error).toBeNull();
    // A fully settled (10,000 of 10,000); B partially (2,000 of 5,000) → B
    // remaining = 5000 - 2000 = 3000, matching the approved example exactly.
    expect(result.data?.["A"]).toBe(10000);
    expect(result.data?.["B"]).toBe(2000);
  });

  it("excludes non-billable (planned/cancelled) treatments from allocation", async () => {
    asStaff({
      treatments: [
        { id: "A", cost: 1000, status: "planned", patient_id: "p1", clinic_id: CLINIC, created_at: "2026-08-01T00:00:00Z" },
      ],
      payments: [{ amount: 1000, treatment_id: "A", patient_id: "p1", clinic_id: CLINIC }],
    });

    const result = await getPatientTreatmentCollections("p1");
    // The treatment is planned — never even fetched (query filters
    // status in completed/in_progress) — so no allocation entry exists for it.
    expect(result.data?.["A"]).toBeUndefined();
  });

  it("never pools one patient's payment against another patient's treatment", async () => {
    asStaff({
      treatments: [
        { id: "A", cost: 1000, status: "completed", patient_id: "p1", clinic_id: CLINIC, created_at: "2026-08-01T00:00:00Z" },
      ],
      // A payment recorded for a DIFFERENT patient must never be fetched when
      // asking about p1 — the query itself filters .eq("patient_id", "p1").
      payments: [{ amount: 1000, treatment_id: null, patient_id: "p2", clinic_id: CLINIC }],
    });

    const result = await getPatientTreatmentCollections("p1");
    expect(result.data?.["A"]).toBe(0);
  });

  it("returns an empty allocation for a patient with no billable treatments", async () => {
    asStaff({ treatments: [], payments: [] });
    const result = await getPatientTreatmentCollections("p1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual({});
  });

  it("is forbidden for the patient role", async () => {
    (resolveSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: makeDb({ treatments: [], payments: [] }),
      profile: { id: "u1", clinic_id: CLINIC, role: "patient" },
    });
    const result = await getPatientTreatmentCollections("p1");
    expect(result.data).toBeNull();
    expect(result.error).toBe("Forbidden");
  });
});
