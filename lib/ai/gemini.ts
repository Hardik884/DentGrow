import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Gemini client initialisation.
 *
 * - Uses Gemini 3.1 Flash Lite model.
 * - All calls are server-side only. API key is never exposed to the client.
 * - Wraps calls with a configurable timeout (default 10s per CLAUDE.md §13.11).
 * - On timeout or Gemini error, throws a typed AIError for the Server Action
 *   to catch and return as { data: null, error: 'AI features are temporarily unavailable' }.
 */

const AI_TIMEOUT_MS = 10_000;

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
 */
export function getGeminiModel() {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new AIError("GOOGLE_AI_API_KEY is not configured");
  }

  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }

  // gemini-2.0-flash-lite is the current stable model matching the
  // "Gemini Flash Lite" series used in DentGrow MVP.
  // Update to gemini-3.1-flash-lite when the model ID is confirmed by Google.
  return _genAI.getGenerativeModel({
    model: "gemini-2.0-flash-lite",
    generationConfig: {
      temperature: 0.3,       // low temperature for factual, reliable responses
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  });
}

/**
 * withAITimeout
 *
 * Wraps any async AI call with a timeout.
 * Throws AIError if the call exceeds AI_TIMEOUT_MS.
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
    throw new AIError("AI request failed", error);
  }
}
