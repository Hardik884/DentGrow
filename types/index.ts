/**
 * types/index.ts — Single source of truth for all TypeScript types.
 *
 * Sections:
 *   1. Database type re-exports
 *   2. Enum types (as const objects)
 *   3. Computed / extended types
 *   4. Server Action result type
 *   5. Zod validation schemas
 *   6. AI types
 *   7. Analytics types
 *   8. Session / auth types
 */

import { z } from "zod";
import type { Database } from "./database.types";

// =============================================================================
// SECTION 1 — DATABASE TYPE RE-EXPORTS
// =============================================================================

export type { Database } from "./database.types";

// Row types
export type Clinic          = Database["public"]["Tables"]["clinics"]["Row"];
export type Profile         = Database["public"]["Tables"]["profiles"]["Row"];
export type Patient         = Database["public"]["Tables"]["patients"]["Row"];
export type Appointment     = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentHistory = Database["public"]["Tables"]["appointment_history"]["Row"];
export type QueueEntry      = Database["public"]["Tables"]["queue_entries"]["Row"];
export type Treatment       = Database["public"]["Tables"]["treatments"]["Row"];
export type Payment         = Database["public"]["Tables"]["payments"]["Row"];
export type FollowUp        = Database["public"]["Tables"]["follow_ups"]["Row"];
export type PatientPortalLink = Database["public"]["Tables"]["patient_portal_links"]["Row"];
export type ClinicSettings  = Database["public"]["Tables"]["clinic_settings"]["Row"];
export type AvailabilityRule = Database["public"]["Tables"]["availability_rules"]["Row"];
export type WebhookLog      = Database["public"]["Tables"]["webhook_logs"]["Row"];

// Insert types
export type PatientInsert     = Database["public"]["Tables"]["patients"]["Insert"];
export type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];
export type TreatmentInsert   = Database["public"]["Tables"]["treatments"]["Insert"];
export type PaymentInsert     = Database["public"]["Tables"]["payments"]["Insert"];
export type FollowUpInsert    = Database["public"]["Tables"]["follow_ups"]["Insert"];

// Update types
export type PatientUpdate     = Database["public"]["Tables"]["patients"]["Update"];
export type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];
export type TreatmentUpdate   = Database["public"]["Tables"]["treatments"]["Update"];
export type FollowUpUpdate    = Database["public"]["Tables"]["follow_ups"]["Update"];
export type ClinicSettingsUpdate = Database["public"]["Tables"]["clinic_settings"]["Update"];

// =============================================================================
// SECTION 2 — ENUM TYPES
// =============================================================================

export const AppointmentStatus = {
  SCHEDULED:   "scheduled",
  CHECKED_IN:  "checked_in",
  IN_PROGRESS: "in_progress",
  COMPLETED:   "completed",
  CANCELLED:   "cancelled",
  NO_SHOW:     "no_show",
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const AppointmentSource = {
  WALK_IN:    "walk_in",
  PHONE_CALL: "phone_call",
  WEBSITE:    "website",
  REFERRAL:   "referral",
  OTHER:      "other",
} as const;
export type AppointmentSource = (typeof AppointmentSource)[keyof typeof AppointmentSource];

export const TreatmentStatus = {
  PLANNED:     "planned",
  IN_PROGRESS: "in_progress",
  COMPLETED:   "completed",
  CANCELLED:   "cancelled",
} as const;
export type TreatmentStatus = (typeof TreatmentStatus)[keyof typeof TreatmentStatus];

export const PaymentMethod = {
  CASH:          "cash",
  UPI:           "upi",
  CARD:          "card",
  BANK_TRANSFER: "bank_transfer",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const FollowUpStatus = {
  PENDING:   "pending",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type FollowUpStatus = (typeof FollowUpStatus)[keyof typeof FollowUpStatus];

export const QueueStatus = {
  WAITING:     "waiting",
  IN_PROGRESS: "in_progress",
  COMPLETED:   "completed",
} as const;
export type QueueStatus = (typeof QueueStatus)[keyof typeof QueueStatus];

export const UserRole = {
  DENTIST:       "dentist",
  RECEPTIONIST:  "receptionist",
  PATIENT:       "patient",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const GenderType = {
  MALE:   "male",
  FEMALE: "female",
  OTHER:  "other",
} as const;
export type GenderType = (typeof GenderType)[keyof typeof GenderType];

/**
 * Valid appointment status transition map.
 * Used in actions/appointments.ts to enforce lifecycle order.
 */
export const VALID_APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled:   ["checked_in", "cancelled", "no_show"],
  checked_in:  ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed"],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

// =============================================================================
// SECTION 3 — COMPUTED / EXTENDED TYPES
// =============================================================================

export type PatientWithBalance = Patient & {
  outstandingBalance: number;
};

export type PatientWithFollowUps = Patient & {
  pendingFollowUps: FollowUp[];
};

export type PatientFull = Patient & {
  outstandingBalance: number;
  pendingFollowUps: FollowUp[];
};

export type AppointmentWithPatient = Appointment & {
  patient: Pick<Patient, "id" | "name" | "phone">;
};

export type AppointmentWithHistory = Appointment & {
  patient: Pick<Patient, "id" | "name" | "phone">;
  history: AppointmentHistory[];
};

export type QueueEntryWithPatient = QueueEntry & {
  patient: Pick<Patient, "id" | "name">;
  /** Duration of the linked appointment — used for accurate wait time calculation */
  duration_minutes?: number;
};

/** Receptionist view — internal_notes excluded */
export type TreatmentForReceptionist = Omit<Treatment, "internal_notes">;

/** Patient portal view — only patient-visible fields */
export type TreatmentForPatient = Pick<
  Treatment,
  | "id"
  | "clinic_id"
  | "appointment_id"
  | "patient_id"
  | "treatment_type"
  | "patient_visible_notes"
  | "cost"
  | "status"
  | "performed_at"
  | "created_at"
>;

// =============================================================================
// SECTION 4 — SERVER ACTION RESULT TYPE
// =============================================================================

/** Enforced return type for all Server Actions */
export type ActionResult<T> = {
  data: T | null;
  error: string | null;
};

// =============================================================================
// SECTION 5 — ZOD VALIDATION SCHEMAS
// =============================================================================

const phoneRegex = /^[+]?[\d\s\-().]{7,15}$/;

// ── Patient ───────────────────────────────────────────────────────────────────

export const CreatePatientSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(phoneRegex, "Invalid phone number format").optional().or(z.literal("")),
  date_of_birth: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  address: z.string().max(500).optional(),
  emergency_contact_name: z.string().max(100).optional(),
  emergency_contact_phone: z.string().regex(phoneRegex).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

export const UpdatePatientSchema = CreatePatientSchema.partial();
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;

// ── Appointment ───────────────────────────────────────────────────────────────

export const CreateAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  // Accept ISO datetime with OR without timezone offset.
  // Slots from getAvailableSlots() return "YYYY-MM-DDTHH:MM:00" (no offset);
  // the server action converts to a proper timestamptz before inserting.
  scheduled_at: z.string().min(1, "Please select a time slot"),
  duration_minutes: z.number().int().positive().default(30),
  source: z.enum(["walk_in", "phone_call", "website", "referral", "other"]),
  notes: z.string().max(1000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;

export const RescheduleAppointmentSchema = z.object({
  appointment_id: z.string().uuid(),
  new_scheduled_at: z.string().datetime(),
});
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentSchema>;

export const UpdateAppointmentStatusSchema = z.object({
  appointment_id: z.string().uuid(),
  new_status: z.enum(["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"]),
});
export type UpdateAppointmentStatusInput = z.infer<typeof UpdateAppointmentStatusSchema>;

// ── Treatment ─────────────────────────────────────────────────────────────────

export const CreateTreatmentSchema = z.object({
  appointment_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  treatment_type: z.string().min(1).max(100),
  internal_notes: z.string().max(5000).optional(),
  patient_visible_notes: z.string().max(2000).optional(),
  cost: z.number().nonnegative(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).default("planned"),
  performed_at: z.string().datetime().optional(),
});
export type CreateTreatmentInput = z.infer<typeof CreateTreatmentSchema>;

export const UpdateTreatmentSchema = CreateTreatmentSchema.omit({ appointment_id: true, patient_id: true }).partial();
export type UpdateTreatmentInput = z.infer<typeof UpdateTreatmentSchema>;

// ── Payment ───────────────────────────────────────────────────────────────────

export const RecordPaymentSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  method: z.enum(["cash", "upi", "card", "bank_transfer"]),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

// ── Follow-Up ─────────────────────────────────────────────────────────────────

export const CreateFollowUpSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional(),
  treatment_id: z.string().uuid().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional(),
});
export type CreateFollowUpInput = z.infer<typeof CreateFollowUpSchema>;

export const UpdateFollowUpSchema = CreateFollowUpSchema.partial().extend({
  status: z.enum(["pending", "completed", "cancelled"]).optional(),
});
export type UpdateFollowUpInput = z.infer<typeof UpdateFollowUpSchema>;

// ── Clinic Settings ───────────────────────────────────────────────────────────

const ClinicDayHoursSchema = z.object({
  open: z.string().nullable(),
  close: z.string().nullable(),
  is_open: z.boolean(),
});

export const UpdateClinicSettingsSchema = z.object({
  clinic_name: z.string().min(1).max(100),
  phone: z.string().regex(phoneRegex).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  average_appointment_duration: z.number().int().positive(),
  timezone: z.string().min(1),
  clinic_hours: z.object({
    monday: ClinicDayHoursSchema,
    tuesday: ClinicDayHoursSchema,
    wednesday: ClinicDayHoursSchema,
    thursday: ClinicDayHoursSchema,
    friday: ClinicDayHoursSchema,
    saturday: ClinicDayHoursSchema,
    sunday: ClinicDayHoursSchema,
  }).optional(),
});
export type UpdateClinicSettingsInput = z.infer<typeof UpdateClinicSettingsSchema>;

// ── Availability Rule ─────────────────────────────────────────────────────────

export const CreateAvailabilityRuleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  slot_duration_minutes: z.number().int().positive(),
  is_active: z.boolean().default(true),
});
export type CreateAvailabilityRuleInput = z.infer<typeof CreateAvailabilityRuleSchema>;

// ── Portal Link ───────────────────────────────────────────────────────────────

export const LinkPortalAccountSchema = z.object({
  phone: z.string().regex(phoneRegex, "Invalid phone number format"),
});
export type LinkPortalAccountInput = z.infer<typeof LinkPortalAccountSchema>;

// =============================================================================
// SECTION 6 — AI TYPES
// =============================================================================

export type CopilotMessage = {
  role: "user" | "model";
  content: string;
};

export type PatientSummaryContext = {
  name: string;
  age: number | null;
  gender: string | null;
  totalVisits: number;
  lastVisit: string | null;
  outstandingBalance: string;
  treatments: Array<{
    treatmentType: string;
    status: string;
    performedAt: string | null;
    patientVisibleNotes: string | null;
  }>;
  followUps: Array<{
    notes: string | null;
    dueDate: string;
    status: string;
  }>;
};

export type InsightsContext = {
  today: string;
  clinicName: string;
  overdueFollowUpsCount: number;
  metrics: {
    totalAppointmentsToday: number;
    seenPatientsToday: number;
    noShowsToday: number;
    walkInsToday: number;
    revenueToday: number;
    revenueLastWeek: number;
    noShowsThisWeek: number;
    noShowsLastWeek: number;
    walkInsThisWeek: number;
    walkInsLastWeek: number;
    busiestHourThisWeek: string | null;
  };
};

export type CopilotSessionContext = {
  clinicName: string;
  userName: string;
  userRole: "dentist" | "receptionist";
  today: string;
};

export type ClinicInfo = {
  clinicName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  clinicHours: Record<string, { open: string | null; close: string | null; is_open: boolean }> | null;
};

// =============================================================================
// SECTION 7 — ANALYTICS TYPES
// =============================================================================

export type DashboardKPIs = {
  totalAppointmentsToday: number;
  seenPatientsToday: number;
  completionRateToday: number;
  waitingPatients: number;
  noShowsToday: number;
  revenueToday: number;
  newPatientsToday: number;
  walkInsToday: number;
};

export type AppointmentAnalytics = {
  byStatus: Array<{ status: AppointmentStatus; count: number; date: string }>;
  cancellationRate: Array<{ date: string; rate: number }>;
  noShowRate: Array<{ date: string; rate: number }>;
  averagePerDay: number;
  peakHours: Array<{ hour: number; dayOfWeek: number; count: number }>;
};

export type PatientAnalytics = {
  newPatientsOverTime: Array<{ date: string; count: number }>;
  returningVsNew: { returning: number; new: number };
  ageDistribution: Array<{ ageGroup: string; count: number }>;
  genderBreakdown: Array<{ gender: string; count: number }>;
  topPatients: Array<{ patientId: string; name: string; visits: number }>;
};

export type TreatmentAnalytics = {
  byType: Array<{ treatmentType: string; count: number }>;
  avgCostByType: Array<{ treatmentType: string; avgCost: number }>;
  completionRate: number;
  revenueByType: Array<{ treatmentType: string; revenue: number }>;
};

export type RevenueAnalytics = {
  overTime: Array<{ date: string; amount: number }>;
  byPaymentMethod: Array<{ method: PaymentMethod; amount: number }>;
  bySource: Array<{ source: AppointmentSource; amount: number }>;
  outstandingTotal: number;
  avgPerCompletedAppointment: number;
  momGrowth: number;
};

export type SourceAnalytics = {
  breakdown: Array<{ source: AppointmentSource; count: number }>;
  trendOverTime: Array<{ date: string; source: AppointmentSource; count: number }>;
  conversionBySource: Array<{
    source: AppointmentSource;
    booked: number;
    completed: number;
    noShow: number;
  }>;
};

export type FollowUpAnalytics = {
  pendingCount: number;
  overdueCount: number;
  completedOverTime: Array<{ date: string; count: number }>;
  completionRate: number;
  byTreatmentType: Array<{ treatmentType: string; count: number }>;
};

// =============================================================================
// SECTION 8 — SESSION / AUTH TYPES
// =============================================================================

/** Resolved from profiles table for staff (dentist + receptionist) */
export type SessionUser = {
  id: string;
  role: "dentist" | "receptionist";
  clinicId: string;
  fullName: string;
};

/** Resolved from patient_portal_links for portal users */
export type PortalUser = {
  id: string;          // auth.uid()
  patientId: string;   // patient_portal_links.patient_id
  clinicId: string;    // patients.clinic_id (derived via join)
};

/** Portal link status returned by checkPortalLinkStatus() */
export type PortalLinkStatus = "linked" | "unlinked" | "no_match";
