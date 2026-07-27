/**
 * Business Brain — Diagnosis Engine barrel.
 *
 * The port is exported as a type contract only. Nothing in this phase implements
 * or calls it.
 */
export * from "./config/diagnosis-config";
export * from "./support/dates";
export * from "./support/signal-index";
export * from "./support/persistence";
export * from "./support/diagnosis-severity";
export * from "./support/diagnosis-confidence";
export * from "./support/discriminators";
export * from "./support/hypothesis-builder";
export * from "./support/diagnosis-builder";
export * from "./matchers/types";
export * from "./matchers/registry";
export * from "./matchers/unclustered";
export * from "./ports/diagnosis-context-port";
export * from "./diagnose";
export * from "./diagnosis-engine";
