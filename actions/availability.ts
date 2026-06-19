"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  CreateAvailabilityRuleSchema,
  type ActionResult,
  type AvailabilityRule,
} from "@/types";
import {
  getAvailableSlots as computeSlots,
  type AvailabilityRule as SlotRule,
  type OccupiedSlot,
} from "@/lib/scheduling/slots";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
};

async function resolveSession() {
  const supabase = await createServerClient();
  const db: DbClient = supabase;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { db, profile: null };
  const { data } = await db
    .from("profiles")
    .select("id, clinic_id, role")
    .eq("id", user.id)
    .single();
  return { db, profile: (data as ResolvedProfile | null) ?? null };
}

// =============================================================================
// getAvailabilityRules — readable by all clinic members
// =============================================================================

export async function getAvailabilityRules(): Promise<
  ActionResult<AvailabilityRule[]>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const { data, error } = await db
      .from("availability_rules")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[getAvailabilityRules]", error);
      return { data: null, error: "Failed to fetch availability rules." };
    }

    return { data: (data ?? []) as AvailabilityRule[], error: null };
  } catch {
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// createAvailabilityRule — dentist only
// =============================================================================

export async function createAvailabilityRule(
  input: unknown
): Promise<ActionResult<AvailabilityRule>> {
  try {
    const parsed = CreateAvailabilityRuleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") return { data: null, error: "Forbidden" };

    const { data, error } = await db
      .from("availability_rules")
      .insert({
        clinic_id: profile.clinic_id,
        day_of_week: parsed.data.day_of_week,
        start_time: parsed.data.start_time,
        end_time: parsed.data.end_time,
        slot_duration_minutes: parsed.data.slot_duration_minutes,
        is_active: parsed.data.is_active,
      })
      .select()
      .single();

    if (error) {
      console.error("[createAvailabilityRule]", error);
      return { data: null, error: "Failed to create availability rule." };
    }

    revalidatePath("/dentist/settings/availability");
    return { data: data as AvailabilityRule, error: null };
  } catch {
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updateAvailabilityRule — dentist only
// =============================================================================

export async function updateAvailabilityRule(
  id: string,
  input: unknown
): Promise<ActionResult<AvailabilityRule>> {
  try {
    const parsed = CreateAvailabilityRuleSchema.partial().safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") return { data: null, error: "Forbidden" };

    const { data, error } = await db
      .from("availability_rules")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .select()
      .single();

    if (error) {
      console.error("[updateAvailabilityRule]", error);
      return { data: null, error: "Failed to update availability rule." };
    }

    revalidatePath("/dentist/settings/availability");
    return { data: data as AvailabilityRule, error: null };
  } catch {
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// toggleAvailabilityRule — dentist only
// =============================================================================

export async function toggleAvailabilityRule(
  id: string,
  isActive: boolean
): Promise<ActionResult<AvailabilityRule>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") return { data: null, error: "Forbidden" };

    const { data, error } = await db
      .from("availability_rules")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .select()
      .single();

    if (error) {
      console.error("[toggleAvailabilityRule]", error);
      return { data: null, error: "Failed to toggle availability rule." };
    }

    revalidatePath("/dentist/settings/availability");
    return { data: data as AvailabilityRule, error: null };
  } catch {
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAvailableSlots — duration-aware slot generation
// Used by: portal, receptionist UI, AppointmentForm, Patient AI Assistant
// =============================================================================

export async function getAvailableSlots(
  date: string,
  /** Duration of the appointment being booked (minutes). Default: 30 */
  requestedDurationMinutes = 30
): Promise<ActionResult<string[]>> {
  try {
    if (!date) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const dayOfWeek = new Date(date).getDay(); // 0=Sun…6=Sat

    // Fetch active rules for this day
    const { data: rules, error: rulesErr } = await db
      .from("availability_rules")
      .select("start_time, end_time, slot_duration_minutes")
      .eq("clinic_id", profile.clinic_id)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true);

    if (rulesErr) {
      console.error("[getAvailableSlots] rules:", rulesErr);
      return { data: null, error: "Failed to fetch availability rules." };
    }

    if (!rules || rules.length === 0) {
      return { data: [], error: null }; // no availability this day
    }

    // Resolve the clinic's dentist for occupied-slot lookup
    const { data: dentistData } = await db
      .from("profiles")
      .select("id")
      .eq("clinic_id", profile.clinic_id)
      .eq("role", "dentist")
      .limit(1)
      .single();

    const dentistId = (dentistData as { id: string } | null)?.id;

    // Fetch occupied appointments WITH their durations so we can check actual windows
    const { data: occupied } = dentistId
      ? await db
          .from("appointments")
          .select("scheduled_at, duration_minutes")
          .eq("dentist_id", dentistId)
          .is("deleted_at", null)
          .not("status", "in", '("cancelled","no_show")')
          .gte("scheduled_at", `${date}T00:00:00`)
          .lte("scheduled_at", `${date}T23:59:59`)
      : { data: [] };

    // Fetch clinic timezone from settings (fallback to UTC)
    const { data: settings } = await db
      .from("clinic_settings")
      .select("timezone")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();

    const timezone =
      (settings as { timezone?: string } | null)?.timezone ?? "UTC";

    const slotRules: SlotRule[] = (
      rules as { start_time: string; end_time: string; slot_duration_minutes: number }[]
    ).map((r) => ({
      startTime: r.start_time.slice(0, 5),
      endTime: r.end_time.slice(0, 5),
      slotDurationMinutes: r.slot_duration_minutes,
    }));

    // Pass both scheduled_at and duration_minutes for accurate overlap detection
    const occupiedSlots: OccupiedSlot[] = (
      (occupied ?? []) as { scheduled_at: string; duration_minutes: number }[]
    ).map((o) => ({
      scheduledAt: o.scheduled_at,
      durationMinutes: o.duration_minutes ?? 30,
    }));

    const slots = computeSlots(
      date,
      slotRules,
      occupiedSlots,
      timezone,
      requestedDurationMinutes
    );

    return { data: slots, error: null };
  } catch (err) {
    console.error("[getAvailableSlots] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
