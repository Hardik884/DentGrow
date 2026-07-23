/**
 * Business Brain — Public API
 *
 * The single entry point for the rest of DentGrow. UI and Server Actions
 * import from `@/business-brain` and depend only on what is re-exported here.
 *
 * Dependency direction is strictly one-way:
 *   DentGrow (UI / actions)  ->  Business Brain
 * The Business Brain never imports React components or DentGrow UI.
 */

export * from "./types";
export * from "./domain";
export * from "./core";
export * from "./engines";
export * from "./config";
export * from "./validation";
export * from "./utils";
