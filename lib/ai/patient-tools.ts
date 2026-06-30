/**
 * Patient AI Assistant tool definitions — patient portal.
 *
 * FIX (400 Bad Request):
 *   The @google/generative-ai SDK requires FunctionDeclaration.parameters.type
 *   to use SchemaType enum values — not plain string literals.
 *   Property schemas inside `properties` must also use SchemaType enum values
 *   and be typed as the correct Schema sub-type.
 *   Using FunctionDeclaration import forces TypeScript to validate the shape.
 */

import { z } from "zod";
import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";

// =============================================================================
// getAvailableSlots
// =============================================================================

export const getAvailableSlotsDeclaration: FunctionDeclaration = {
  name: "getAvailableSlots",
  description: "Returns open appointment slots for a given date. IMPORTANT: Always use the current date context from the system prompt to calculate relative dates like 'today', 'tomorrow', etc. Never guess the current date.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      date: {
        type: SchemaType.STRING,
        description: "ISO 8601 date string (YYYY-MM-DD). Must be calculated from the current date context in the system prompt. Example: 2026-06-25. For 'today' use the current date, for 'tomorrow' add 1 day to current date.",
      },
    },
    required: ["date"],
  },
};

export const getAvailableSlotsInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// =============================================================================
// createAppointment — MUTATING
//
// Two-step, backend-enforced confirmation:
//   1. First call (no confirmationToken) → backend returns requiresConfirmation
//      plus a server-issued confirmationToken. NO booking happens.
//   2. After the patient explicitly confirms in a later message, call again
//      passing that confirmationToken → backend executes the booking.
// The backend rejects a token that was issued in the same turn, so a booking
// can never happen without a real patient confirmation turn.
// =============================================================================

export const createAppointmentDeclaration: FunctionDeclaration = {
  name: "createAppointment",
  description:
    "Books a new appointment for the patient. Call WITHOUT confirmationToken first to get the confirmation details, present them to the patient, and only call again WITH the returned confirmationToken after the patient explicitly confirms.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      scheduledAt: {
        type: SchemaType.STRING,
        description:
          "ISO 8601 datetime string for the slot. Example: 2026-06-25T09:00:00",
      },
      notes: {
        type: SchemaType.STRING,
        description: "Optional patient notes for the appointment.",
      },
      confirmationToken: {
        type: SchemaType.STRING,
        description:
          "The token returned by a previous createAppointment call that required confirmation. Only supply this AFTER the patient has explicitly confirmed.",
      },
    },
    required: ["scheduledAt"],
  },
};

export const createAppointmentInputSchema = z.object({
  scheduledAt: z.string().min(1),
  notes: z.string().max(500).optional(),
  confirmationToken: z.string().optional(),
});

// =============================================================================
// rescheduleAppointment — MUTATING (backend-enforced confirmation)
// =============================================================================

export const rescheduleAppointmentDeclaration: FunctionDeclaration = {
  name: "rescheduleAppointment",
  description:
    "Moves an existing appointment to a new time slot. Call WITHOUT confirmationToken first to get confirmation details, present them, then call again WITH the returned confirmationToken after the patient confirms.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      appointmentId: {
        type: SchemaType.STRING,
        description: "UUID of the appointment to reschedule.",
      },
      newScheduledAt: {
        type: SchemaType.STRING,
        description:
          "ISO 8601 datetime for the new slot. Example: 2026-06-25T10:00:00",
      },
      confirmationToken: {
        type: SchemaType.STRING,
        description:
          "Token from a previous rescheduleAppointment call that required confirmation. Only supply AFTER the patient explicitly confirms.",
      },
    },
    required: ["appointmentId", "newScheduledAt"],
  },
};

export const rescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string().uuid(),
  newScheduledAt: z.string().min(1),
  confirmationToken: z.string().optional(),
});

// =============================================================================
// cancelAppointment — MUTATING (backend-enforced confirmation)
// =============================================================================

export const cancelAppointmentDeclaration: FunctionDeclaration = {
  name: "cancelAppointment",
  description:
    "Cancels a future appointment owned by the patient. Call WITHOUT confirmationToken first to get confirmation details, present them, then call again WITH the returned confirmationToken after the patient confirms.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      appointmentId: {
        type: SchemaType.STRING,
        description: "UUID of the appointment to cancel.",
      },
      confirmationToken: {
        type: SchemaType.STRING,
        description:
          "Token from a previous cancelAppointment call that required confirmation. Only supply AFTER the patient explicitly confirms.",
      },
    },
    required: ["appointmentId"],
  },
};

export const cancelAppointmentInputSchema = z.object({
  appointmentId: z.string().uuid(),
  confirmationToken: z.string().optional(),
});

// =============================================================================
// getQueueStatus
// =============================================================================

export const getQueueStatusDeclaration: FunctionDeclaration = {
  name: "getQueueStatus",
  description:
    "Returns the patient's current queue position, number of patients ahead, and estimated wait time.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

export const getQueueStatusInputSchema = z.object({});

// =============================================================================
// getPatientAppointments
// =============================================================================

export const getPatientAppointmentsDeclaration: FunctionDeclaration = {
  name: "getPatientAppointments",
  description: "Returns the patient's upcoming and past appointments.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

export const getPatientAppointmentsInputSchema = z.object({});

// =============================================================================
// getPatientTreatments
// =============================================================================

export const getPatientTreatmentsDeclaration: FunctionDeclaration = {
  name: "getPatientTreatments",
  description:
    "Returns the patient's treatment history. Only patient-visible notes are included.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

export const getPatientTreatmentsInputSchema = z.object({});

// =============================================================================
// getPatientPayments
// =============================================================================

export const getPatientPaymentsDeclaration: FunctionDeclaration = {
  name: "getPatientPayments",
  description:
    "Returns the patient's payment history and current outstanding balance.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

export const getPatientPaymentsInputSchema = z.object({});

// =============================================================================
// getClinicInformation
// =============================================================================

export const getClinicInformationDeclaration: FunctionDeclaration = {
  name: "getClinicInformation",
  description:
    "Returns clinic contact info, address, phone number, email, and operating hours.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
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

export const ALL_PATIENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
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
