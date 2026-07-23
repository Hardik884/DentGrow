/**
 * AIExplanationEngine
 *
 * RESPONSIBILITY:
 * Turns structured Business Brain outputs and decision traces into clear,
 * human-readable explanations for clinic staff. It is the presentation-facing
 * reasoning layer — it explains decisions, it does not make them.
 *
 * Consumes:  decision traces + engine outputs
 * Produces:  natural-language explanations
 *
 * This phase defines the contract only. No AI logic is implemented; the AI
 * provider (e.g. Gemini via lib/ai) is wired up in a future phase.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete explanation input is defined later. */
export type AIExplanationEngineInput = unknown;

/** Placeholder output. The concrete explanation payload is defined later. */
export type AIExplanationEngineOutput = unknown;

export abstract class AIExplanationEngine extends BaseEngine<
  AIExplanationEngineInput,
  AIExplanationEngineOutput
> {
  readonly name = "AIExplanationEngine";
}
