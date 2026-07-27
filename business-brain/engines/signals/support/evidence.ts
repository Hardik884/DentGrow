/**
 * Business Brain — Signal Engine: evidence
 *
 * Evidence states measurements. It never states causes, implications, or
 * advice — diagnosis and recommendation are later phases and must not leak
 * into this one.
 *
 * All formatting is hand-rolled rather than locale-based, so output bytes do
 * not depend on the host environment.
 */

import { MetricUnit } from "../../../domain";
import type { Evidence } from "../../../types";
import { round2 } from "./numbers";

/** A named, unit-qualified measurement used inside evidence. */
export interface Measurement {
  readonly label: string;
  readonly value: number;
  readonly unit: MetricUnit;
}

/** Group the integer part in threes: 1234567 -> "1,234,567". */
function groupDigits(integerPart: string): string {
  let out = "";
  for (let i = 0; i < integerPart.length; i++) {
    if (i > 0 && (integerPart.length - i) % 3 === 0) out += ",";
    out += integerPart[i];
  }
  return out;
}

function formatNumber(value: number, decimals: number): string {
  const rounded = round2(value);
  const negative = rounded < 0;
  const fixed = Math.abs(rounded).toFixed(decimals);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = groupDigits(intPart);
  const body = fracPart ? `${grouped}.${fracPart}` : grouped;
  return negative ? `-${body}` : body;
}

/** Render a value in its unit, deterministically. */
export function formatValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case MetricUnit.CURRENCY:
      return `INR ${formatNumber(value, Number.isInteger(round2(value)) ? 0 : 2)}`;
    case MetricUnit.PERCENTAGE:
      return `${formatNumber(value, 2)}%`;
    case MetricUnit.MINUTES:
      return `${formatNumber(value, Number.isInteger(round2(value)) ? 0 : 2)} min`;
    case MetricUnit.HOURS:
      return `${formatNumber(value, 2)} h`;
    case MetricUnit.DAYS:
      return `${formatNumber(value, 2)} d`;
    case MetricUnit.RATIO:
      return formatNumber(value, 2);
    case MetricUnit.COUNT:
    default:
      return formatNumber(value, 0);
  }
}

/** Render a measurement as `Label = value`. */
export function formatMeasurement(measurement: Measurement): string {
  return `${measurement.label} = ${formatValue(measurement.value, measurement.unit)}`;
}

/** Source attributed to every piece of evidence this engine produces. */
export const EVIDENCE_SOURCE = "SignalEngine";

/**
 * Build one evidence item with a stable id (`<signalId>#<slug>`) and the
 * injected capture timestamp.
 */
export function buildEvidence(params: {
  readonly signalId: string;
  readonly slug: string;
  readonly description: string;
  readonly capturedAt: string;
  readonly data?: unknown;
}): Evidence {
  return {
    id: `${params.signalId}#${params.slug}`,
    source: EVIDENCE_SOURCE,
    description: params.description,
    data: params.data,
    capturedAt: params.capturedAt,
  };
}
