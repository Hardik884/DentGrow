/**
 * Regression for getPrescriptions (audit A10/A11), with a lightweight chainable
 * mock in place of Supabase so it runs without a database.
 *
 * A10 — the dentist filter must be applied BEFORE pagination (at the DB, via the
 *        dentist's appointment IDs), so counts are right and no matching record
 *        is hidden on a later page.
 * A11 — the full result set must be read in chunks, not silently truncated at
 *        PostgREST's ~1000-row default, so a large clinic's count and list stay
 *        exact.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));

import { resolveSession } from "@/lib/auth/session";
import { getPrescriptions } from "@/actions/prescriptions";

const CLINIC = "clinic-1";
const D1 = "dentist-1";
const D2 = "dentist-2";

type Row = Record<string, unknown>;

interface Dataset {
  appointments: Row[];
  treatments: Row[];
  patients: Row[];
  profiles: Row[];
  clinic_settings: Row | null;
}

/** A minimal chainable, thenable query builder over an in-memory dataset. */
function makeDb(data: Dataset) {
  function builder(table: string) {
    const eq: Record<string, unknown> = {};
    const inn: Record<string, unknown[]> = {};
    let range: [number, number] | null = null;
    let single = false;

    const resolve = () => {
      const raw = (data as unknown as Record<string, Row[] | Row | null>)[table];
      let rows: Row[] = Array.isArray(raw) ? [...raw] : raw ? [raw] : [];
      for (const [col, val] of Object.entries(eq)) {
        rows = rows.filter((r) => r[col] === val);
      }
      for (const [col, vals] of Object.entries(inn)) {
        rows = rows.filter((r) => vals.includes(r[col]));
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };

    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        eq[col] = val;
        return api;
      },
      is: () => api,
      ilike: () => api,
      in: (col: string, vals: unknown[]) => {
        inn[col] = vals;
        return api;
      },
      gte: () => api,
      lte: () => api,
      order: () => api,
      range: (a: number, b: number) => {
        range = [a, b];
        return api;
      },
      maybeSingle: () => {
        single = true;
        return api;
      },
      then: (onResolve: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onResolve),
    };
    return api;
  }

  return { from: (table: string) => builder(table) };
}

function asReceptionist(data: Dataset) {
  (resolveSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    db: makeDb(data),
    profile: { id: "user-1", clinic_id: CLINIC, role: "receptionist" },
  });
}

const MEDS = [{ name: "Amoxicillin", number: 10, days: 5 }];

beforeEach(() => vi.clearAllMocks());

describe("getPrescriptions dentist filter (audit A10)", () => {
  // One patient, two appointments (one per dentist); three prescriptions each.
  const dataset: Dataset = {
    appointments: [
      { id: "apt-d1", dentist_id: D1, clinic_id: CLINIC },
      { id: "apt-d2", dentist_id: D2, clinic_id: CLINIC },
    ],
    patients: [{ id: "p1", name: "Asha", phone: "+919000000001", clinic_id: CLINIC }],
    profiles: [
      { id: D1, full_name: "Dr One", signature_url: null },
      { id: D2, full_name: "Dr Two", signature_url: null },
    ],
    clinic_settings: { registration_number: "REG-123", clinic_id: CLINIC },
    treatments: [
      // interleaved so D2's rows would land "first" in an unfiltered page
      { id: "t1", patient_id: "p1", appointment_id: "apt-d2", treatment_type: "X", status: "completed", clinic_id: CLINIC, medications: MEDS, performed_at: "2026-08-01T10:00:00Z", created_at: "2026-08-01T10:00:00Z", patient_visible_notes: null },
      { id: "t2", patient_id: "p1", appointment_id: "apt-d1", treatment_type: "X", status: "completed", clinic_id: CLINIC, medications: MEDS, performed_at: "2026-08-02T10:00:00Z", created_at: "2026-08-02T10:00:00Z", patient_visible_notes: null },
      { id: "t3", patient_id: "p1", appointment_id: "apt-d2", treatment_type: "X", status: "completed", clinic_id: CLINIC, medications: MEDS, performed_at: "2026-08-03T10:00:00Z", created_at: "2026-08-03T10:00:00Z", patient_visible_notes: null },
      { id: "t4", patient_id: "p1", appointment_id: "apt-d1", treatment_type: "X", status: "completed", clinic_id: CLINIC, medications: MEDS, performed_at: "2026-08-04T10:00:00Z", created_at: "2026-08-04T10:00:00Z", patient_visible_notes: null },
      { id: "t5", patient_id: "p1", appointment_id: "apt-d2", treatment_type: "X", status: "completed", clinic_id: CLINIC, medications: MEDS, performed_at: "2026-08-05T10:00:00Z", created_at: "2026-08-05T10:00:00Z", patient_visible_notes: null },
      { id: "t6", patient_id: "p1", appointment_id: "apt-d1", treatment_type: "X", status: "completed", clinic_id: CLINIC, medications: MEDS, performed_at: "2026-08-06T10:00:00Z", created_at: "2026-08-06T10:00:00Z", patient_visible_notes: null },
    ],
  };

  it("returns only the selected dentist's prescriptions, with an accurate count", async () => {
    asReceptionist(dataset);
    const res = await getPrescriptions({ dentistId: D1, page: 1, limit: 20 });
    expect(res.error).toBeNull();
    expect(res.data?.total).toBe(3); // only D1's three, not all six
    expect(res.data?.prescriptions).toHaveLength(3);
    expect(res.data?.prescriptions.every((p) => p.dentist_id === D1)).toBe(true);
  });

  it("returns all prescriptions when no dentist is selected", async () => {
    asReceptionist(dataset);
    const res = await getPrescriptions({ page: 1, limit: 20 });
    expect(res.data?.total).toBe(6);
  });

  it("returns none for a dentist with no appointments", async () => {
    asReceptionist(dataset);
    const res = await getPrescriptions({ dentistId: "dentist-nobody", page: 1, limit: 20 });
    expect(res.data?.total).toBe(0);
    expect(res.data?.prescriptions).toHaveLength(0);
  });
});

describe("getPrescriptions large result set (audit A11)", () => {
  it("reads past the ~1000-row cap in chunks and counts them all", async () => {
    const treatments: Row[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `t${i}`,
      patient_id: "p1",
      appointment_id: "apt-d1",
      treatment_type: "X",
      status: "completed",
      clinic_id: CLINIC,
      medications: MEDS,
      performed_at: "2026-08-01T10:00:00Z",
      created_at: "2026-08-01T10:00:00Z",
      patient_visible_notes: null,
    }));

    asReceptionist({
      appointments: [{ id: "apt-d1", dentist_id: D1, clinic_id: CLINIC }],
      patients: [{ id: "p1", name: "Asha", phone: null, clinic_id: CLINIC }],
      profiles: [{ id: D1, full_name: "Dr One", signature_url: null }],
      clinic_settings: { registration_number: "REG-123", clinic_id: CLINIC },
      treatments,
    });

    const res = await getPrescriptions({ page: 1, limit: 20 });
    expect(res.error).toBeNull();
    expect(res.data?.total).toBe(1500); // NOT truncated at 1000
    expect(res.data?.prescriptions).toHaveLength(20); // page 1
  });
});
