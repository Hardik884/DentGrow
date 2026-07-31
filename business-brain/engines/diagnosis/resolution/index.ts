/**
 * Business Brain — Diagnosis Engine: entity-level resolution barrel.
 *
 * Pure throughout. The rows are fetched by the caller and passed in; nothing
 * here reads a clock or touches a database, so the eslint purity boundary over
 * `engines/diagnosis/**` holds unchanged.
 */
export * from "./types";
export * from "./resolvers";
export * from "./resolve";
