/**
 * Signal: revenue.high_outstanding
 *
 * Business rule: money already earned but not yet collected is working capital
 * sitting outside the clinic. Past a configured ceiling the balance is large
 * enough to matter regardless of how it accumulated.
 *
 * ## Payment plans
 *
 * The threshold is judged against the UNMANAGED portion — outstanding minus
 * whatever is covered by an agreed payment plan — never against the raw total.
 * A patient paying ₹5,000/month against a ₹50,000 balance by prior arrangement
 * is not the same problem as one who has stopped paying entirely, even though
 * `revenue.outstanding` correctly reports the same ₹50,000 for both: the money
 * is genuinely owed either way. This is the one place that distinction is
 * allowed to change anything, and it changes what gets flagged as needing
 * attention, never what the clinic is owed.
 *
 * `revenue.outstanding_on_payment_plan` is OPTIONAL. Where it is absent (no
 * repository support), this evaluator judges the raw total exactly as it always
 * has — the payment-plan distinction is additive, not a precondition.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [MetricKey.REVENUE_OUTSTANDING] as const;
const OPTIONAL = [MetricKey.REVENUE_OUTSTANDING_ON_PAYMENT_PLAN] as const;

export const highOutstandingEvaluator: SignalEvaluator = {
  type: SignalType.REVENUE_HIGH_OUTSTANDING,
  category: SignalCategory.FINANCIAL,
  requiredMetrics: REQUIRED,
  optionalMetrics: OPTIONAL,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const outstanding = required.metrics.value(MetricKey.REVENUE_OUTSTANDING);
    const onPlan = ctx.metrics.get(MetricKey.REVENUE_OUTSTANDING_ON_PAYMENT_PLAN)?.value;
    // Floored: a data-lag moment where the plan figure exceeds the total (a
    // payment recorded a beat before the treatment charge that produced it)
    // must never read as negative unmanaged debt.
    const unmanaged = onPlan === undefined ? outstanding : Math.max(0, outstanding - onPlan);
    const { revenue } = ctx.config;

    if (unmanaged <= revenue.outstandingBalanceLimit) {
      return {
        kind: "no_signal",
        reason: `Unmanaged outstanding ${unmanaged} (total ${outstanding}${onPlan !== undefined ? `, ${onPlan} on a payment plan` : ""}) within limit ${revenue.outstandingBalanceLimit}.`,
      };
    }

    const planNote =
      onPlan !== undefined && onPlan > 0
        ? ` ${formatValue(onPlan, MetricUnit.CURRENCY)} of the total is already under an agreed payment plan and is excluded from this figure.`
        : "";

    return buildThresholdSignal(ctx, {
      type: SignalType.REVENUE_HIGH_OUTSTANDING,
      category: SignalCategory.FINANCIAL,
      title: "Outstanding balance above limit",
      description: `Unmanaged outstanding patient balances total ${formatValue(unmanaged, MetricUnit.CURRENCY)} against a configured limit of ${formatValue(revenue.outstandingBalanceLimit, MetricUnit.CURRENCY)}.${planNote}`,
      observed: {
        label: "Unmanaged outstanding balance",
        value: unmanaged,
        unit: MetricUnit.CURRENCY,
      },
      threshold: {
        label: "Configured outstanding balance limit",
        value: revenue.outstandingBalanceLimit,
        unit: MetricUnit.CURRENCY,
        direction: ThresholdDirection.UPPER,
      },
      inputs:
        onPlan === undefined
          ? []
          : [
              { label: "Total outstanding", value: outstanding, unit: MetricUnit.CURRENCY },
              { label: "Covered by a payment plan", value: onPlan, unit: MetricUnit.CURRENCY },
            ],
      metricsRead: required.metrics.all,
    });
  },
};
