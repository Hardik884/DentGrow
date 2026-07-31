/**
 * Business Brain — Diagnosis Engine: applying entity-level resolution
 *
 * Takes the diagnoses the matchers produced and the entity rows the orchestrator
 * fetched, and folds one into the other: evidence onto hypotheses, and a settled
 * status where a resolver was decisive.
 *
 * Pure and total. Every input is data; nothing here reads a clock, touches a
 * database, or throws. A resolver that fails to conclude leaves its diagnosis
 * exactly as the matcher left it, which is why running this with an empty
 * context is guaranteed to be a no-op.
 */

import type { Diagnosis, Discriminator, Hypothesis } from "../../../domain";
import { ALL_DISCRIMINATORS } from "../support/discriminators";
import { DISCRIMINATOR_RESOLVERS } from "./resolvers";
import {
  DEFAULT_ENTITY_RESOLUTION,
  type EntityContext,
  type EntityResolutionConfig,
} from "./types";

/** Slug of a discriminator, recovered from its `<diagnosisId>#d.<slug>` id. */
function slugOf(discriminator: Discriminator): string {
  const marker = "#d.";
  const at = discriminator.id.lastIndexOf(marker);
  return at === -1 ? discriminator.id : discriminator.id.slice(at + marker.length);
}

/** Hypothesis slug, recovered from its `<diagnosisId>#h.<slug>` id. */
function hypothesisSlug(hypothesis: Hypothesis): string {
  const marker = "#h.";
  const at = hypothesis.id.lastIndexOf(marker);
  return at === -1 ? hypothesis.id : hypothesis.id.slice(at + marker.length);
}

/**
 * Resolve every entity-level discriminator on every diagnosis it can.
 *
 * Ordering rules that matter:
 *
 * - A hypothesis already SETTLED by a matcher is never re-opened. The matcher
 *   read the day's own metrics; entity rows add detail, they do not overrule.
 * - Contradiction beats support when two resolvers disagree about the same
 *   hypothesis. Evidence against an explanation is the stronger claim, and
 *   silently picking whichever ran last would make the output order-dependent.
 * - A discriminator whose resolver concludes becomes `available`: it is no
 *   longer waiting on data, because the data arrived. One that could not
 *   conclude keeps its original availability, so the catalogue still reports it
 *   as outstanding.
 */
export function applyEntityResolution(
  diagnoses: readonly Diagnosis[],
  context: EntityContext,
  now: string,
  config: EntityResolutionConfig = DEFAULT_ENTITY_RESOLUTION,
): readonly Diagnosis[] {
  if (diagnoses.length === 0) return diagnoses;

  return diagnoses.map((diagnosis) => {
    const supported = new Set<string>();
    const contradicted = new Set<string>();
    const evidenceBySlug = new Map<string, Diagnosis["evidence"][number][]>();
    const resolvedDiscriminators = new Set<string>();

    for (const discriminator of diagnosis.discriminators) {
      const slug = slugOf(discriminator);
      const resolver = DISCRIMINATOR_RESOLVERS[slug];
      if (resolver === undefined) continue;

      const outcome = resolver(context, {
        diagnosisId: diagnosis.id,
        separates: discriminator.wouldSeparate.map((id) => {
          const marker = "#h.";
          const at = id.lastIndexOf(marker);
          return at === -1 ? id : id.slice(at + marker.length);
        }),
        now,
        config,
      });
      if (outcome === null) continue;

      resolvedDiscriminators.add(slug);
      for (const s of outcome.supports) supported.add(s);
      for (const c of outcome.contradicts) contradicted.add(c);
      for (const target of [...outcome.supports, ...outcome.contradicts]) {
        const list = evidenceBySlug.get(target) ?? [];
        list.push(...outcome.evidence);
        evidenceBySlug.set(target, list);
      }
      // Evidence from a resolver that concluded nothing about any specific
      // hypothesis still belongs to the diagnosis as a whole.
      if (outcome.supports.length === 0 && outcome.contradicts.length === 0) {
        const list = evidenceBySlug.get("") ?? [];
        list.push(...outcome.evidence);
        evidenceBySlug.set("", list);
      }
    }

    if (resolvedDiscriminators.size === 0) return diagnosis;

    const hypotheses = diagnosis.hypotheses.map((h): Hypothesis => {
      const slug = hypothesisSlug(h);
      const attached = evidenceBySlug.get(slug) ?? [];
      if (attached.length === 0) return h;

      // A matcher's verdict stands. Only an undetermined hypothesis can be
      // settled here.
      if (h.status !== "undetermined") {
        return { ...h, supporting: [...h.supporting, ...attached] };
      }

      const isContradicted = contradicted.has(slug);
      const isSupported = supported.has(slug) && !isContradicted;
      const status: Hypothesis["status"] = isContradicted
        ? "contradicted"
        : isSupported
          ? "supported"
          : "undetermined";

      return {
        ...h,
        status,
        supporting: isContradicted ? h.supporting : [...h.supporting, ...attached],
        contradicting: isContradicted ? [...h.contradicting, ...attached] : h.contradicting,
        // A settled hypothesis needs nothing further — the domain type requires
        // requiredData to be empty unless the status is undetermined.
        requiredData: status === "undetermined" ? h.requiredData : [],
      };
    });

    const discriminators = diagnosis.discriminators.map((d): Discriminator =>
      resolvedDiscriminators.has(slugOf(d)) ? { ...d, availability: "available" } : d,
    );

    const unattached = evidenceBySlug.get("") ?? [];

    return {
      ...diagnosis,
      hypotheses,
      discriminators,
      evidence: [...diagnosis.evidence, ...unattached],
    };
  });
}

/**
 * Which port methods a set of diagnoses actually needs.
 *
 * The orchestrator fetches only these. A run whose diagnoses raise no
 * cancellation question should not be paying for a cancellation query, and a run
 * with no diagnoses at all should touch the database not at all.
 */
export function portMethodsFor(diagnoses: readonly Diagnosis[]): readonly string[] {
  const needed = new Set<string>();
  for (const diagnosis of diagnoses) {
    for (const discriminator of diagnosis.discriminators) {
      const slug = slugOf(discriminator);
      // Only ask for data something can actually use. A discriminator with no
      // resolver would have its rows fetched and then ignored.
      if (DISCRIMINATOR_RESOLVERS[slug] === undefined) continue;
      const method = PORT_METHOD_BY_SLUG.get(slug);
      if (method !== undefined) needed.add(method);
    }
  }
  return [...needed].sort();
}

/**
 * Catalogue slug to port method.
 *
 * Read from the catalogue rather than restated here. The catalogue already
 * records which port method each entity-level discriminator needs, and a second
 * copy would be free to drift from it — which is the exact failure the catalogue
 * exists to prevent.
 */
const PORT_METHOD_BY_SLUG: ReadonlyMap<string, string> = new Map(
  ALL_DISCRIMINATORS.filter((spec) => spec.portMethod !== null).map(
    (spec) => [spec.slug, spec.portMethod as string] as const,
  ),
);
