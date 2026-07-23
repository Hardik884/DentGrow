# Business Brain

The **Business Brain** is an independent application layer inside DentGrow
responsible for business intelligence and decision making. It turns raw clinic
data into metrics, detects meaningful signals, diagnoses root causes, proposes
constraint-valid strategies, executes and measures actions, and learns from the
results — with every decision explainable to clinic staff.

> **Phase 1 of 22 — Foundation only.**
> This phase establishes the architecture. It contains **no business logic**.
> Every engine is a documented contract that future phases implement.

---

## Purpose

- Keep business intelligence and decision logic **out of React components**.
- Give the UI a single, stable place to consume decisions and explanations.
- Let each concern evolve independently behind a small, typed contract.
- Make future phases additive — new engines slot in without refactoring the
  foundation.

---

## Architecture

The Business Brain is a pipeline of loosely coupled, single-responsibility
engines. Each engine takes a typed input plus an `ExecutionContext` and returns
a uniform `EngineResult<T>`.

```
Metrics ─▶ Signal ─▶ Diagnosis ─▶ Constraint ─▶ Strategy ─▶ Workflow
                                                              │
                                                              ▼
                              Learning ◀─ Value ◀─ Outcome ◀─ Action

                 AIExplanation  (explains outputs & decision traces across the pipeline)
```

Principles enforced by this structure:

- **UI depends on the Business Brain; never the reverse.** No engine imports
  React or any DentGrow component.
- **Single responsibility per engine.**
- **Loose coupling** — engines communicate through shared primitive types, not
  by importing each other's internals.
- **No circular dependencies** — dependency direction is one-way:
  `types → core → engines → services`, with `repositories` feeding services.
- **Strong typing throughout** and **composition over inheritance**.
- **Errors as values** — engines return `EngineError` inside `EngineResult`
  rather than throwing across boundaries.

---

## Folder Structure

```
business-brain/
├── README.md              # This document
├── index.ts               # Public API barrel (import from "@/business-brain")
├── types/                 # Shared, generic primitive types
│   ├── common.ts          # EngineResult, ExecutionContext, Evidence, Confidence,
│   │                      # Priority, Severity, DecisionTrace, EngineError
│   └── index.ts
├── domain/                # Canonical domain models (the Business Brain's vocabulary)
│   ├── shared.ts          # EntityType, RelatedEntity
│   ├── metric.ts          # Metric, MetricCategory, MetricUnit
│   ├── signal.ts          # Signal, SignalCategory
│   ├── diagnosis.ts       # Diagnosis
│   ├── constraint.ts      # Constraint, ConstraintCategory
│   ├── strategy.ts        # Strategy
│   ├── value.ts           # Value, ValueType
│   ├── action.ts          # Action, ActionType
│   ├── outcome.ts         # Outcome, OutcomeStatus
│   ├── learning.ts        # Learning
│   └── index.ts
├── core/                  # Foundational contracts everything depends on
│   ├── engine.ts          # Engine interface + BaseEngine abstract class
│   └── index.ts
├── engines/               # One contract per engine (abstract class + I/O types)
│   ├── metrics-engine.ts
│   ├── signal-engine.ts
│   ├── diagnosis-engine.ts
│   ├── constraint-engine.ts
│   ├── strategy-engine.ts
│   ├── workflow-engine.ts
│   ├── action-engine.ts
│   ├── outcome-engine.ts
│   ├── value-engine.ts
│   ├── learning-engine.ts
│   ├── ai-explanation-engine.ts
│   ├── metrics/           # MetricsEngine implementation (Phase 3)
│   │   ├── metric-ids.ts          # metric keys, descriptors, buildMetric factory
│   │   ├── calculators/           # one pure function per metric group
│   │   ├── metrics-engine.ts      # DentGrowMetricsEngine (deterministic)
│   │   └── metrics-engine.test.ts # unit tests (vitest)
│   └── index.ts
├── config/                # Feature flags, engine toggles, thresholds, AI placeholder
│   ├── config.ts
│   └── index.ts
├── validation/            # Reusable Zod-based validation utilities
│   ├── validators.ts
│   └── index.ts
├── utils/                 # Cross-cutting utilities
│   ├── logger.ts          # Centralized info/warn/error logger
│   └── index.ts
├── services/              # (reserved) Cross-engine orchestration — future phases
│   └── index.ts
└── repositories/          # Read-only data ports (no DB access here yet)
    ├── snapshots.ts       # ClinicDataSnapshot + sub-snapshot shapes
    ├── metrics-data-repository.ts  # MetricsDataRepository port (impl: future phase)
    └── index.ts
```

---

## Module Responsibilities

| Module | Responsibility |
|---|---|
| `types/` | Generic primitives shared by all engines. No business objects. |
| `core/` | The `Engine` contract and `BaseEngine`. Depends only on `types`. |
| `engines/` | A documented contract (abstract class + placeholder I/O types) for each of the 11 engines. |
| `config/` | Lightweight static config: feature flags, per-engine toggles, thresholds, AI placeholder. |
| `validation/` | Reusable input-validation helpers built on Zod. |
| `utils/` | Cross-cutting helpers, currently the centralized logger. |
| `services/` | *(reserved)* Orchestrates engines into pipelines. Empty in Phase 1. |
| `repositories/` | *(reserved)* Wraps DentGrow data access for engines. Empty in Phase 1. |

### The 11 Engines

| Engine | Responsibility |
|---|---|
| `MetricsEngine` | Compute the clinic's core KPIs from raw data. |
| `SignalEngine` | Detect anomalies/patterns in metrics and emit prioritized signals. |
| `DiagnosisEngine` | Explain *why* signals occur via root-cause diagnoses. |
| `ConstraintEngine` | Encode/evaluate real-world limits (capacity, budget, policy). |
| `StrategyEngine` | Propose constraint-valid strategies for diagnoses. |
| `WorkflowEngine` | Decompose a strategy into an ordered, executable workflow. |
| `ActionEngine` | Execute workflow steps as concrete side-effecting actions. |
| `OutcomeEngine` | Measure actual results vs. expectations after actions. |
| `ValueEngine` | Quantify the business value delivered by outcomes. |
| `LearningEngine` | Feed outcomes/value back to improve future decisions. |
| `AIExplanationEngine` | Turn outputs & decision traces into human-readable explanations. |

---

## How Future Phases Build on This Foundation

Each subsequent phase implements one engine (or supporting layer) **without
touching the foundation**:

1. Add the engine's concrete input/output types (replacing the `unknown`
   placeholders) next to its contract in `engines/`.
2. Extend the engine's abstract class and implement `execute()`.
3. Add any needed data access as a method in `repositories/`.
4. Add orchestration (multi-engine pipelines) in `services/`.
5. Opt the engine in via `config` (`engines.<name> = true`).
6. Expose results to the UI through the `@/business-brain` public barrel and,
   where mutations are involved, DentGrow's existing Server Actions.

Because engines share only generic primitive types and a uniform result
envelope, new engines integrate without breaking existing ones.

---

## Integration with DentGrow

- **Import path:** consumers use `@/business-brain` (matches the project's
  `@/*` path alias). Only the public barrel is imported — internal files are
  not reached across the boundary.
- **One-way dependency:** DentGrow (Server Components, Server Actions, UI)
  depends on the Business Brain. The Business Brain never imports React or
  DentGrow components, keeping business logic testable and UI-independent.
- **Data & side effects:** in later phases, engines read data through
  `repositories/` and cause side effects through DentGrow's existing
  `actions/` — the Business Brain consumes those, it does not own the data.
- **AI:** the `AIExplanationEngine` will wire up to the existing `lib/ai`
  (Gemini) layer in a future phase. Only a config placeholder exists now.

---

## Phase 1 Scope Confirmation

**Implemented:** folder structure, shared primitive types, engine contracts,
configuration, centralized logger, validation utilities, documentation.

**Deliberately NOT implemented:** metrics, signals, diagnosis, constraints,
strategy, workflows, actions, outcomes, value, learning, AI logic, dashboard
features, background jobs, caching, event sourcing, and database queries. These
belong to future phases.
