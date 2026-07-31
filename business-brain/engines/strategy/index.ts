/**
 * Business Brain — Strategy Engine barrel.
 *
 * The one place in the pipeline permitted to recommend. Pure and deterministic:
 * an LLM belongs downstream of this, rephrasing a finished strategy, never
 * choosing one.
 */
export * from "./strategy-engine";
