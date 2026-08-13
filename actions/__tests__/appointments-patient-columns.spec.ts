/**
 * Regression for getAppointments' (plural) patient branch (audit B10).
 *
 * The singular getAppointment already used the patient-safe column allow-list
 * (audit A1/A2); this list endpoint did not — it selected "*" for every role,
 * including patient, which is exactly how a portal appointments LIST could
 * fetch staff-internal columns (notes, chief_complaints, medical_history,
 * oral_findings, provisional_diagnosis) that the single-appointment page
 * already excluded. A lightweight chainable mock (no database) is enough to
 * prove the SELECT STRING the patient branch sends — the property the
 * existing patient-safe-columns.spec.ts (which only checks the constants in
 * isolation) cannot catch on its own.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));

import { resolveSession } from "@/lib/auth/session";
import { getAppointments } from "@/actions/appointments";
import {
  CLINICAL_APPOINTMENT_COLUMNS,
  PATIENT_APPOINTMENT_SELECT,
} from "@/lib/appointments/patient-safe-columns";

const CLINIC = "clinic-1";
const PATIENT_USER_ID = "user-patient-1";
const PATIENT_ID = "patient-1";

/** Records every `.select()` call and every `.eq()`/`.in()` filter per table. */
function makeDb(rows: Record<string, unknown>[]) {
  const calls: { table: string; select: string; eq: [string, unknown][]; in: [string, unknown[]][] } = {
    table: "",
    select: "",
    eq: [],
    in: [],
  };

  function builder(table: string) {
    const state = { table, select: "", eq: [] as [string, unknown][], in: [] as [string, unknown[]][] };
    const api: Record<string, unknown> = {
      select: (cols: string) => {
        state.select = cols;
        if (table === "appointments") Object.assign(calls, state);
        return api;
      },
      eq: (col: string, val: unknown) => {
        state.eq.push([col, val]);
        if (table === "appointments") calls.eq = state.eq;
        return api;
      },
      in: (col: string, vals: unknown[]) => {
        state.in.push([col, vals]);
        if (table === "appointments") calls.in = state.in;
        return api;
      },
      is: () => api,
      order: () => api,
      range: (): Promise<{ data: unknown[]; error: null; count: number }> =>
        Promise.resolve({ data: rows, error: null, count: rows.length }),
      single: () =>
        table === "patient_portal_links"
          ? Promise.resolve({ data: { patient_id: PATIENT_ID }, error: null })
          : Promise.resolve({ data: null, error: null }),
    };
    return api;
  }

  return { db: { from: (table: string) => builder(table) }, calls };
}

function asPatient(rows: Record<string, unknown>[] = []) {
  const { db, calls } = makeDb(rows);
  (resolveSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    db,
    profile: { id: PATIENT_USER_ID, clinic_id: CLINIC, role: "patient" },
  });
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("getAppointments patient branch — column safety (audit B10)", () => {
  it("selects the patient-safe column allow-list, not '*'", async () => {
    const calls = asPatient();
    await getAppointments({ status: "scheduled" });
    expect(calls.select).toBe(PATIENT_APPOINTMENT_SELECT);
    expect(calls.select).not.toBe("*, patient:patients(id, name, phone, date_of_birth, gender)");
  });

  it("never includes a clinical column in the select string", async () => {
    const calls = asPatient();
    await getAppointments({});
    for (const clinical of CLINICAL_APPOINTMENT_COLUMNS) {
      expect(calls.select).not.toMatch(new RegExp(`\\b${clinical}\\b`));
    }
  });

  it("scopes the query to the portal-resolved patient_id", async () => {
    const calls = asPatient();
    await getAppointments({});
    expect(calls.eq).toContainEqual(["patient_id", PATIENT_ID]);
  });
});

describe("getAppointments — array status filter (audit B10 past-appointments)", () => {
  it("uses .in() for an array of statuses (past appointments)", async () => {
    const calls = asPatient();
    await getAppointments({ status: ["completed", "cancelled", "no_show"] });
    expect(calls.in).toContainEqual(["status", ["completed", "cancelled", "no_show"]]);
  });

  it("still uses .eq() for a single status (upcoming appointments)", async () => {
    const calls = asPatient();
    await getAppointments({ status: "scheduled" });
    expect(calls.eq).toContainEqual(["status", "scheduled"]);
    expect(calls.in).toHaveLength(0);
  });
});
