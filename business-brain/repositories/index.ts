/**
 * Business Brain — Repositories barrel.
 *
 * Repositories are the ONLY place the Business Brain reads clinic data. This
 * phase defines the read-only data port and snapshot shapes for the Metrics
 * Engine. Concrete, database-backed implementations are added in later phases.
 */
export * from "./snapshots";
export * from "./metrics-data-repository";
