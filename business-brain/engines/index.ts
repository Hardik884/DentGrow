/**
 * Business Brain — Engines barrel.
 *
 * Exposes the contract (abstract class + placeholder I/O types) for every
 * engine. Concrete implementations are provided by their respective phases.
 *
 * Pipeline order (conceptual):
 *   Metrics -> Signal -> Diagnosis -> Constraint -> Strategy ->
 *   Workflow -> Action -> Outcome -> Value -> Learning
 * with AIExplanation providing human-readable explanations across the pipeline.
 */
export * from "./metrics-engine";
export * from "./metrics";
export * from "./signal-engine";
export * from "./diagnosis-engine";
export * from "./constraint-engine";
export * from "./strategy-engine";
export * from "./workflow-engine";
export * from "./action-engine";
export * from "./outcome-engine";
export * from "./value-engine";
export * from "./learning-engine";
export * from "./ai-explanation-engine";
