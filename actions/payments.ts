"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { getTodayInTimezone } from "@/lib/utils";
import { computeOutstandingBalance, isBillableTreatment } from "@/lib/billing/balance";
import {
  RecordPaymentSchema,
  type ActionResult,
  type Payment,
} from "@/types";

/**
 * Payment Server Actions
 *
 * Security rules (enforced in every action):
 * - clinic_id is ALWAYS sourced from the server session.
 * - Outstanding balance is ALWAYS computed server-side via
 *   lib/billing/balance.ts (single shared implementation).
 *   Formula: SUM(billable treatments.cost WHERE deleted_at IS NULL)
 *            - SUM(payments.amount WHERE deleted_at IS NULL)
 *   Billable = status in ('completed','in_progress'). Cancelled and planned
 *   treatments never contribute.
 * - Only staff (dentist + receptionist) can record payments.
 * - Patients can read their own payment history via portal link.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
};

async function resolveSession(): Promise<{
  db: DbClient;
  profile: ResolvedProfile | null;
}> {
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
}

// =============================================================================
// recordPayment — staff only (dentist + receptionist)
// =============================================================================

export async function recordPayment(
  input: unknown
): Promise<ActionResult<Payment>> {
  try {
    const parsed = RecordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden: patients cannot record payments." };
    }

    // Verify patient belongs to clinic
    const { data: patient } = await db
      .from("patients")
      .select("id")
      .eq("id", parsed.data.patient_id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (!patient) {
      return { data: null, error: "Patient not found." };
    }

    const { data, error } = await db
      .from("payments")
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: parsed.data.patient_id,
        appointment_id: parsed.data.appointment_id ?? null,
        amount: parsed.data.amount,
        method: parsed.data.method,
        payment_date: parsed.data.payment_date,
        notes: parsed.data.notes ?? null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[recordPayment]", error);
      return { data: null, error: "Failed to record payment." };
    }

    revalidatePath(`/dentist/patients/${parsed.data.patient_id}`);
    revalidatePath("/dentist/payments");
    revalidatePath("/receptionist/payments");

    return { data: data as Payment, error: null };
  } catch (err) {
    console.error("[recordPayment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPaymentsForAppointment — payments linked to a specific appointment (staff)
// =============================================================================

export async function getPaymentsForAppointment(
  appointmentId: string
): Promise<ActionResult<Payment[]>> {
  try {
    if (!appointmentId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") return { data: null, error: "Forbidden" };

    const { data, error } = await db
      .from("payments")
      .select("*")
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });

    if (error) {
      console.error("[getPaymentsForAppointment]", error);
      return { data: null, error: "Failed to fetch payments." };
    }

    return { data: (data ?? []) as Payment[], error: null };
  } catch (err) {
    console.error("[getPaymentsForAppointment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientPayments — full ledger for a patient (staff path)
// =============================================================================

export async function getPatientPayments(
  patientId: string
): Promise<ActionResult<Payment[]>> {
  try {
    if (!patientId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    // Staff path: verify patient belongs to clinic
    if (profile.role !== "patient") {
      const { data, error } = await db
        .from("payments")
        .select("*")
        .eq("patient_id", patientId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .order("payment_date", { ascending: false });

      if (error) {
        console.error("[getPatientPayments]", error);
        return { data: null, error: "Failed to fetch payments." };
      }

      return { data: (data ?? []) as Payment[], error: null };
    }

    // Patient portal path: resolve via portal link
    const supabase = await createServerClient();
    const portalDb: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Unauthorized" };

    const { data: link } = await portalDb
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    const { data, error } = await portalDb
      .from("payments")
      .select("*")
      .eq("patient_id", link.patient_id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });

    if (error) {
      console.error("[getPatientPayments portal]", error);
      return { data: null, error: "Failed to fetch payments." };
    }

    return { data: (data ?? []) as Payment[], error: null };
  } catch (err) {
    console.error("[getPatientPayments] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPortalPayments — patient portal path (uses portal link resolution)
// =============================================================================

export async function getPortalPayments(): Promise<ActionResult<Payment[]>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Unauthorized" };

    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    const { data, error } = await db
      .from("payments")
      .select("*")
      .eq("patient_id", link.patient_id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });

    if (error) {
      console.error("[getPortalPayments]", error);
      return { data: null, error: "Failed to fetch payments." };
    }

    return { data: (data ?? []) as Payment[], error: null };
  } catch (err) {
    console.error("[getPortalPayments] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getOutstandingBalance — computed server-side, never trusted from client
// =============================================================================

export async function getOutstandingBalance(
  patientId: string
): Promise<ActionResult<number>> {
  try {
    // Portal path: resolve patient from link when patientId is empty
    let resolvedPatientId = patientId;
    let clinicId: string | null = null;

    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Unauthorized" };

    // Resolve role
    const { data: profileData } = await db
      .from("profiles")
      .select("id, clinic_id, role")
      .eq("id", user.id)
      .single();

    if (profileData) {
      clinicId = profileData.clinic_id;
    } else {
      // Portal user — resolve via link
      const { data: link } = await db
        .from("patient_portal_links")
        .select("patient_id, patients(clinic_id)")
        .eq("user_id", user.id)
        .single();

      if (!link?.patient_id) {
        return { data: 0, error: null };
      }
      resolvedPatientId = link.patient_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clinicId = (link as any).patients?.clinic_id ?? null;
    }

    if (!resolvedPatientId) return { data: 0, error: null };

    let treatmentQuery = db
      .from("treatments")
      .select("cost, status")
      .eq("patient_id", resolvedPatientId)
      .is("deleted_at", null);

    let paymentQuery = db
      .from("payments")
      .select("amount")
      .eq("patient_id", resolvedPatientId)
      .is("deleted_at", null);

    if (clinicId) {
      treatmentQuery = treatmentQuery.eq("clinic_id", clinicId);
      paymentQuery = paymentQuery.eq("clinic_id", clinicId);
    }

    const [{ data: treatmentRows }, { data: paymentRows }] = await Promise.all([
      treatmentQuery,
      paymentQuery,
    ]);

    return {
      data: computeOutstandingBalance(
        (treatmentRows ?? []) as { cost: number; status: string }[],
        (paymentRows ?? []) as { amount: number }[]
      ),
      error: null,
    };
  } catch (err) {
    console.error("[getOutstandingBalance] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPortalOutstandingBalance — portal path (no patientId needed)
// =============================================================================

export async function getPortalOutstandingBalance(): Promise<ActionResult<number>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Unauthorized" };

    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id, patients(clinic_id)")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) return { data: 0, error: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clinicId = (link as any).patients?.clinic_id;

    const [{ data: treatmentRows }, { data: paymentRows }] = await Promise.all([
      db
        .from("treatments")
        .select("cost, status")
        .eq("patient_id", link.patient_id)
        .eq("clinic_id", clinicId)
        .is("deleted_at", null),
      db
        .from("payments")
        .select("amount")
        .eq("patient_id", link.patient_id)
        .eq("clinic_id", clinicId)
        .is("deleted_at", null),
    ]);

    return {
      data: computeOutstandingBalance(
        (treatmentRows ?? []) as { cost: number; status: string }[],
        (paymentRows ?? []) as { amount: number }[]
      ),
      error: null,
    };
  } catch (err) {
    console.error("[getPortalOutstandingBalance] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPaymentsToday — revenue today for dashboard KPI
// =============================================================================

export async function getPaymentsToday(): Promise<ActionResult<number>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    // Use the clinic's local "today" so a clinic in Asia/Kolkata at 01:00 IST
    // doesn't query against the previous calendar day.
    const { data: settings } = await db
      .from("clinic_settings")
      .select("timezone")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();
    const tz = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
    const today = getTodayInTimezone(tz);

    const { data, error } = await db
      .from("payments")
      .select("amount")
      .eq("clinic_id", profile.clinic_id)
      .eq("payment_date", today)
      .is("deleted_at", null);

    if (error) {
      console.error("[getPaymentsToday]", error);
      return { data: null, error: "Failed to fetch today's revenue." };
    }

    const total = ((data ?? []) as { amount: number }[]).reduce(
      (sum, p) => sum + Number(p.amount ?? 0),
      0
    );

    return { data: total, error: null };
  } catch (err) {
    console.error("[getPaymentsToday] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientsWithOutstandingBalance — for receptionist pending payments list
// Returns patients with outstanding balance > 0
// =============================================================================

export async function getPatientsWithOutstandingBalance(): Promise<
  ActionResult<Array<{ id: string; name: string; phone: string | null; balance: number }>>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const cid = profile.clinic_id;

    // Fetch all active patients with their treatment costs and payments
    const [{ data: patients }, { data: treatmentTotals }, { data: paymentTotals }] =
      await Promise.all([
        db
          .from("patients")
          .select("id, name, phone")
          .eq("clinic_id", cid)
          .is("deleted_at", null),
        db
          .from("treatments")
          .select("patient_id, cost, status")
          .eq("clinic_id", cid)
          .is("deleted_at", null),
        db
          .from("payments")
          .select("patient_id, amount")
          .eq("clinic_id", cid)
          .is("deleted_at", null),
      ]);

    if (!patients) return { data: [], error: null };

    // Aggregate per patient — only billable treatments contribute to dues.
    const costMap = new Map<string, number>();
    const paidMap = new Map<string, number>();

    for (const t of (treatmentTotals ?? []) as { patient_id: string; cost: number; status: string }[]) {
      if (!isBillableTreatment(t.status)) continue;
      costMap.set(t.patient_id, (costMap.get(t.patient_id) ?? 0) + Number(t.cost ?? 0));
    }

    for (const p of (paymentTotals ?? []) as { patient_id: string; amount: number }[]) {
      paidMap.set(p.patient_id, (paidMap.get(p.patient_id) ?? 0) + Number(p.amount ?? 0));
    }

    const result = (patients as { id: string; name: string; phone: string | null }[])
      .map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        balance: Math.max(0, (costMap.get(p.id) ?? 0) - (paidMap.get(p.id) ?? 0)),
      }))
      .filter((p) => p.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    return { data: result, error: null };
  } catch (err) {
    console.error("[getPatientsWithOutstandingBalance] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
