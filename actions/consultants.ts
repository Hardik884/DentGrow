"use server";

import { revalidatePath } from "next/cache";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { getTodayInTimezone } from "@/lib/utils";
import {
  CreateConsultantSchema,
  UpdateConsultantSchema,
  RecordConsultancyIncomeSchema,
  CreateConsultancyScheduleSchema,
  CreateUnavailableDateSchema,
  type ActionResult,
  type Consultant,
  type ConsultancyIncome,
  type ConsultancySchedule,
  type UnavailableDate,
} from "@/types";

/**
 * Consultant Management — Server Actions
 *
 * Rules:
 * - clinic_id / dentist_id always come from the session, never the client.
 * - Only dentists mutate consultants, consultancy income, schedules, holidays.
 * - Consultants are clinic-scoped; consultancy income is dentist-scoped.
 * - RLS enforces the same boundaries at the database level.
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

const SETTINGS_PATH = "/dentist/settings";

// =============================================================================
// CONSULTANT DIRECTORY
// =============================================================================

export async function getConsultants(): Promise<ActionResult<Consultant[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const { data, error } = await db
      .from("consultants")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[getConsultants]", error);
      return { data: null, error: "Failed to fetch consultants." };
    }

    return { data: (data ?? []) as Consultant[], error: null };
  } catch (err) {
    console.error("[getConsultants] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function createConsultant(
  input: unknown
): Promise<ActionResult<Consultant>> {
  try {
    const parsed = CreateConsultantSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can add consultants." };
    }

    const { data, error } = await db
      .from("consultants")
      .insert({ clinic_id: profile.clinic_id, name: parsed.data.name })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { data: null, error: "A consultant with this name already exists." };
      }
      console.error("[createConsultant]", error);
      return { data: null, error: "Failed to create consultant." };
    }

    revalidatePath(SETTINGS_PATH);
    return { data: data as Consultant, error: null };
  } catch (err) {
    console.error("[createConsultant] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function updateConsultant(
  id: string,
  input: unknown
): Promise<ActionResult<Consultant>> {
  try {
    if (!id) return { data: null, error: "Consultant ID is required" };

    const parsed = UpdateConsultantSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can edit consultants." };
    }

    const { data, error } = await db
      .from("consultants")
      .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .eq("is_active", true)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { data: null, error: "A consultant with this name already exists." };
      }
      console.error("[updateConsultant]", error);
      return { data: null, error: "Failed to update consultant." };
    }
    if (!data) return { data: null, error: "Consultant not found." };

    revalidatePath(SETTINGS_PATH);
    return { data: data as Consultant, error: null };
  } catch (err) {
    console.error("[updateConsultant] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/**
 * Delete a consultant. Soft-deletes (is_active = false) so historical treatment
 * links and their stored revenue splits remain intact. Removed from the
 * directory and the treatment-form dropdown.
 */
export async function deleteConsultant(id: string): Promise<ActionResult<null>> {
  try {
    if (!id) return { data: null, error: "Consultant ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can delete consultants." };
    }

    const { error } = await db
      .from("consultants")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id);

    if (error) {
      console.error("[deleteConsultant]", error);
      return { data: null, error: "Failed to delete consultant." };
    }

    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    console.error("[deleteConsultant] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// CONSULTANCY INCOME (external earnings)
// =============================================================================

/** Total external consultancy income the dentist recorded for today. */
export async function getConsultancyRevenueToday(): Promise<ActionResult<number>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") return { data: null, error: "Forbidden" };

    const { data: settings } = await db
      .from("clinic_settings")
      .select("timezone")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();
    const tz = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
    const today = getTodayInTimezone(tz);

    const { data, error } = await db
      .from("consultancy_income")
      .select("amount")
      .eq("clinic_id", profile.clinic_id)
      .eq("dentist_id", profile.id)
      .eq("date", today);

    if (error) {
      console.error("[getConsultancyRevenueToday]", error);
      return { data: null, error: "Failed to fetch consultancy revenue." };
    }

    const total = ((data ?? []) as { amount: number }[]).reduce(
      (sum, c) => sum + Number(c.amount ?? 0),
      0
    );
    return { data: total, error: null };
  } catch (err) {
    console.error("[getConsultancyRevenueToday] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function recordConsultancyIncome(
  input: unknown
): Promise<ActionResult<ConsultancyIncome>> {
  try {
    const parsed = RecordConsultancyIncomeSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can record consultancy income." };
    }

    const { data, error } = await db
      .from("consultancy_income")
      .insert({
        clinic_id: profile.clinic_id,
        dentist_id: profile.id,
        date: parsed.data.date,
        external_clinic: parsed.data.external_clinic ?? null,
        description: parsed.data.description ?? null,
        amount: parsed.data.amount,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[recordConsultancyIncome]", error);
      return { data: null, error: "Failed to record consultancy income." };
    }

    revalidatePath("/dentist/payments");
    revalidatePath("/dentist/analytics");
    return { data: data as ConsultancyIncome, error: null };
  } catch (err) {
    console.error("[recordConsultancyIncome] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// CONSULTANCY SCHEDULES (recurring weekly blocks)
// =============================================================================

export async function getConsultancySchedules(): Promise<
  ActionResult<ConsultancySchedule[]>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const { data, error } = await db
      .from("consultancy_schedules")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .eq("is_active", true)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[getConsultancySchedules]", error);
      return { data: null, error: "Failed to fetch consultancy schedules." };
    }

    return { data: (data ?? []) as ConsultancySchedule[], error: null };
  } catch (err) {
    console.error("[getConsultancySchedules] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function createConsultancySchedule(
  input: unknown
): Promise<ActionResult<ConsultancySchedule>> {
  try {
    const parsed = CreateConsultancyScheduleSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can add consultancy schedules." };
    }

    const { data, error } = await db
      .from("consultancy_schedules")
      .insert({
        clinic_id: profile.clinic_id,
        dentist_id: profile.id,
        date: parsed.data.date,
        start_time: parsed.data.start_time,
        end_time: parsed.data.end_time,
        reason: parsed.data.reason ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[createConsultancySchedule]", error);
      return { data: null, error: "Failed to create consultancy schedule." };
    }

    revalidatePath(SETTINGS_PATH);
    return { data: data as ConsultancySchedule, error: null };
  } catch (err) {
    console.error("[createConsultancySchedule] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function deleteConsultancySchedule(id: string): Promise<ActionResult<null>> {
  try {
    if (!id) return { data: null, error: "Schedule ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") return { data: null, error: "Forbidden" };

    const { error } = await db
      .from("consultancy_schedules")
      .delete()
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id);

    if (error) {
      console.error("[deleteConsultancySchedule]", error);
      return { data: null, error: "Failed to delete consultancy schedule." };
    }

    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    console.error("[deleteConsultancySchedule] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// UNAVAILABLE DATES (holidays / closures)
// =============================================================================

export async function getUnavailableDates(): Promise<ActionResult<UnavailableDate[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const { data, error } = await db
      .from("unavailable_dates")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .order("date", { ascending: true });

    if (error) {
      console.error("[getUnavailableDates]", error);
      return { data: null, error: "Failed to fetch unavailable dates." };
    }

    return { data: (data ?? []) as UnavailableDate[], error: null };
  } catch (err) {
    console.error("[getUnavailableDates] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function createUnavailableDate(
  input: unknown
): Promise<ActionResult<UnavailableDate>> {
  try {
    const parsed = CreateUnavailableDateSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can add unavailable dates." };
    }

    const { data, error } = await db
      .from("unavailable_dates")
      .insert({
        clinic_id: profile.clinic_id,
        dentist_id: profile.id,
        date: parsed.data.date,
        reason: parsed.data.reason ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { data: null, error: "This date is already marked as unavailable." };
      }
      console.error("[createUnavailableDate]", error);
      return { data: null, error: "Failed to create unavailable date." };
    }

    revalidatePath(SETTINGS_PATH);
    return { data: data as UnavailableDate, error: null };
  } catch (err) {
    console.error("[createUnavailableDate] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function deleteUnavailableDate(id: string): Promise<ActionResult<null>> {
  try {
    if (!id) return { data: null, error: "Unavailable date ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") return { data: null, error: "Forbidden" };

    const { error } = await db
      .from("unavailable_dates")
      .delete()
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id);

    if (error) {
      console.error("[deleteUnavailableDate]", error);
      return { data: null, error: "Failed to delete unavailable date." };
    }

    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    console.error("[deleteUnavailableDate] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
