/**
 * Business Brain — Signal Engine: metric index
 *
 * Lookup by metric KEY, never by full metric id. `Metric.id` is
 * `key:clinicId:date`, so evaluators that string-matched an id would break the
 * moment the clinic or date changed.
 *
 * The index also owns input validation: single-clinic enforcement, duplicate
 * resolution (latest timestamp wins), and rejection of non-finite values.
 */

import type { Metric } from "../../../domain";
import type { EngineError } from "../../../types";
import { METRIC_DESCRIPTORS, MetricKey } from "../../metrics/metric-ids";
import { isUsableNumber } from "./numbers";

/** Typed error codes this engine can return. */
export const SignalEngineErrorCode = {
  MIXED_CLINIC: "SIGNAL_ENGINE_MIXED_CLINIC",
} as const;

export type SignalEngineErrorCode =
  (typeof SignalEngineErrorCode)[keyof typeof SignalEngineErrorCode];

/** Something noteworthy but non-fatal that happened while indexing. */
export interface MetricIndexWarning {
  readonly code: string;
  readonly message: string;
}

/** A set of metrics guaranteed to contain every requested key. */
export interface MetricSet {
  /** The metric for a key that was part of the satisfied request. */
  metric(key: MetricKey): Metric;
  /** The numeric value for a key that was part of the satisfied request. */
  value(key: MetricKey): number;
  /** Every metric in the set, in requested order. */
  readonly all: readonly Metric[];
  /** Full metric ids (`key:clinicId:date`) of every metric in the set. */
  readonly ids: readonly string[];
}

/** Outcome of asking the index for a group of required keys. */
export type RequireOutcome =
  | { readonly ok: true; readonly metrics: MetricSet }
  | { readonly ok: false; readonly missing: readonly MetricKey[] };

/** Key-addressable view over one clinic-day's metrics. */
export interface MetricIndex {
  /** The single clinic all indexed metrics belong to, if it could be resolved. */
  readonly clinicId: string | null;
  /** Non-fatal indexing observations, surfaced in the engine trace. */
  readonly warnings: readonly MetricIndexWarning[];
  /** Number of usable metrics held. */
  readonly size: number;
  /** Look up one metric, or undefined when it is absent/unusable. */
  get(key: MetricKey): Metric | undefined;
  /** Whether a usable metric exists for the key. */
  has(key: MetricKey): boolean;
  /** Demand a group of keys; reports exactly which ones are missing. */
  require(...keys: readonly MetricKey[]): RequireOutcome;
}

/** Building a metric index either succeeds or yields a typed engine error. */
export type BuildMetricIndexResult =
  | { readonly ok: true; readonly index: MetricIndex }
  | { readonly ok: false; readonly error: EngineError };

const KNOWN_KEYS: ReadonlySet<string> = new Set(Object.keys(METRIC_DESCRIPTORS));

const NAME_TO_KEY: ReadonlyMap<string, MetricKey> = new Map(
  Object.values(METRIC_DESCRIPTORS).map((d) => [d.name, d.key] as const),
);

interface ParsedMetricId {
  readonly key: string;
  readonly clinicId: string;
  readonly date: string;
}

/** Split `key:clinicId:date` without assuming the date has no colons. */
function parseMetricId(id: string): ParsedMetricId | null {
  const firstColon = id.indexOf(":");
  if (firstColon <= 0) return null;
  const rest = id.slice(firstColon + 1);
  const secondColon = rest.indexOf(":");
  if (secondColon <= 0) return null;
  return {
    key: id.slice(0, firstColon),
    clinicId: rest.slice(0, secondColon),
    date: rest.slice(secondColon + 1),
  };
}

/** Resolve a metric to its key via its id, falling back to its descriptor name. */
function resolveKey(metric: Metric, parsed: ParsedMetricId | null): MetricKey | null {
  if (parsed && KNOWN_KEYS.has(parsed.key)) return parsed.key as MetricKey;
  return NAME_TO_KEY.get(metric.name) ?? null;
}

/**
 * Index a batch of metrics by key.
 *
 * - Metrics from more than one clinic (including a clinic other than
 *   `expectedClinicId`) fail with `SIGNAL_ENGINE_MIXED_CLINIC`.
 * - Duplicate keys resolve to the latest `timestamp`; ties keep the first
 *   occurrence, so identical input always produces an identical index.
 * - NaN/Infinity values are treated as absent and recorded as a warning.
 * - Unrecognised keys are dropped without throwing.
 */
export function buildMetricIndex(
  metrics: readonly Metric[],
  expectedClinicId?: string,
): BuildMetricIndexResult {
  const warnings: MetricIndexWarning[] = [];
  const byKey = new Map<MetricKey, Metric>();
  const clinicIds = new Set<string>();
  if (expectedClinicId) clinicIds.add(expectedClinicId);

  for (const metric of metrics) {
    const parsed = parseMetricId(metric.id);
    if (parsed) clinicIds.add(parsed.clinicId);

    const key = resolveKey(metric, parsed);
    if (!key) {
      warnings.push({
        code: "UNKNOWN_METRIC_KEY",
        message: `Ignored unrecognised metric "${metric.id}".`,
      });
      continue;
    }

    if (!isUsableNumber(metric.value)) {
      warnings.push({
        code: "NON_FINITE_METRIC_VALUE",
        message: `Treated metric "${key}" as absent: value is not finite.`,
      });
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, metric);
      continue;
    }
    warnings.push({
      code: "DUPLICATE_METRIC_KEY",
      message: `Duplicate metric "${key}": kept the latest timestamp.`,
    });
    if (metric.timestamp > existing.timestamp) byKey.set(key, metric);
  }

  if (clinicIds.size > 1) {
    return {
      ok: false,
      error: {
        code: SignalEngineErrorCode.MIXED_CLINIC,
        message:
          "Signal Engine received metrics for more than one clinic. Signals are always scoped to a single clinic.",
        details: { clinicIds: [...clinicIds].sort() },
      },
    };
  }

  return { ok: true, index: createIndex(byKey, [...clinicIds][0] ?? null, warnings) };
}

function createIndex(
  byKey: ReadonlyMap<MetricKey, Metric>,
  clinicId: string | null,
  warnings: readonly MetricIndexWarning[],
): MetricIndex {
  return {
    clinicId,
    warnings,
    size: byKey.size,
    get: (key) => byKey.get(key),
    has: (key) => byKey.has(key),
    require: (...keys) => {
      const missing = keys.filter((key) => !byKey.has(key));
      if (missing.length > 0) return { ok: false, missing };
      const all = keys.map((key) => byKey.get(key) as Metric);
      return { ok: true, metrics: createMetricSet(keys, all) };
    },
  };
}

function createMetricSet(keys: readonly MetricKey[], all: readonly Metric[]): MetricSet {
  const lookup = new Map<MetricKey, Metric>(keys.map((key, i) => [key, all[i]]));
  const metric = (key: MetricKey): Metric => {
    const found = lookup.get(key);
    if (!found) {
      // Programming error: the key was not part of the satisfied request.
      // Thrown, not returned, because the engine isolates evaluator throws.
      throw new Error(`Metric "${key}" was not requested from this metric set.`);
    }
    return found;
  };
  return {
    metric,
    value: (key) => metric(key).value,
    all,
    ids: all.map((m) => m.id),
  };
}
