/**
 * Business Brain — Strategy Engine
 *
 * The first component in the pipeline permitted to say what to do.
 *
 * Everything upstream is held to silence on that point, by an executable test:
 * `no-advice.spec.ts` scans every string the Metrics, Signal and Diagnosis
 * engines can emit against nine advisory patterns and asserts zero matches. That
 * boundary was never squeamishness — it was so that when advice finally appears,
 * it appears in exactly one place, with its reasoning attached and its licence
 * to speak clearly bounded.
 *
 * ## The rule that keeps this honest
 *
 * A strategy may only propose ACTING on something the engine actually settled.
 *
 * The Diagnosis Engine leaves a hypothesis `undetermined` when it could not tell
 * which of several explanations fits. Advising a fix for an undetermined cause
 * is guessing dressed as analysis — and worse, it is confident guessing, because
 * it arrives in the same voice as the findings that were genuinely established.
 *
 * So the engine emits two kinds of strategy, and never confuses them:
 *
 *   corrective   the diagnosis settled a cause; act on that cause
 *   investigative the diagnosis could not settle it; the proposal is to obtain
 *                the missing measurement, and the discriminator already names
 *                exactly which one
 *
 * An investigative strategy is not a lesser output. "We know the schedule is
 * leaking and we cannot yet tell why; here is the measurement that would tell
 * us" is a genuinely useful thing to be told, and it is the truth.
 *
 * ## Still deterministic
 *
 * No model, no clock, no I/O. Same constraints and diagnoses produce the same
 * strategies, byte for byte. An LLM belongs downstream of this, rephrasing a
 * finished strategy — the same arrangement the AI explanation layer already has
 * with diagnoses.
 */

import {
  ConstraintCategory,
  type Constraint,
  type Diagnosis,
  type Hypothesis,
  type Strategy,
} from "../../domain";
import { Priority, Severity } from "../../types";

/** How a strategy earns its place. */
export const StrategyKind = {
  /** Acts on a cause the engine established. */
  CORRECTIVE: "corrective",
  /** Obtains a measurement the engine could not take. */
  INVESTIGATIVE: "investigative",
} as const;

export type StrategyKind = (typeof StrategyKind)[keyof typeof StrategyKind];

/**
 * A strategy, with the reasoning that licensed it.
 *
 * Extends the domain `Strategy` rather than replacing it: the extra fields are
 * what make the recommendation auditable, and a caller that only wants the
 * domain shape can ignore them.
 */
export interface ReasonedStrategy extends Strategy {
  readonly kind: StrategyKind;
  /** Hypothesis ids this acts on — empty for an investigative strategy. */
  readonly basedOn: readonly string[];
  /** Diagnosis ids behind it, so a reader can trace back to the evidence. */
  readonly diagnosisIds: readonly string[];
  /**
   * Why this was proposed, stated as the finding rather than the remedy. Lets a
   * dentist judge the recommendation instead of taking it on trust.
   */
  readonly rationale: string;
}

const SEVERITY_TO_PRIORITY: Readonly<Record<string, Priority>> = {
  [Severity.CRITICAL]: Priority.CRITICAL,
  [Severity.HIGH]: Priority.HIGH,
  [Severity.MEDIUM]: Priority.MEDIUM,
  [Severity.LOW]: Priority.LOW,
  [Severity.INFO]: Priority.LOW,
};

const PRIORITY_RANK: Readonly<Record<string, number>> = {
  [Priority.CRITICAL]: 3,
  [Priority.HIGH]: 2,
  [Priority.MEDIUM]: 1,
  [Priority.LOW]: 0,
};

/**
 * What to do about a settled cause.
 *
 * Keyed by hypothesis slug — the same slugs the matchers declare — so a
 * recommendation is bound to the specific explanation the engine established,
 * not to the pattern in general. A pattern can be reached by several routes, and
 * "the schedule is leaking" warrants different responses depending on whether
 * patients cancelled early or did not turn up at all.
 *
 * A slug absent from this table produces no corrective strategy. That is the
 * safe direction: an unrecognised cause yields silence rather than generic
 * advice that happens to fit the category.
 */
const CORRECTIVE_BY_HYPOTHESIS: Readonly<
  Record<string, { title: string; description: string }>
> = {
  cancellation_dominant: {
    title: "Recover the slots that are released early",
    description:
      "Lost appointments were predominantly cancellations made with enough notice to refill the slot. A short list of patients waiting for an earlier date makes those releases recoverable rather than lost.",
  },
  no_show_dominant: {
    title: "Confirm attendance before the appointment",
    description:
      "Lost appointments were predominantly no-shows, where the slot was held until the appointment time and then went unused. Confirming the day before is what converts a silent loss into a slot released early enough to refill.",
  },
  patient_level_pattern: {
    title: "Handle the repeat non-attenders differently",
    description:
      "Non-attendance is concentrated among patients who have missed before, rather than spread across the patient base. A different booking arrangement for that small group addresses the losses without changing anything for everyone else.",
  },
  slot_clustering: {
    title: "Look at the times and treatments that are being lost",
    description:
      "Losses concentrate in particular appointment times or treatment types rather than falling evenly across the day, so the pattern is in what is being booked rather than in the patients booking it.",
  },
  unconverted_demand: {
    title: "Book the treatment that has already been accepted",
    description:
      "Accepted treatment is waiting while chair time went unused on the same day. The demand exists and has been agreed; what is missing is the appointment.",
  },
  insufficient_demand: {
    title: "Bring patients back before filling new capacity",
    description:
      "Chair time went unused and the accepted-treatment pipeline is thin, so the shortfall is in patients to see rather than in time to see them.",
  },
  capacity_not_offered: {
    title: "Open chair time before treating the day as quiet",
    description:
      "No bookable chair time was published for this day, so an empty schedule reflects what was offered rather than what patients wanted.",
  },
  uncollected: {
    title: "Collect for the work already delivered",
    description:
      "Treatments were completed and the money against them has not arrived. The work is done; the shortfall is in collection rather than in what was charged.",
  },
  case_mix: {
    title: "Look at what is being treated, not what is being collected",
    description:
      "Revenue is lower because the work completed was lower-value, not because it went unpaid. Collection is not the limiting factor here.",
  },
  overrunning: {
    title: "Book the time appointments actually take",
    description:
      "Appointments are consistently running past their booked length, so the queue builds from durations that are too short on paper rather than from patients arriving together.",
  },
  arrival_bunching: {
    title: "Spread arrivals across the session",
    description:
      "Patients are arriving together rather than across the session, and the queue forms from arrival timing rather than from appointments overrunning.",
  },
};

/** A constraint with no settled cause still deserves a stated direction. */
const INVESTIGATIVE_BY_CATEGORY: Readonly<Record<ConstraintCategory, string>> = {
  [ConstraintCategory.CAPACITY]: "why chair time is going unused",
  [ConstraintCategory.SCHEDULING]: "why booked appointments are being lost",
  [ConstraintCategory.REVENUE_LEAKAGE]: "why delivered work is not turning into money",
  [ConstraintCategory.TREATMENT_ACCEPTANCE]: "why accepted treatment is not being booked",
  [ConstraintCategory.RETENTION]: "why patients are not coming back",
  [ConstraintCategory.ACQUISITION]: "why fewer new patients are arriving",
};

/** Hypothesis slug from its `<diagnosisId>#h.<slug>` id. */
function slugOf(hypothesis: Hypothesis): string {
  const at = hypothesis.id.lastIndexOf("#h.");
  return at === -1 ? hypothesis.id : hypothesis.id.slice(at + 3);
}

export interface StrategyResult {
  readonly strategies: readonly ReasonedStrategy[];
}

/**
 * Propose strategies for the clinic's constraints.
 *
 * At most one corrective strategy per settled cause, and at most one
 * investigative strategy per constraint. The cap matters: a list long enough to
 * need triage is a list nobody acts on, and a constraint that produced four
 * plausible suggestions has told the dentist less than one that produced a
 * single grounded one.
 */
export function proposeStrategies(
  constraints: readonly Constraint[],
  diagnoses: readonly Diagnosis[],
  clinicId: string,
  date: string,
  now: string,
): StrategyResult {
  const byId = new Map(diagnoses.map((d) => [d.id, d]));
  const strategies: ReasonedStrategy[] = [];

  for (const constraint of constraints) {
    const related = (constraint.relatedDiagnosisIds ?? [])
      .map((id) => byId.get(id))
      .filter((d): d is Diagnosis => d !== undefined);

    const priority = SEVERITY_TO_PRIORITY[constraint.severity] ?? Priority.LOW;

    // ── Corrective: one per settled cause ────────────────────────────────────
    // Deduplicated by slug, because the same cause can be established by more
    // than one diagnosis and a clinic should be told it once.
    const settled = new Map<string, { hypothesis: Hypothesis; diagnosisIds: string[] }>();
    for (const diagnosis of related) {
      for (const hypothesis of diagnosis.hypotheses) {
        if (hypothesis.status !== "supported") continue;
        const slug = slugOf(hypothesis);
        const existing = settled.get(slug);
        if (existing === undefined) {
          settled.set(slug, { hypothesis, diagnosisIds: [diagnosis.id] });
        } else {
          existing.diagnosisIds.push(diagnosis.id);
        }
      }
    }

    for (const slug of [...settled.keys()].sort()) {
      const template = CORRECTIVE_BY_HYPOTHESIS[slug];
      // An unrecognised cause yields nothing rather than something generic.
      if (template === undefined) continue;
      const entry = settled.get(slug);
      if (entry === undefined) continue;

      strategies.push({
        id: `strategy.${constraint.category}.${slug}:${clinicId}:${date}`,
        title: template.title,
        description: template.description,
        constraintId: constraint.id,
        priority,
        kind: StrategyKind.CORRECTIVE,
        basedOn: [entry.hypothesis.id],
        diagnosisIds: [...entry.diagnosisIds].sort(),
        rationale: entry.hypothesis.statement,
        createdAt: now,
      });
    }

    // ── Investigative: only when nothing was settled ─────────────────────────
    // Withheld once a cause is established, so a clinic that has an answer is
    // not simultaneously told to go looking for one.
    const hasCorrective = strategies.some((s) => s.constraintId === constraint.id);
    if (hasCorrective) continue;

    // The discriminators already name the measurements that would settle this,
    // so the proposal can be specific rather than "look into it".
    const wanted = related
      .flatMap((d) => d.discriminators)
      .filter((d) => d.availability !== "available")
      .map((d) => d.description);
    const subject = INVESTIGATIVE_BY_CATEGORY[constraint.category];

    strategies.push({
      id: `strategy.${constraint.category}.investigate:${clinicId}:${date}`,
      title: `Establish ${subject}`,
      description:
        wanted.length === 0
          ? `The findings behind this did not settle a cause, so acting on one would be guesswork. What would separate the possibilities has not been identified either.`
          : `The findings behind this did not settle a cause, so acting on one would be guesswork. ${wanted.length} measurement(s) would separate the possibilities, beginning with: ${wanted[0]}`,
      constraintId: constraint.id,
      // Deliberately capped below the constraint's own priority: knowing that
      // something is unexplained is less urgent than acting on something
      // understood, however severe the symptom.
      priority: priority === Priority.CRITICAL ? Priority.HIGH : priority,
      kind: StrategyKind.INVESTIGATIVE,
      basedOn: [],
      diagnosisIds: related.map((d) => d.id).sort(),
      rationale: `No hypothesis behind this constraint reached a supported status.`,
      createdAt: now,
    });
  }

  // Corrective before investigative at equal priority: a clinic that can act on
  // one thing and must investigate another should be shown the action first.
  strategies.sort((a, b) => {
    const byPriority = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (byPriority !== 0) return byPriority;
    if (a.kind !== b.kind) return a.kind === StrategyKind.CORRECTIVE ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return { strategies };
}
