/**
 * Pattern: demand_supply_mismatch
 *
 * Correlation: idle chairs and a thin appointment book on the same day are one
 * observation, not two. The chair was empty because nothing was booked into it.
 *
 * Discrimination — no demand vs unconverted demand. This one is genuinely
 * separable. If a large accepted-but-unscheduled treatment book exists while the
 * chair sits idle, demand demonstrably exists and was not converted into
 * appointments. If the treatment book is empty AND new patient registrations are
 * below the minimum, the honest reading is that fewer patients sought care.
 *
 * What remains undetermined: whether the open capacity was ever offered to
 * patients. Nothing in the metric set records a published roster or a declined
 * booking request, so that hypothesis stays undetermined however the rest falls.
 */

import { DiagnosisPattern, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../../signals/support/evidence";
import { MetricUnit } from "../../../../domain";
import type { EvidenceNote, HypothesisSpec } from "../../support/hypothesis-builder";
import type { DiscriminatorDeclaration } from "../../support/diagnosis-builder";
import {
  absenceSummary,
  emit,
  metricValue,
  notMatched,
  type MatcherContext,
  type MatcherOutcome,
  type PatternMatcher,
} from "../types";

const REQUIRED = [
  SignalType.OPERATIONAL_LOW_CHAIR_UTILIZATION,
  SignalType.SCHEDULING_LOW_APPOINTMENT_VOLUME,
] as const;

const OPTIONAL = [
  SignalType.CLINICAL_LARGE_PENDING_TREATMENT_VALUE,
  SignalType.CLINICAL_ACCEPTED_TREATMENTS_UNSCHEDULED,
] as const;

const INSUFFICIENT_DEMAND =
  "Fewer patients sought appointments on this day than the open schedule could have accommodated.";
const UNCONVERTED_DEMAND =
  "Planned treatment demand was not converted into booked appointments even though the chair sat idle.";
const CAPACITY_NOT_OFFERED =
  "Open appointment capacity existed but was not published or offered to patients through any booking channel.";

export const demandSupplyMismatchMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.DEMAND_SUPPLY_MISMATCH,
  category: SignalCategory.OPERATIONAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires both low chair utilization and low appointment volume. Pending treatment value and planned treatments whose patients have no next visit booked strengthen it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const present = ctx.signals.present(REQUIRED);
    if (present.length < REQUIRED.length) {
      return notMatched(
        `Required signals absent: ${absenceSummary(ctx, REQUIRED)}.`,
      );
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [...present, ...optionalPresent];

    const pendingValue = metricValue(ctx, MetricKey.REVENUE_PENDING_TREATMENT_VALUE);
    const acceptedPending = metricValue(
      ctx,
      MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING,
    );
    const newPatients = metricValue(ctx, MetricKey.PATIENTS_NEW_TODAY);
    const openMinutes = metricValue(ctx, MetricKey.CAPACITY_OPEN_MINUTES_TODAY);
    const { treatment, patients } = ctx.config.signals;

    const pendingKnown = pendingValue !== undefined && acceptedPending !== undefined;
    const demandEvident =
      (pendingValue !== undefined &&
        pendingValue >= treatment.pendingTreatmentValueLimit) ||
      (acceptedPending !== undefined &&
        acceptedPending >= treatment.acceptedUnscheduledLimit);
    const pendingEmpty = pendingKnown && pendingValue === 0 && acceptedPending === 0;
    const newPatientsLow =
      newPatients !== undefined && newPatients < patients.minimumNewPatientsPerDay;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.demand",
      description: `Banked demand measured as pending treatment value ${pendingValue === undefined ? "unavailable" : formatValue(pendingValue, MetricUnit.CURRENCY)} against limit ${formatValue(treatment.pendingTreatmentValueLimit, MetricUnit.CURRENCY)}, and planned treatments with no next visit booked ${acceptedPending ?? "unavailable"} against limit ${treatment.acceptedUnscheduledLimit}. New patients ${newPatients ?? "unavailable"} against minimum ${patients.minimumNewPatientsPerDay}.`,
      data: {
        pendingValue,
        pendingTreatmentValueLimit: treatment.pendingTreatmentValueLimit,
        acceptedPending,
        acceptedUnscheduledLimit: treatment.acceptedUnscheduledLimit,
        newPatients,
        minimumNewPatientsPerDay: patients.minimumNewPatientsPerDay,
        demandEvident,
        pendingEmpty,
        newPatientsLow,
      },
    };

    const hypotheses: HypothesisSpec[] = [];
    const discriminators: DiscriminatorDeclaration[] = [
      {
        key: "ACCEPTED_DEMAND_LEVEL",
        separates: ["insufficient_demand", "unconverted_demand"],
      },
      {
        key: "PROVIDER_AVAILABILITY_ROSTER",
        separates: ["capacity_not_offered", "insufficient_demand"],
      },
      {
        key: "BOOKING_CHANNEL_ACTIVITY",
        separates: ["capacity_not_offered", "unconverted_demand"],
      },
    ];

    if (demandEvident) {
      hypotheses.push(
        {
          slug: "unconverted_demand",
          statement: UNCONVERTED_DEMAND,
          status: "supported",
          supporting: [
            {
              slug: "accepted-book",
              description: `Planned treatment demand is at or above its configured limit while the chair was idle, so demand demonstrably existed on this day.`,
              data: { pendingValue, acceptedPending },
            },
          ],
        },
        {
          slug: "insufficient_demand",
          statement: INSUFFICIENT_DEMAND,
          status: "contradicted",
          contradicting: [
            {
              slug: "accepted-book",
              description: `Planned treatment demand is at or above its configured limit, which rules out an absence of demand as the explanation for the idle chair.`,
              data: { pendingValue, acceptedPending },
            },
          ],
        },
      );
    } else if (pendingKnown && newPatientsLow) {
      hypotheses.push({
        slug: "insufficient_demand",
        statement: INSUFFICIENT_DEMAND,
        status: "supported",
        supporting: [
          {
            slug: "no-pending-no-new",
            description: `Planned treatment demand is below its configured limits and new patient registrations are below the daily minimum, so the measured demand for the open capacity was low.`,
            data: { pendingValue, acceptedPending, newPatients },
          },
        ],
      });
      hypotheses.push(
        pendingEmpty
          ? {
              slug: "unconverted_demand",
              statement: UNCONVERTED_DEMAND,
              status: "contradicted",
              contradicting: [
                {
                  slug: "empty-book",
                  description: `Pending treatment value is zero and no planned treatment is sitting with a patient who has no next visit booked, so there was no banked demand available to convert.`,
                  data: { pendingValue, acceptedPending },
                },
              ],
            }
          : {
              slug: "unconverted_demand",
              statement: UNCONVERTED_DEMAND,
              status: "undetermined",
              supporting: [
                {
                  slug: "sub-threshold-book",
                  description: `Planned treatment demand is below its configured limits but not zero, so some unconverted demand may exist below the signal threshold.`,
                  data: { pendingValue, acceptedPending },
                },
              ],
              requires: ["PENDING_TREATMENT_AGE", "PENDING_TREATMENT_COMPOSITION"],
            },
      );
      discriminators.push({
        key: "PENDING_TREATMENT_AGE",
        separates: ["unconverted_demand", "insufficient_demand"],
      });
    } else {
      hypotheses.push(
        {
          slug: "insufficient_demand",
          statement: INSUFFICIENT_DEMAND,
          status: "undetermined",
          requires: ["ACCEPTED_DEMAND_LEVEL"],
        },
        {
          slug: "unconverted_demand",
          statement: UNCONVERTED_DEMAND,
          status: "undetermined",
          requires: ["ACCEPTED_DEMAND_LEVEL", "PENDING_TREATMENT_AGE"],
        },
      );
      discriminators.push({
        key: "PENDING_TREATMENT_AGE",
        separates: ["unconverted_demand", "insufficient_demand"],
      });
    }

    // Whether the clinic offered any chair time at all is now measurable:
    // `capacity.open_minutes_today` is the union of the day's availability rules
    // multiplied by the chair count. Zero means nothing was rostered, and an
    // empty chair is then not a demand problem at all — the chair was never on
    // offer. Anything above zero rules that explanation out.
    //
    // The remaining half of the question — whether the open slots were actually
    // OFFERED through a booking channel — still needs data DentGrow does not
    // record, so the hypothesis is only settled in the direction the open-minutes
    // figure can settle it.
    if (openMinutes === undefined) {
      hypotheses.push({
        slug: "capacity_not_offered",
        statement: CAPACITY_NOT_OFFERED,
        status: "undetermined",
        requires: ["PROVIDER_AVAILABILITY_ROSTER", "BOOKING_CHANNEL_ACTIVITY"],
      });
    } else if (openMinutes <= 0) {
      hypotheses.push({
        slug: "capacity_not_offered",
        statement: CAPACITY_NOT_OFFERED,
        status: "supported",
        supporting: [
          {
            slug: "no-chair-time-open",
            description: `The clinic opened ${formatValue(openMinutes, MetricUnit.MINUTES)} of chair time on this day, so no appointment could have been booked into it.`,
            data: { openMinutes },
          },
        ],
      });
    } else {
      hypotheses.push({
        slug: "capacity_not_offered",
        statement: CAPACITY_NOT_OFFERED,
        status: "contradicted",
        contradicting: [
          {
            slug: "chair-time-was-open",
            description: `The clinic opened ${formatValue(openMinutes, MetricUnit.MINUTES)} of chair time on this day, so capacity existed and was available to book against.`,
            data: { openMinutes },
          },
        ],
      });
    }

    return emit(ctx, {
      pattern: DiagnosisPattern.DEMAND_SUPPLY_MISMATCH,
      category: SignalCategory.OPERATIONAL,
      title: "Idle capacity alongside a thin appointment book",
      summary: `Chair utilization and booked appointment volume were both below their configured thresholds on the same day, so the open capacity and the light schedule are one observation rather than two.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators,
      evidence: [arithmetic],
    });
  },
};
