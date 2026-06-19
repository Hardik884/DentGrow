/**
 * Clinic Copilot tool definitions — staff (dentist + receptionist).
 *
 * Architecture (CLAUDE.md §13.13):
 * - The Gemini model declares which tool it needs via function calling.
 * - The application (Server Action) executes the tool server-side.
 * - The model receives only the structured result — never raw DB data or credentials.
 * - All tool inputs from the model are validated with Zod before any DB call.
 *
 * Each tool export has two parts:
 * 1. `declaration` — the JSON schema description passed to Gemini for function calling.
 * 2. `execute` — the server-side function that performs the actual data fetch.
 *    Placeholder implementations here; full logic in actions/*.ts.
 */

import { z } from "zod";

// =============================================================================
// getTodayAppointments
// =============================================================================

export const getTodayAppointmentsDeclaration = {
  name: "getTodayAppointments",
  description: "Returns all appointments scheduled for today at the clinic.",
  parameters: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export const getTodayAppointmentsInputSchema = z.object({});
export type GetTodayAppointmentsInput = z.infer<typeof getTodayAppointmentsInputSchema>;

// =============================================================================
// getPendingPayments
// =============================================================================

export const getPendingPaymentsDeclaration = {
  name: "getPendingPayments",
  description: "Returns a list of patients with outstanding balance greater than zero.",
  parameters: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export const getPendingPaymentsInputSchema = z.object({});
export type GetPendingPaymentsInput = z.infer<typeof getPendingPaymentsInputSchema>;

// =============================================================================
// getNoShowTrends
// =============================================================================

export const getNoShowTrendsDeclaration = {
  name: "getNoShowTrends",
  description: "Returns no-show appointment counts for the specified number of days.",
  parameters: {
    type: "object" as const,
    properties: {
      days: {
        type: "number",
        description: "Number of past days to analyse. Default 7.",
      },
    },
    required: [],
  },
};

export const getNoShowTrendsInputSchema = z.object({
  days: z.number().int().positive().max(90).default(7),
});
export type GetNoShowTrendsInput = z.infer<typeof getNoShowTrendsInputSchema>;

// =============================================================================
// getPatientHistory
// =============================================================================

export const getPatientHistoryDeclaration = {
  name: "getPatientHistory",
  description:
    "Returns appointment and treatment history for a patient identified by name or phone.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Patient name or phone number (partial match supported).",
      },
    },
    required: ["query"],
  },
};

export const getPatientHistoryInputSchema = z.object({
  query: z.string().min(2).max(100),
});
export type GetPatientHistoryInput = z.infer<typeof getPatientHistoryInputSchema>;

// =============================================================================
// getWalkInStats
// =============================================================================

export const getWalkInStatsDeclaration = {
  name: "getWalkInStats",
  description: "Returns walk-in appointment counts for the specified period.",
  parameters: {
    type: "object" as const,
    properties: {
      days: {
        type: "number",
        description: "Number of past days. Default 7.",
      },
    },
    required: [],
  },
};

export const getWalkInStatsInputSchema = z.object({
  days: z.number().int().positive().max(90).default(7),
});
export type GetWalkInStatsInput = z.infer<typeof getWalkInStatsInputSchema>;

// =============================================================================
// Tool name union — for type-safe dispatch in actions/ai.ts
// =============================================================================

export type CopilotToolName =
  | "getTodayAppointments"
  | "getPendingPayments"
  | "getNoShowTrends"
  | "getPatientHistory"
  | "getWalkInStats";

export const ALL_COPILOT_TOOL_DECLARATIONS = [
  getTodayAppointmentsDeclaration,
  getPendingPaymentsDeclaration,
  getNoShowTrendsDeclaration,
  getPatientHistoryDeclaration,
  getWalkInStatsDeclaration,
];
