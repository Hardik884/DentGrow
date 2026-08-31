/**
 * Signal: scheduling.repeat_non_attendance
 *
 * Business rule: two or more patients each missed 2+ appointments in the
 * trailing window.
 *
 * ## Why this is not covered by the no-show rate
 *
 * A rate measures HOW MUCH attrition there is. It cannot say whether it is
 * spread thinly across the patient base or concentrated in a handful of people,
 * and those two situations call for opposite responses: a reminder policy
 * applied to everyone, versus a short list of patients booked differently. Worse,
 * a clinic can sit comfortably below its no-show rate threshold — so
 * `high_no_show_rate` never fires and `schedule_attrition` never runs — while
 * three patients quietly miss four appointments each. That clinic currently sees
 * nothing at all, which is the gap this closes.
 *
 * No sample guard is needed. The threshold counts PEOPLE, not a proportion, so
 * there is no denominator to be small: two patients who each missed twice is the
 * same finding in a clinic of 50 patients and one of 5,000. The metric itself is
 * withheld when the trailing window is absent, so a repository that supplies no
 * history makes this skip rather than report a confident zero.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [MetricKey.SCHEDULING_REPEAT_NON_ATTENDERS_30D] as const;
const OPTIONAL = [MetricKey.SCHEDULING_NO_SHOW_RATE_30D] as const;

export const repeatNonAttendanceEvaluator: SignalEvaluator = {
  type: SignalType.SCHEDULING_REPEAT_NON_ATTENDANCE,
  category: SignalCategory.SCHEDULING,
  requiredMetrics: REQUIRED,
  optionalMetrics: OPTIONAL,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const repeat = required.metrics.value(MetricKey.SCHEDULING_REPEAT_NON_ATTENDERS_30D);
    const { appointments } = ctx.config;

    if (repeat < appointments.repeatNonAttenderLimit) {
      return {
        kind: "no_signal",
        reason: `${repeat} patient(s) missed more than once, below the limit of ${appointments.repeatNonAttenderLimit}.`,
      };
    }

    // Read only to describe the finding, never to gate it: the whole point is
    // that this fires whether or not the overall rate looks acceptable.
    const rate = ctx.metrics.get(MetricKey.SCHEDULING_NO_SHOW_RATE_30D)?.value;

    return buildThresholdSignal(ctx, {
      type: SignalType.SCHEDULING_REPEAT_NON_ATTENDANCE,
      category: SignalCategory.SCHEDULING,
      title: "Missed appointments concentrated in a few patients",
      description:
        `${repeat} patients each missed 2 or more appointments over the last 30 days` +
        (rate === undefined
          ? "."
          : `, with an overall no-show rate of ${rate}%. The rate alone would not show that the misses are concentrated.`),
      observed: {
        label: "Patients who missed more than once",
        value: repeat,
        unit: MetricUnit.COUNT,
      },
      threshold: {
        label: "Configured limit for repeat non-attenders",
        value: appointments.repeatNonAttenderLimit,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.UPPER,
      },
      inputs:
        rate === undefined
          ? []
          : [{ label: "No-show rate (30 days)", value: rate, unit: MetricUnit.PERCENTAGE }],
      metricsRead: required.metrics.all,
    });
  },
};
