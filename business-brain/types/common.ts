/**
 * Business Brain — Shared Primitive Types
 *
 * Generic, engine-agnostic building blocks that every engine shares.
 *
 * IMPORTANT: These are intentionally generic. Business objects such as
 * Metrics, Signals, Diagnoses, Strategies, etc. are NOT defined here — they
 * belong to their respective engine implementation phases.
 */

/**
 * A normalized confidence score in the inclusive range [0, 1].
 * 0 = no confidence, 1 = full confidence.
 */
export type Confidence = number;

/**
 * Qualitative priority for ranking work, recommendations, or decisions.
 */
export const Priority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

/**
 * Qualitative severity for signals, issues, and diagnoses.
 */
export const Severity = {
  INFO: "info",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export type Severity = (typeof Severity)[keyof typeof Severity];

/**
 * A single piece of supporting evidence behind a decision or output.
 * The `data` field is deliberately untyped — each engine attaches its own
 * evidence payload in later phases.
 */
export interface Evidence {
  /** Stable identifier for the evidence item. */
  readonly id: string;
  /** Where this evidence originated (engine name, data source, etc.). */
  readonly source: string;
  /** Human-readable explanation of what the evidence shows. */
  readonly description: string;
  /** Optional relative weight of this evidence within a decision (0..1). */
  readonly weight?: Confidence;
  /** Optional raw payload backing the evidence. Typed in later phases. */
  readonly data?: unknown;
  /** ISO-8601 timestamp of when the evidence was captured. */
  readonly capturedAt: string;
}

/**
 * A structured, auditable record of a single reasoning step taken by an
 * engine. A sequence of traces forms an explainable decision path.
 */
export interface DecisionTrace {
  /** The engine that produced this step. */
  readonly engine: string;
  /** Short label for the reasoning step. */
  readonly step: string;
  /** Human-readable reasoning for this step. */
  readonly reasoning: string;
  /** Evidence considered during this step. */
  readonly evidence: readonly Evidence[];
  /** Optional confidence attached to this specific step. */
  readonly confidence?: Confidence;
  /** ISO-8601 timestamp of when the step was recorded. */
  readonly timestamp: string;
}

/**
 * Ambient context passed into every engine execution. Provides the tenant
 * scope and request metadata engines need without coupling them to the
 * transport (Server Action, job, webhook, etc.).
 */
export interface ExecutionContext {
  /** The clinic (tenant) the execution is scoped to. */
  readonly clinicId: string;
  /** Optional id of the user/actor that initiated the execution. */
  readonly requestedBy?: string;
  /** Optional role of the initiating actor. */
  readonly role?: string;
  /** Correlation id to trace a single logical operation across engines. */
  readonly correlationId: string;
  /** ISO-8601 timestamp marking the start of the execution. */
  readonly startedAt: string;
  /** Per-execution feature flag overrides. */
  readonly flags?: Readonly<Record<string, boolean>>;
}

/**
 * A structured error returned by an engine. Business Brain code returns
 * errors as values rather than throwing across engine boundaries.
 */
export interface EngineError {
  /** Machine-readable error code. */
  readonly code: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Optional structured details for debugging. */
  readonly details?: unknown;
}

/**
 * The uniform result envelope returned by every engine.
 *
 * `ok === true`  => `data` is populated, `error` is undefined.
 * `ok === false` => `error` is populated, `data` is null.
 */
export interface EngineResult<T> {
  /** Whether the execution succeeded. */
  readonly ok: boolean;
  /** The produced output, or null on failure. */
  readonly data: T | null;
  /** The failure reason, present only when `ok` is false. */
  readonly error?: EngineError;
  /** Optional confidence in the produced output. */
  readonly confidence?: Confidence;
  /** Optional explainability trace for the execution. */
  readonly trace?: readonly DecisionTrace[];
  /** ISO-8601 timestamp of when the result was generated. */
  readonly generatedAt: string;
}
