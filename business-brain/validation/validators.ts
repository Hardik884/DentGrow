/**
 * Business Brain — Validation Utilities
 *
 * Small, reusable validation helpers that future engine modules use to
 * validate their inputs before reasoning over them. Built on Zod, which is
 * already a DentGrow dependency, for consistency with the rest of the project.
 *
 * These are generic, engine-agnostic helpers. No engine-specific schemas are
 * defined here — those live with their engines in later phases.
 */

import type { ZodType } from "zod";
import type { Confidence } from "../types";

/** A single validation problem, addressed by a dot-path within the input. */
export interface ValidationIssue {
  /** Location of the issue within the validated value (e.g. "a.b[0]"). */
  readonly path: string;
  /** Human-readable description of the problem. */
  readonly message: string;
}

/**
 * The result of validating a value against a schema.
 *
 * `valid === true`  => `data` holds the parsed, typed value.
 * `valid === false` => `issues` describe what failed and `data` is null.
 */
export interface ValidationResult<T> {
  readonly valid: boolean;
  readonly data: T | null;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Validates an unknown value against a Zod schema and returns a structured
 * {@link ValidationResult} instead of throwing.
 */
export function validateWithSchema<T>(
  schema: ZodType<T>,
  input: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { valid: true, data: parsed.data, issues: [] };
  }
  const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return { valid: false, data: null, issues };
}

/** Type guard: value is neither null nor undefined. */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** Type guard: value is a non-empty, non-whitespace string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Returns whether a number falls within the inclusive range [min, max]. */
export function isWithinRange(
  value: number,
  min: number,
  max: number,
): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Returns whether a value is a valid {@link Confidence} score in [0, 1]. */
export function isValidConfidence(value: unknown): value is Confidence {
  return typeof value === "number" && isWithinRange(value, 0, 1);
}
