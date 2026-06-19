"use server";

import { AIError, getGeminiModel, withAITimeout } from "@/lib/ai/gemini";
import {
  buildPatientSummaryPrompt,
  buildInsightsPrompt,
  buildCopilotSystemPrompt,
  buildPatientAssistantSystemPrompt,
} from "@/lib/ai/prompts";
import { ALL_COPILOT_TOOL_DECLARATIONS } from "@/lib/ai/tools";
import { ALL_PATIENT_TOOL_DECLARATIONS } from "@/lib/ai/patient-tools";
import type {
  ActionResult,
  CopilotMessage,
} from "@/types";

/**
 * AI Server Actions
 *
 * Architecture rules (CLAUDE.md §13.11–13.13):
 * - All AI calls are server-side only. API key NEVER exposed to client.
 * - AI features are non-blocking — failures return graceful error messages.
 * - AI models NEVER access the DB directly. All data goes through typed tool functions.
 * - Mutating tool calls require confirmed: true from the patient (see patient-tools.ts).
 * - 10-second timeout on all Gemini calls via withAITimeout.
 */

const AI_UNAVAILABLE = "AI features are temporarily unavailable. Please try again later.";

// =============================================================================
// generatePatientSummary — dentist only
// =============================================================================

export async function generatePatientSummary(
  patientId: string
): Promise<ActionResult<string>> {
  try {
    // TODO: verify dentist role
    // TODO: assemble PatientSummaryContext from DB
    // TODO: call Gemini with buildPatientSummaryPrompt(context)

    const model = getGeminiModel();

    const result = await withAITimeout(async () => {
      const response = await model.generateContent(
        buildPatientSummaryPrompt({
          name: "Placeholder",
          age: null,
          gender: null,
          totalVisits: 0,
          lastVisit: null,
          outstandingBalance: "₹0",
          treatments: [],
          followUps: [],
        })
      );
      return response.response.text();
    });

    void patientId;
    return { data: result, error: null };
  } catch (error) {
    if (error instanceof AIError) {
      return { data: null, error: AI_UNAVAILABLE };
    }
    return { data: null, error: AI_UNAVAILABLE };
  }
}

// =============================================================================
// generateInsights — dentist only
// =============================================================================

export async function generateInsights(): Promise<ActionResult<string[]>> {
  try {
    // TODO: verify dentist role
    // TODO: assemble InsightsContext (today's metrics + overdue follow-ups)
    // TODO: call Gemini with buildInsightsPrompt(context)
    // TODO: parse bullet list response into string[]

    const model = getGeminiModel();

    const result = await withAITimeout(async () => {
      const response = await model.generateContent(
        buildInsightsPrompt({
          today: new Date().toISOString().split("T")[0],
          clinicName: "Clinic",
          overdueFollowUpsCount: 0,
          metrics: {
            totalAppointmentsToday: 0,
            seenPatientsToday: 0,
            noShowsToday: 0,
            walkInsToday: 0,
            revenueToday: 0,
            revenueLastWeek: 0,
            noShowsThisWeek: 0,
            noShowsLastWeek: 0,
            walkInsThisWeek: 0,
            walkInsLastWeek: 0,
            busiestHourThisWeek: null,
          },
        })
      );
      return response.response.text();
    });

    // Split bullet list into array
    const insights = result
      .split("\n")
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);

    return { data: insights, error: null };
  } catch (error) {
    if (error instanceof AIError) {
      return { data: null, error: AI_UNAVAILABLE };
    }
    return { data: null, error: AI_UNAVAILABLE };
  }
}

// =============================================================================
// sendCopilotMessage — dentist + receptionist
// =============================================================================

export async function sendCopilotMessage(
  history: CopilotMessage[],
  message: string
): Promise<ActionResult<CopilotMessage>> {
  try {
    // TODO: verify staff role (dentist or receptionist)
    // TODO: build system prompt with CopilotSessionContext from session
    // TODO: start Gemini chat session with tool declarations
    // TODO: send message, handle tool_call loop:
    //       model calls tool → app executes tool → app passes result back → model responds
    // TODO: return final model text response

    const model = getGeminiModel();
    void model;
    void ALL_COPILOT_TOOL_DECLARATIONS;

    await withAITimeout(async () => {
      void buildCopilotSystemPrompt({
        clinicName: "Clinic",
        userName: "User",
        userRole: "dentist",
        today: new Date().toISOString().split("T")[0],
      });
    });

    void history;
    void message;

    return {
      data: { role: "model", content: "Copilot not yet implemented." },
      error: null,
    };
  } catch (error) {
    if (error instanceof AIError) {
      return { data: null, error: AI_UNAVAILABLE };
    }
    return { data: null, error: AI_UNAVAILABLE };
  }
}

// =============================================================================
// sendPatientAssistantMessage — portal patients only
// =============================================================================

export async function sendPatientAssistantMessage(
  history: CopilotMessage[],
  message: string
): Promise<ActionResult<CopilotMessage>> {
  try {
    // TODO: verify patient portal role (auth_patient_id() must not be null)
    // TODO: fetch clinic_settings for buildPatientAssistantSystemPrompt
    // TODO: start Gemini chat with patient tool declarations
    // TODO: tool-call loop — execute tools server-side, pass results back
    // TODO: mutating tools check confirmed: true before executing

    const model = getGeminiModel();
    void model;
    void ALL_PATIENT_TOOL_DECLARATIONS;

    await withAITimeout(async () => {
      void buildPatientAssistantSystemPrompt({
        clinicName: "Clinic",
        phone: null,
        email: null,
        address: null,
        clinicHours: null,
      });
    });

    void history;
    void message;

    return {
      data: { role: "model", content: "Patient assistant not yet implemented." },
      error: null,
    };
  } catch (error) {
    if (error instanceof AIError) {
      return { data: null, error: AI_UNAVAILABLE };
    }
    return { data: null, error: AI_UNAVAILABLE };
  }
}
