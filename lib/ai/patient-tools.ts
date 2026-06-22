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
  description: "Returns open appointment slots for a given date.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      date: {
        type: SchemaType.STRING,
        description: "ISO 8601 date string (YYYY-MM-DD). Example: 2026-06-25",
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

export const createAppointmentDeclaration: FunctionDeclaration = {
  name: "createAppointment",
  description:
    "Books a new appointment for the patient. Only call this after the patient has explicitly confirmed the booking details.",
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
      confirmed: {
        type: SchemaType.BOOLEAN,
        description:
          "Must be true — patient has explicitly confirmed the booking.",
      },
    },
    required: ["scheduledAt", "confirmed"],
  },
};

export const createAppointmentInputSchema = z.object({
  scheduledAt: z.string().min(1),
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

export const rescheduleAppointmentDeclaration: FunctionDeclaration = {
  name: "rescheduleAppointment",
  description:
    "Moves an existing appointment to a new time slot. Only call after patient confirms.",
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
      confirmed: {
        type: SchemaType.BOOLEAN,
        description: "Must be true — patient has explicitly confirmed.",
      },
    },
    required: ["appointmentId", "newScheduledAt", "confirmed"],
  },
};

export const rescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string().uuid(),
  newScheduledAt: z.string().min(1),
  confirmed: z.literal(true),
});

// =============================================================================
// cancelAppointment — MUTATING, requires confirmed: true
// =============================================================================

export const cancelAppointmentDeclaration: FunctionDeclaration = {
  name: "cancelAppointment",
  description:
    "Cancels a future appointment owned by the patient. Only call after patient confirms.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      appointmentId: {
        type: SchemaType.STRING,
        description: "UUID of the appointment to cancel.",
      },
      confirmed: {
        type: SchemaType.BOOLEAN,
        description: "Must be true — patient has explicitly confirmed.",
      },
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
