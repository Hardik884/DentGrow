import { describe, expect, it } from "vitest";

import { DiagnosisPattern } from "../../../domain";
import { MetricKey } from "../../metrics/metric-ids";
import {
  diagnoseMetrics,
  discriminatorSlugs,
  evidenceFor,
  hypothesis,
  patternsOf,
  pick,
  statuses,
} from "./fixtures/diagnose-harness";
import {
  ATTRITION_BALANCED,
  ATTRITION_CANCELLATION_DOMINANT,
  ATTRITION_NO_SHOW_DOMINANT,
  HEALTHY,
  REPEAT_NON_ATTENDANCE,
  type MetricValues,
} from "./fixtures/run-fixtures";

describe("schedule_attrition", () => {
  it("calls cancellation-dominant when cancellations outweigh no-shows", () => {
    const diagnosis = pick(
      diagnoseMetrics(ATTRITION_CANCELLATION_DOMINANT),
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );
    expect(statuses(diagnosis)).toEqual({
      cancellation_dominant: "supported",
      no_show_dominant: "contradicted",
      reminder_process: "undetermined",
      slot_clustering: "undetermined",
      patient_level_pattern: "undetermined",
    });
    expect(evidenceFor(diagnosis, "discrimination.attrition-mix")).toContain(
      "Cancellations 8 versus no-shows 1",
    );
  });

  it("calls no-show-dominant when no-shows outweigh cancellations", () => {
    const diagnosis = pick(
      diagnoseMetrics(ATTRITION_NO_SHOW_DOMINANT),
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );
    expect(statuses(diagnosis)).toMatchObject({
      no_show_dominant: "supported",
      cancellation_dominant: "contradicted",
    });
  });

  it("refuses to call a winner when the two counts are close", () => {
    const diagnosis = pick(
      diagnoseMetrics(ATTRITION_BALANCED),
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );
    expect(statuses(diagnosis)).toEqual({
      cancellation_dominant: "undetermined",
      no_show_dominant: "undetermined",
      reminder_process: "undetermined",
      slot_clustering: "undetermined",
      patient_level_pattern: "undetermined",
    });
    // entirely undetermined, so it must name what would separate them
    expect(discriminatorSlugs(diagnosis)).toContain("attrition_mix");
    expect(discriminatorSlugs(diagnosis)).toContain("cancellation_timing");
    expect(
      diagnosis.hypotheses.every((h) => h.confidence <= 0.5),
    ).toBe(true);
  });

  it("never asserts a reason for the attrition, however clear the mix is", () => {
    const diagnosis = pick(
      diagnoseMetrics(ATTRITION_CANCELLATION_DOMINANT),
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );
    for (const slug of ["reminder_process", "slot_clustering", "patient_level_pattern"]) {
      const item = hypothesis(diagnosis, slug);
      expect(item.status).toBe("undetermined");
      expect(item.requiredData.length).toBeGreaterThan(0);
    }
  });

  it("matches on the no-show signal alone", () => {
    const noShowsOnly = {
      ...HEALTHY,
      [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 20,
      [MetricKey.APPOINTMENTS_CANCELLED_TODAY]: 0,
      [MetricKey.APPOINTMENTS_NO_SHOWS_TODAY]: 4,
    };
    const result = diagnoseMetrics(noShowsOnly);
    expect(patternsOf(result)).toContain(DiagnosisPattern.SCHEDULE_ATTRITION);
    const diagnosis = pick(result, DiagnosisPattern.SCHEDULE_ATTRITION);
    // the absent cancellation signal is recorded as a measured absence
    expect(
      evidenceFor(diagnosis, "absent.scheduling.high_cancellation_rate"),
    ).toContain("positive evidence of absence");
  });

  it("records a skipped evaluator differently from a measured absence, and charges for it", () => {
    // Same day twice. In the first, the cancellation evaluator ran and measured
    // nothing. In the second its metric is missing, so it could not run at all.
    const noShowsOnly: MetricValues = {
      ...HEALTHY,
      [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 20,
      [MetricKey.APPOINTMENTS_CANCELLED_TODAY]: 0,
      [MetricKey.APPOINTMENTS_NO_SHOWS_TODAY]: 4,
    };
    const withoutCancellationMetric: MetricValues = { ...noShowsOnly };
    delete withoutCancellationMetric[MetricKey.APPOINTMENTS_CANCELLED_TODAY];

    const measured = pick(
      diagnoseMetrics(noShowsOnly),
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );
    const skipped = pick(
      diagnoseMetrics(withoutCancellationMetric),
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );

    const slug = "absent.scheduling.high_cancellation_rate";
    expect(evidenceFor(measured, slug)).toContain("positive evidence of absence");
    expect(evidenceFor(skipped, slug)).toContain(
      "missing information rather than evidence of absence",
    );
    expect(evidenceFor(skipped, slug)).toContain("Skipped:");

    // and the missing information costs confidence, while measured absence does not
    expect(evidenceFor(skipped, "confidence")).toContain(
      "required-signal evaluator(s) skipped",
    );
    expect(evidenceFor(measured, "confidence")).not.toContain(
      "required-signal evaluator(s) skipped",
    );
    expect(skipped.confidence).toBeLessThan(measured.confidence);

    // the mix cannot be judged without the count, so neither side is claimed
    expect(statuses(skipped)).toMatchObject({
      cancellation_dominant: "undetermined",
      no_show_dominant: "undetermined",
    });
  });

  it("stays silent on a healthy day", () => {
    expect(patternsOf(diagnoseMetrics(HEALTHY))).not.toContain(
      DiagnosisPattern.SCHEDULE_ATTRITION,
    );
  });
});

describe("repeat_non_attendance", () => {
  it("fires on a day whose headline attrition numbers are entirely normal", () => {
    // The blind spot this closes: REPEAT_NON_ATTENDANCE is built on HEALTHY, so
    // there is one cancellation, no no-shows, and the rate signals cannot fire.
    // schedule_attrition therefore never runs — and the clinic still has three
    // patients who have each missed more than once.
    const result = diagnoseMetrics(REPEAT_NON_ATTENDANCE);
    expect(patternsOf(result)).toContain(DiagnosisPattern.REPEAT_NON_ATTENDANCE);
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.SCHEDULE_ATTRITION);
  });

  it("settles the same cause schedule_attrition can only reach through entity data", () => {
    const diagnosis = pick(
      diagnoseMetrics(REPEAT_NON_ATTENDANCE),
      DiagnosisPattern.REPEAT_NON_ATTENDANCE,
    );
    // Sharing the slug is what makes the Strategy Engine dedupe the two routes
    // into one piece of advice instead of two near-identical recommendations.
    expect(statuses(diagnosis)).toMatchObject({ patient_level_pattern: "supported" });
  });

  it("stays silent when nobody has missed more than once", () => {
    expect(patternsOf(diagnoseMetrics(HEALTHY))).not.toContain(
      DiagnosisPattern.REPEAT_NON_ATTENDANCE,
    );
  });
});
