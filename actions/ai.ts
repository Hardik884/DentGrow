"use server";

import { createServerClient } from "@/lib/supabase/server";
import { AIError, getGeminiModel, withAITimeout } from "@/lib/ai/gemini";
import {
  buildPatientSummaryPrompt,
  buildInsightsPrompt,
  buildCopilotSystemPrompt,
  buildPatientAssistantSystemPrompt,
} from "@/lib/ai/prompts";
import { ALL_COPILOT_TOOL_DECLARATIONS } from "@/lib/ai/tools";
import {
  ALL_PATIENT_TOOL_DECLARATIONS,
  getAvailableSlotsInputSchema,
  createAppointmentInputSchema,
  rescheduleAppointmentInputSchema,
  cancelAppointmentInputSchema,
  getQueueStatusInputSchema,
  getPatientAppointmentsInputSchema,
  getPatientTreatmentsInputSchema,
  getPatientPaymentsInputSchema,
  getClinicInformationInputSchema,
  type PatientToolName,
} from "@/lib/ai/patient-tools";
import type { ActionResult, CopilotMessage } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const AI_UNAVAILABLE =
  "AI features are temporarily unavailable. Please try again later.";

// Rate limiting — max messages per session tracked server-side via a simple
// in-memory counter (resets on server restart). For production use Redis.
const SESSION_COUNTERS = new Map<string, { count: number; resetAt: number }>();
const MAX_MESSAGES_PER_MINUTE = 20;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = SESSION_COUNTERS.get(userId);
  if (!entry || now > entry.resetAt) {
    SESSION_COUNTERS.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_MESSAGES_PER_MINUTE) return false;
  entry.count++;
  return true;
}

// ── Input guardrails ──────────────────────────────────────────────────────────
// Block messages that are clearly off-topic or potentially harmful.
const BLOCKED_PATTERNS = [
  /ignore (previous|all|prior) (instructions?|prompts?|system)/i,
  /you are now/i,
  /act as (a |an )?(different|new|other)/i,
  /jailbreak/i,
  /disregard/i,
  /forget (all|your|previous)/i,
];

const MAX_MESSAGE_LENGTH = 500;

function isMessageSafe(message: string): boolean {
  if (message.length > MAX_MESSAGE_LENGTH) return false;
  return !BLOCKED_PATTERNS.some((re) => re.test(message));
}

// Topics the assistant is allowed to discuss (dental + clinic + booking)
const ALLOWED_TOPIC_PATTERNS = [
  /appoint/i,
  /slot/i,
  /book/i,
  /cancel/i,
  /reschedul/i,
  /queue/i,
  /wait/i,
  /treatment/i,
  /payment/i,
  /follow.?up/i,
  /clinic/i,
  /hours?/i,
  /open/i,
  /close/i,
  /address/i,
  /phone/i,
  /contact/i,
  /dentist/i,
  /tooth|teeth/i,
  /dental/i,
  /clean/i,
  /crown/i,
  /root canal/i,
  /filling/i,
  /extraction/i,
  /implant/i,
  /bleach|whiten/i,
  /pain|ache|hurt/i,
  /hello|hi|hey|greet/i,
  /help/i,
  /thank/i,
  /yes|no|okay|ok|sure|confirm|cancel/i,
  /when|what|how|where|is|are|do|does|can|will|my|the/i,
];

function isTopicAllowed(message: string): boolean {
  const lower = message.toLowerCase().trim();
  // Very short responses (yes, no, numbers) are always allowed — part of confirmation flows
  if (lower.length <= 10) return true;
  return ALLOWED_TOPIC_PATTERNS.some((re) => re.test(lower));
}

// =============================================================================
// resolvePortalSession — resolves patient_id + clinic_id for portal users
// =============================================================================

type PortalSession = {
  db: DbClient;
  userId: string;
  patientId: string;
  clinicId: string;
};

async function resolvePortalSession(): Promise<PortalSession | null> {
  const supabase = await createServerClient();
  const db: DbClient = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: link } = await db
    .from("patient_portal_links")
    .select("patient_id, patients!inner(clinic_id)")
    .eq("user_id", user.id)
    .single();

  if (!link) return null;

  const row = link as {
    patient_id: string;
    patients: { clinic_id: string } | { clinic_id: string }[];
  };

  const clinicId = Array.isArray(row.patients)
    ? row.patients[0]?.clinic_id
    : row.patients?.clinic_id;

  if (!clinicId) return null;

  return { db, userId: user.id, patientId: row.patient_id, clinicId };
}

// =============================================================================
// executePatientTool — server-side tool execution (patient AI assistant)
// All DB access happens here. The model NEVER touches the DB.
// =============================================================================

async function executePatientTool(
  toolName: PatientToolName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  session: PortalSession
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { db, patientId, clinicId } = session;

  switch (toolName) {
    case "getAvailableSlots": {
      const input = getAvailableSlotsInputSchema.parse(args);
      // Reuse the existing server action — it handles auth internally
      const { getAvailableSlots } = await import("@/actions/availability");
      const result = await getAvailableSlots(input.date);
      if (result.error) return { error: result.error };
      const slots = result.data ?? [];
      if (slots.length === 0)
        return { message: "No available slots for that date.", slots: [] };
      return { slots, count: slots.length };
    }

    case "createAppointment": {
      const input = createAppointmentInputSchema.parse(args);
      const { createAppointment } = await import("@/actions/appointments");
      const result = await createAppointment({
        patient_id: patientId,
        scheduled_at: input.scheduledAt,
        duration_minutes: 30,
        source: "website",
        notes: input.notes,
      });
      if (result.error) return { error: result.error };
      return {
        success: true,
        appointmentId: result.data?.id,
        scheduledAt: result.data?.scheduled_at,
        message: "Appointment booked successfully.",
      };
    }

    case "rescheduleAppointment": {
      const input = rescheduleAppointmentInputSchema.parse(args);
      const { rescheduleAppointment } = await import("@/actions/appointments");
      const result = await rescheduleAppointment({
        appointment_id: input.appointmentId,
        new_scheduled_at: input.newScheduledAt,
      });
      if (result.error) return { error: result.error };
      return {
        success: true,
        message: "Appointment rescheduled successfully.",
        newScheduledAt: result.data?.scheduled_at,
      };
    }

    case "cancelAppointment": {
      const input = cancelAppointmentInputSchema.parse(args);
      const { cancelAppointment } = await import("@/actions/appointments");
      const result = await cancelAppointment(input.appointmentId);
      if (result.error) return { error: result.error };
      return { success: true, message: "Appointment cancelled successfully." };
    }

    case "getQueueStatus": {
      getQueueStatusInputSchema.parse(args);
      const { getQueueStatus } = await import("@/actions/queue");
      const result = await getQueueStatus(patientId);
      if (result.error) return { error: result.error };
      if (!result.data || result.data.position === null) {
        return { inQueue: false, message: "You are not currently in the queue." };
      }
      return {
        inQueue: true,
        position: result.data.position,
        patientsAhead: result.data.patientsAhead,
        estimatedWaitMinutes: result.data.estimatedWaitMinutes,
        currentQueueNumber: result.data.currentQueueNumber,
        status: result.data.myStatus,
      };
    }

    case "getPatientAppointments": {
      getPatientAppointmentsInputSchema.parse(args);
      const { data, error } = await db
        .from("appointments")
        .select("id, scheduled_at, status, notes, duration_minutes")
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: false })
        .limit(10);
      if (error) return { error: "Failed to fetch appointments." };
      const upcoming = (data ?? []).filter(
        (a: { status: string; scheduled_at: string }) =>
          ["scheduled", "checked_in"].includes(a.status) &&
          new Date(a.scheduled_at) >= new Date()
      );
      const past = (data ?? []).filter(
        (a: { status: string; scheduled_at: string }) =>
          a.status === "completed" || new Date(a.scheduled_at) < new Date()
      );
      return {
        upcoming: upcoming.slice(0, 5),
        past: past.slice(0, 5),
        total: (data ?? []).length,
      };
    }

    case "getPatientTreatments": {
      getPatientTreatmentsInputSchema.parse(args);
      const { data, error } = await db
        .from("patient_treatments")
        .select(
          "id, treatment_type, patient_visible_notes, cost, status, performed_at"
        )
        .order("performed_at", { ascending: false })
        .limit(10);
      if (error) return { error: "Failed to fetch treatments." };
      return { treatments: data ?? [], total: (data ?? []).length };
    }

    case "getPatientPayments": {
      getPatientPaymentsInputSchema.parse(args);
      const [paymentsResult, treatmentsResult] = await Promise.all([
        db
          .from("payments")
          .select("id, amount, method, payment_date, notes")
          .eq("patient_id", patientId)
          .is("deleted_at", null)
          .order("payment_date", { ascending: false })
          .limit(10),
        db
          .from("treatments")
          .select("cost")
          .eq("patient_id", patientId)
          .is("deleted_at", null),
      ]);
      const totalCost = (
        (treatmentsResult.data ?? []) as { cost: number }[]
      ).reduce((s, t) => s + Number(t.cost ?? 0), 0);
      const totalPaid = (
        (paymentsResult.data ?? []) as { amount: number }[]
      ).reduce((s, p) => s + Number(p.amount ?? 0), 0);
      return {
        payments: paymentsResult.data ?? [],
        outstandingBalance: Math.max(0, totalCost - totalPaid),
        currency: "₹",
      };
    }

    case "getClinicInformation": {
      getClinicInformationInputSchema.parse(args);
      const { data, error } = await db
        .from("clinic_settings")
        .select(
          "clinic_name, phone, email, address, clinic_hours, average_appointment_duration"
        )
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (error || !data) return { error: "Failed to fetch clinic information." };
      return data;
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// =============================================================================
// generatePatientSummary — dentist only
// =============================================================================

export async function generatePatientSummary(
  patientId: string
): Promise<ActionResult<string>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Unauthorized" };

    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "dentist")
      return { data: null, error: "Forbidden" };

    const [patientRes, treatmentsRes, followUpsRes] = await Promise.all([
      db
        .from("patients")
        .select("name, date_of_birth, gender, total_visits, last_visit")
        .eq("id", patientId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .single(),
      db
        .from("treatments")
        .select("treatment_type, patient_visible_notes, cost, status, performed_at")
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("performed_at", { ascending: false })
        .limit(10),
      db
        .from("follow_ups")
        .select("notes, due_date, status")
        .eq("patient_id", patientId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("due_date", { ascending: true })
        .limit(5),
    ]);

    if (!patientRes.data) return { data: null, error: "Patient not found." };

    const p = patientRes.data as {
      name: string;
      date_of_birth: string | null;
      gender: string | null;
      total_visits: number;
      last_visit: string | null;
    };

    const age = p.date_of_birth
      ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear()
      : null;

    const [txCostRes, paymentRes] = await Promise.all([
      db
        .from("treatments")
        .select("cost")
        .eq("patient_id", patientId)
        .is("deleted_at", null),
      db
        .from("payments")
        .select("amount")
        .eq("patient_id", patientId)
        .is("deleted_at", null),
    ]);

    const totalCost = (
      (txCostRes.data ?? []) as { cost: number }[]
    ).reduce((s: number, t: { cost: number }) => s + Number(t.cost ?? 0), 0);
    const totalPaid = (
      (paymentRes.data ?? []) as { amount: number }[]
    ).reduce((s: number, t: { amount: number }) => s + Number(t.amount ?? 0), 0);
    const balance = Math.max(0, totalCost - totalPaid);

    const model = getGeminiModel();
    const result = await withAITimeout(async () => {
      const response = await model.generateContent(
        buildPatientSummaryPrompt({
          name: p.name,
          age,
          gender: p.gender,
          totalVisits: p.total_visits,
          lastVisit: p.last_visit,
          outstandingBalance: `₹${balance.toFixed(2)}`,
          treatments: (treatmentsRes.data ?? []).map(
            (t: {
              treatment_type: string;
              status: string;
              performed_at: string | null;
              patient_visible_notes: string | null;
            }) => ({
              treatmentType: t.treatment_type,
              status: t.status,
              performedAt: t.performed_at,
              patientVisibleNotes: t.patient_visible_notes,
            })
          ),
          followUps: (followUpsRes.data ?? []).map(
            (f: { notes: string | null; due_date: string; status: string }) => ({
              notes: f.notes,
              dueDate: f.due_date,
              status: f.status,
            })
          ),
        })
      );
      return response.response.text();
    });

    return { data: result, error: null };
  } catch (error) {
    if (error instanceof AIError)
      return { data: null, error: AI_UNAVAILABLE };
    return { data: null, error: AI_UNAVAILABLE };
  }
}

// =============================================================================
// generateInsights — dentist only
// =============================================================================

export async function generateInsights(): Promise<ActionResult<string[]>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Unauthorized" };

    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "dentist")
      return { data: null, error: "Forbidden" };

    const cid = profile.clinic_id;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const todayStart = `${todayStr}T00:00:00.000Z`;
    const todayEnd = `${todayStr}T23:59:59.999Z`;

    const [todayAppts, lastWeekPayments, thisWeekPayments, overdueRes, settingsRes] =
      await Promise.all([
        db
          .from("appointments")
          .select("status, source")
          .eq("clinic_id", cid)
          .gte("scheduled_at", todayStart)
          .lte("scheduled_at", todayEnd)
          .is("deleted_at", null),
        db
          .from("payments")
          .select("amount")
          .eq("clinic_id", cid)
          .gte("payment_date", new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0])
          .lt("payment_date", new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0])
          .is("deleted_at", null),
        db
          .from("payments")
          .select("amount")
          .eq("clinic_id", cid)
          .gte("payment_date", new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0])
          .is("deleted_at", null),
        db
          .from("follow_ups")
          .select("id")
          .eq("clinic_id", cid)
          .eq("status", "pending")
          .lt("due_date", todayStr)
          .is("deleted_at", null),
        db
          .from("clinic_settings")
          .select("clinic_name")
          .eq("clinic_id", cid)
          .maybeSingle(),
      ]);

    const appts = (todayAppts.data ?? []) as { status: string; source: string }[];
    const revenueToday = 0;
    const revenueLastWeek = (
      (lastWeekPayments.data ?? []) as { amount: number }[]
    ).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const revenueThisWeek = (
      (thisWeekPayments.data ?? []) as { amount: number }[]
    ).reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const model = getGeminiModel();
    const result = await withAITimeout(async () => {
      const response = await model.generateContent(
        buildInsightsPrompt({
          today: todayStr,
          clinicName:
            (settingsRes.data as { clinic_name?: string } | null)
              ?.clinic_name ?? "the clinic",
          overdueFollowUpsCount: (overdueRes.data ?? []).length,
          metrics: {
            totalAppointmentsToday: appts.length,
            seenPatientsToday: appts.filter((a) => a.status === "completed").length,
            noShowsToday: appts.filter((a) => a.status === "no_show").length,
            walkInsToday: appts.filter((a) => a.source === "walk_in").length,
            revenueToday,
            revenueLastWeek,
            noShowsThisWeek: 0,
            noShowsLastWeek: 0,
            walkInsThisWeek: appts.filter((a) => a.source === "walk_in").length,
            walkInsLastWeek: 0,
            busiestHourThisWeek: null,
          },
          // Add revenue comparison
          // @ts-expect-error — extra context field
          revenueThisWeek,
        })
      );
      return response.response.text();
    });

    const insights = result
      .split("\n")
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);

    return { data: insights, error: null };
  } catch (error) {
    if (error instanceof AIError) return { data: null, error: AI_UNAVAILABLE };
    return { data: null, error: AI_UNAVAILABLE };
  }
}

// =============================================================================
// sendCopilotMessage — dentist + receptionist (stub — kept for future impl)
// =============================================================================

export async function sendCopilotMessage(
  history: CopilotMessage[],
  message: string
): Promise<ActionResult<CopilotMessage>> {
  try {
    void history;
    void message;
    void ALL_COPILOT_TOOL_DECLARATIONS;
    void buildCopilotSystemPrompt;

    return {
      data: {
        role: "model",
        content:
          "Copilot is coming soon. Use the dashboard sections to access your clinic data.",
      },
      error: null,
    };
  } catch {
    return { data: null, error: AI_UNAVAILABLE };
  }
}

// =============================================================================
// sendPatientAssistantMessage — portal patients only
// Full tool-calling loop with Gemini.
// =============================================================================

export async function sendPatientAssistantMessage(
  history: CopilotMessage[],
  message: string
): Promise<ActionResult<CopilotMessage>> {
  try {
    // ── Guardrails ────────────────────────────────────────────────────────
    if (!isMessageSafe(message)) {
      return {
        data: {
          role: "model",
          content:
            "I can only help with appointment booking, clinic information, and dental-related questions. Please contact the clinic directly for other requests.",
        },
        error: null,
      };
    }

    if (!isTopicAllowed(message)) {
      return {
        data: {
          role: "model",
          content:
            "I'm your dental clinic assistant. I can help you with appointments, queue status, treatment history, payments, and clinic information. Is there something I can help you with today?",
        },
        error: null,
      };
    }

    // ── Auth — portal patients only ───────────────────────────────────────
    const session = await resolvePortalSession();
    if (!session) {
      return { data: null, error: "Please log in to use the assistant." };
    }

    // ── Rate limiting ─────────────────────────────────────────────────────
    if (!checkRateLimit(session.userId)) {
      return {
        data: {
          role: "model",
          content: "You're sending messages too quickly. Please wait a moment.",
        },
        error: null,
      };
    }

    // ── Fetch clinic info for the system prompt ───────────────────────────
    const { data: clinicSettings } = await session.db
      .from("clinic_settings")
      .select("clinic_name, phone, email, address, clinic_hours, timezone")
      .eq("clinic_id", session.clinicId)
      .maybeSingle();

    const timezone =
      (clinicSettings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

    const clinicInfo = {
      clinicName:
        (clinicSettings as { clinic_name?: string } | null)?.clinic_name ??
        "your dental clinic",
      phone:
        (clinicSettings as { phone?: string } | null)?.phone ?? null,
      email:
        (clinicSettings as { email?: string } | null)?.email ?? null,
      address:
        (clinicSettings as { address?: string } | null)?.address ?? null,
      clinicHours:
        (clinicSettings as { clinic_hours?: Record<string, { open: string | null; close: string | null; is_open: boolean }> } | null)
          ?.clinic_hours ?? null,
    };

    // ── Build current date/time context for the AI (Asia/Kolkata timezone) ──
    const now = new Date();

    // Get current time in clinic timezone (HH:MM format)
    const currentTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    // Build full readable date for the prompt (e.g., "22 June 2026")
    const currentDateReadable = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(now);

    const currentContext = {
      currentDate: currentDateReadable,
      currentTime: `${currentTime} IST`,
      timezone,
    };

    const model = getGeminiModel();

    const result = await withAITimeout(
      async () => {
        // Tool declarations — FunctionDeclarationsTool[] shape required by SDK
        const tools = [{ functionDeclarations: ALL_PATIENT_TOOL_DECLARATIONS }];

        // systemInstruction as Content object: role "system" + parts array.
        // This is the format required by gemini-3.1-flash-lite.
        const systemInstruction = {
          role: "system",
          parts: [{ text: buildPatientAssistantSystemPrompt(clinicInfo, currentContext) }],
        };

        // History: only include user/model turns (never system).
        // Filter out any empty content to avoid API rejection.
        const chatHistory = history
          .slice(-10)
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({
            role: m.role,
            parts: [{ text: m.content }],
          }));

        // Start chat with system instruction and history
        const chat = model.startChat({
          systemInstruction,
          tools,
          history: chatHistory,
        });

        // Send the user message
        let response = await chat.sendMessage(message);
        let candidate = response.response;

        // Tool-call loop — max 5 iterations to prevent infinite loops
        let iterations = 0;
        while (iterations < 5) {
          iterations++;

          const functionCalls = candidate.functionCalls();
          if (!functionCalls || functionCalls.length === 0) break;

          // Execute all requested tool calls
          const toolResults = await Promise.all(
            functionCalls.map(async (fc) => {
              const toolName = fc.name as PatientToolName;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const toolArgs = (fc.args as Record<string, any>) ?? {};

              try {
                const toolResult = await executePatientTool(
                  toolName,
                  toolArgs,
                  session
                );
                return {
                  functionResponse: {
                    name: toolName,
                    response: toolResult,
                  },
                };
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : "Tool execution failed";
                return {
                  functionResponse: {
                    name: toolName,
                    response: { error: msg },
                  },
                };
              }
            })
          );

          // Send tool results back to the model as function response parts
          const toolResponseParts = toolResults.map((r) => ({
            functionResponse: r.functionResponse,
          }));

          response = await chat.sendMessage(toolResponseParts);
          candidate = response.response;
        }

        const text = candidate.text();
        return text || "I'm here to help. What would you like to do?";
      },
      15_000 // 15s for tool-call loops
    );

    return { data: { role: "model", content: result }, error: null };
  } catch (error) {
    if (error instanceof AIError) {
      console.error("[sendPatientAssistantMessage] AIError:", error.message, error.cause);
      return { data: null, error: AI_UNAVAILABLE };
    }
    console.error("[sendPatientAssistantMessage] unexpected:", error);
    return { data: null, error: AI_UNAVAILABLE };
  }
}
