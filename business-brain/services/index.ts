/**
 * Business Brain — Services barrel.
 *
 * Services orchestrate engines and coordinate cross-engine flows. They contain
 * orchestration only — never business logic (that belongs to the engines),
 * never data access (that is the repositories' job), and never React/UI
 * concerns.
 */

export * from "./business-brain-service";
