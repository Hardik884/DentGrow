/**
 * Patient AI Assistant tool definitions — patient portal.
 *
 * All tools are scoped to the authenticated patient's patient_id and clinic_id,
 * resolved from the server session in actions/ai.ts.
 *
 * Mutating tools (createAppointment, rescheduleAppointment, cancelAppointment)
 * require confirmed: true in their input. The assistant MUST present the
 * proposed action to the patient and receive confirmation before calling these.
 * If confirmed is false or absent, the function returns an error.
 */

import { z } from "zod";

// =============================================================================
// getAvailableSlots
// =============================================================================

export const getAvailableSlotsDeclaration = {
  name: "getAvailableSlots",
  description: "Returns open appointment slots for a given date.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "ISO 8601 date string (YYYY-MM-DD).",
      },
    },
    required: ["date"],
  },
};

export const getAvailableSlotsInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// =============================================================================
// createAppointment — MUTATING, requires confirmed: true
// =============================================================================

export const createAppointmentDeclaration = {
  name: "createAppointment",
  description:
    "Books a new appointment for the patient. Requires prior user confirmation.",
  parameters: {
    type: "object" as const,
    properties: {
      scheduledAt: {
        type: "string",
        description: "ISO 8601 datetime string for the appointment slot.",
      },
      notes: {
        type: "string",
        description: "Optional patient notes for the appointment.",
      },
      confirmed: {
        type: "boolean",
        description: "Must be true — patient has explicitly confirmed the booking.",
      },
    },
    required: ["scheduledAt", "confirmed"],
  },
};

export const createAppointmentInputSchema = z.object({
  scheduledAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
  confirmed: z.literal(true, {
    errorMap: () => ({
      message: "Patient confirmation is required before booking.",
    }),
  }),
});

// =============================================================================
// rescheduleAppointment — MUTATING, requires confirmed: true
// =============================================================================

export const rescheduleAppointmentDeclaration = {
  name: "rescheduleAppointment",
  description:
    "Moves an existing appointment to a new time slot. Requires prior user confirmation.",
  parameters: {
    type: "object" as const,
    properties: {
      appointmentId: { type: "string", description: "UUID of the appointment to reschedule." },
      newScheduledAt: { type: "string", description: "ISO 8601 datetime for the new slot." },
      confirmed: { type: "boolean", description: "Must be true." },
    },
    required: ["appointmentId", "newScheduledAt", "confirmed"],
  },
};

export const rescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string().uuid(),
  newScheduledAt: z.string().datetime(),
  confirmed: z.literal(true),
});

// =============================================================================
// cancelAppointment — MUTATING, requires confirmed: true
// =============================================================================

export const cancelAppointmentDeclaration = {
  name: "cancelAppointment",
  description:
    "Cancels a future appointment owned by the patient. Requires prior user confirmation.",
  parameters: {
    type: "object" as const,
    properties: {
      appointmentId: { type: "string", description: "UUID of the appointment to cancel." },
      confirmed: { type: "boolean", description: "Must be true." },
    },
    required: ["appointmentId", "confirmed"],
  },
};

export const cancelAppointmentInputSchema = z.object({
  appointmentId: z.string().uuid(),
  confirmed: z.literal(true),
});

// =============================================================================
// getQueueStatus
// =============================================================================

export const getQueueStatusDeclaration = {
  name: "getQueueStatus",
  description:
    "Returns the patient's current queue position, number of patients ahead, and estimated wait time.",
  parameters: { type: "object" as const, properties: {}, required: [] },
};

export const getQueueStatusInputSchema = z.object({});

// =============================================================================
// getPatientAppointments
// =============================================================================

export const getPatientAppointmentsDeclaration = {
  name: "getPatientAppointments",
  description: "Returns the patient's upcoming and past appointments.",
  parameters: { type: "object" as const, properties: {}, required: [] },
};

export const getPatientAppointmentsInputSchema = z.object({});

// =============================================================================
// getPatientTreatments
// =============================================================================

export const getPatientTreatmentsDeclaration = {
  name: "getPatientTreatments",
  description:
    "Returns the patient's treatment history. Only patient_visible_notes are included.",
  parameters: { type: "object" as const, properties: {}, required: [] },
};

export const getPatientTreatmentsInputSchema = z.object({});

// =============================================================================
// getPatientPayments
// =============================================================================

export const getPatientPaymentsDeclaration = {
  name: "getPatientPayments",
  description:
    "Returns the patient's payment history and current outstanding balance.",
  parameters: { type: "object" as const, properties: {}, required: [] },
};

export const getPatientPaymentsInputSchema = z.object({});

// =============================================================================
// getClinicInformation
// =============================================================================

export const getClinicInformationDeclaration = {
  name: "getClinicInformation",
  description:
    "Returns clinic contact info, address, and operating hours from clinic_settings.",
  parameters: { type: "object" as const, properties: {}, required: [] },
};

export const getClinicInformationInputSchema = z.object({});

// =============================================================================
// Tool name union
// =============================================================================

export type PatientToolName =
  | "getAvailableSlots"
  | "createAppointment"
  | "rescheduleAppointment"
  | "cancelAppointment"
  | "getQueueStatus"
  | "getPatientAppointments"
  | "getPatientTreatments"
  | "getPatientPayments"
  | "getClinicInformation";

export const ALL_PATIENT_TOOL_DECLARATIONS = [
  getAvailableSlotsDeclaration,
  createAppointmentDeclaration,
  rescheduleAppointmentDeclaration,
  cancelAppointmentDeclaration,
  getQueueStatusDeclaration,
  getPatientAppointmentsDeclaration,
  getPatientTreatmentsDeclaration,
  getPatientPaymentsDeclaration,
  getClinicInformationDeclaration,
];
