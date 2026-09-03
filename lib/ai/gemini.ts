import { GoogleGenerativeAI } from "@google/generative-ai";
import { assertPromptIsSafe, PromptSafetyError, type WaivableRule } from "./redaction";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * The AI provider, isolated behind one module.
 *
 * WHICH PROVIDER, AND WHAT THAT MEANS — STATED PLAINLY
 *   This is the Google **Gemini Developer API** (`generativelanguage.
 *   googleapis.com`), reached with an API key. It is NOT Vertex AI.
 *
 *   The practical difference is governance, not capability. Vertex AI is where
 *   Google Cloud's data-processing terms, regional endpoints and enterprise
 *   controls live; the Developer API offers none of those. So today OraMedha
 *   has:
 *     - no Data Processing Agreement with Google;
 *     - no established position on retention;
 *     - no verified position on whether submitted data may be used to improve
 *       Google's models — which depends on the billing tier this key sits on
 *       and has not been confirmed;
 *     - no control over the region the request is served from.
 *
 *   None of that is fixed by code, and none of it is claimed to be. What code
 *   CAN do is make the question smaller: send less. Every prompt now goes
 *   through assertPromptIsSafe() below, and the patient-summary prompt no
 *   longer carries a name. See docs/AI-DATA-HANDLING.md for the migration path
 *   to Vertex AI and what it would and would not settle.
 *
 * WHY THE PROVIDER IS BEHIND THIS MODULE
 *   Every AI feature calls getGeminiModel() and nothing else constructs a
 *   client, so switching provider is a change to this file rather than a search
 *   across the codebase — and the outbound-prompt check cannot be bypassed by
 *   a new feature that forgets it exists.
 *
 * Gemini client initialisation.
 *
 * - Uses gemini-3.1-flash-lite (GA, May 2026).
 * - All calls are server-side only. API key is never exposed to the client.
 * - Wraps calls with a configurable timeout (default 15s).
 * - On timeout or Gemini error, throws a typed AIError so the Server Action
 *   can return { data: null, error: 'AI features are temporarily unavailable' }.
 *
 * NOTE on generationConfig:
 *   Do NOT set generationConfig at getGenerativeModel() level when using
 *   tool-calling (startChat with tools). Pass it per-request inside
 *   startChat() or generateContent() instead. Setting it at model-init level
 *   conflicts with the function-calling config in newer API versions and
 *   produces 400 errors.
 */

const AI_TIMEOUT_MS = 15_000;

/**
 * Typed error for AI call failures (timeout + API errors).
 * Caught in actions/ai.ts to return graceful fallback messages.
 */
export class AIError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AIError";
  }
}

let _genAI: GoogleGenerativeAI | null = null;

/**
 * getGeminiModel
 *
 * Returns the configured Gemini model instance.
 * Lazily initialises the SDK client on first call.
 * Called exclusively from Server Actions and Route Handlers.
 *
 * No generationConfig here — pass it per-call to avoid conflicts with
 * tool declarations in startChat().
 */
export function getGeminiModel() {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new AIError("GOOGLE_AI_API_KEY is not configured");
  }

  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }

  return _genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
  });
}

/**
 * guardOutboundPrompt
 *
 * The single checkpoint every prompt passes before it can leave the building.
 *
 * It rejects secrets outright — a Supabase service key or a JWT interpolated
 * into a prompt would be handed to a third party in plaintext and written to
 * their logs — and rejects contact identifiers unless the call site has
 * explicitly waived that rule and said why.
 *
 * Throwing rather than redacting is deliberate. A silently rewritten prompt
 * hides the bug that produced it; a thrown one surfaces it, and every AI
 * feature already degrades to a non-blocking message when a call fails
 * (CLAUDE.md §13.11), so the cost of being wrong in this direction is one
 * missing summary rather than a leak.
 */
export function guardOutboundPrompt(
  prompt: string,
  waived: readonly WaivableRule[] = []
): string {
  try {
    assertPromptIsSafe(prompt, waived);
  } catch (error) {
    if (error instanceof PromptSafetyError) {
      // A withheld prompt means a call site built one containing an identifier
      // or a credential. That is a defect that needs finding, not a transient
      // fault, so it is raised as a security event rather than only failing the
      // request. The VIOLATION NAME is recorded; the prompt is not, because the
      // prompt is the thing that must not be written down.
      recordSecurityEvent("AI_PROMPT_WITHHELD", {
        reason: error.violation,
        surface: "ai-provider",
      });
    }
    throw error;
  }

  return prompt;
}

/**
 * withAITimeout
 *
 * Wraps any async AI call with a timeout.
 * Throws AIError if the call exceeds timeoutMs.
 */
export async function withAITimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = AI_TIMEOUT_MS
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new AIError("AI request timed out")),
      timeoutMs
    )
  );

  try {
    return await Promise.race([fn(), timeout]);
  } catch (error) {
    if (error instanceof AIError) throw error;
    // Log the real error — never swallow silently
    console.error("[AI] Request failed:", error);
    throw new AIError("AI request failed", error);
  }
}
