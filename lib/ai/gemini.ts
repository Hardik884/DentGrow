import { GoogleGenerativeAI } from "@google/generative-ai";

/**
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
