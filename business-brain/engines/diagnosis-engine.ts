/**
 * DiagnosisEngine
 *
 * RESPONSIBILITY:
 * Explains WHY signals are occurring by correlating signals and evidence
 * into root-cause diagnoses. It moves from "what happened" to "why".
 *
 * Consumes:  signals (from SignalEngine) + supporting evidence
 * Produces:  ranked diagnoses with confidence and supporting evidence
 *
 * This phase defines the contract only. No diagnosis logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete diagnosis input is defined later. */
export type DiagnosisEngineInput = unknown;

/** Placeholder output. The concrete diagnosis payload is defined later. */
export type DiagnosisEngineOutput = unknown;

export abstract class DiagnosisEngine extends BaseEngine<
  DiagnosisEngineInput,
  DiagnosisEngineOutput
> {
  readonly name = "DiagnosisEngine";
}
