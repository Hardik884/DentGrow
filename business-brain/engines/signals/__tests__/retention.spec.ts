import { describe, expect, it } from "vitest";

import { MetricKey } from "../../metrics/metric-ids";
import { followupBacklogEvaluator } from "../evaluators/retention/followup-backlog";
import { lowNewPatientsEvaluator } from "../evaluators/retention/low-new-patients";
import { returningVolumeDroppingEvaluator } from "../evaluators/retention/returning-volume-dropping";
import { context, expectSignal } from "./fixtures/evaluator-harness";
import {
  EMPTY_CLINIC,
  HEALTHY_CLINIC,
  OVERDUE_FOLLOWUPS_CLINIC,
} from "./fixtures/metric-fixtures";

describe("acquisition.low_new_patients", () => {
  it("fires with no new registrations, capped at medium", () => {
    const signal = expectSignal(lowNewPatientsEvaluator, context(EMPTY_CLINIC));
    expect(signal.severity).toBe("medium");
    expect(signal.priority).toBe("medium");
    expect(signal.category).toBe("retention");
    expect(signal.confidence).toBe(1);
  });

  it("stays silent when new patients arrived", () => {
    expect(lowNewPatientsEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });
});

describe("retention.returning_volume_dropping", () => {
  it("fires on a 60% fall against the prior period", () => {
    const signal = expectSignal(
      returningVolumeDroppingEvaluator,
      context(
        { [MetricKey.PATIENTS_RETURNING_TODAY]: 4 },
        { previous: { [MetricKey.PATIENTS_RETURNING_TODAY]: 10 } },
      ),
    );
    // drop 60% vs threshold 30% -> breach 1.0
    expect(signal.severity).toBe("critical");
    expect(signal.confidence).toBe(1);
  });

  it("skips without a prior period", () => {
    expect(returningVolumeDroppingEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe(
      "skipped",
    );
  });

  it("does not divide by a zero baseline", () => {
    const outcome = returningVolumeDroppingEvaluator.evaluate(
      context(
        { [MetricKey.PATIENTS_RETURNING_TODAY]: 0 },
        { previous: { [MetricKey.PATIENTS_RETURNING_TODAY]: 0 } },
      ),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("drop floor");
  });

  it("respects the absolute floor on small returning counts", () => {
    const outcome = returningVolumeDroppingEvaluator.evaluate(
      context(
        { [MetricKey.PATIENTS_RETURNING_TODAY]: 2 },
        { previous: { [MetricKey.PATIENTS_RETURNING_TODAY]: 3 } },
      ),
    );
    // a 33% fall, but only one patient
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("drop floor 2");
  });

  it("grades a zero baseline against the floor when the floor allows it", () => {
    const signal = expectSignal(
      returningVolumeDroppingEvaluator,
      context(
        { [MetricKey.PATIENTS_RETURNING_TODAY]: 0 },
        {
          previous: { [MetricKey.PATIENTS_RETURNING_TODAY]: 0 },
          config: { patients: { returningVolumeFloor: 0 } },
        },
      ),
    );
    expect(signal.description).toContain("prior baseline is zero");
  });

  it("stays silent when returning volume grows", () => {
    const outcome = returningVolumeDroppingEvaluator.evaluate(
      context(
        { [MetricKey.PATIENTS_RETURNING_TODAY]: 12 },
        { previous: { [MetricKey.PATIENTS_RETURNING_TODAY]: 10 } },
      ),
    );
    expect(outcome.kind).toBe("no_signal");
  });
});

describe("retention.followup_backlog", () => {
  it("fires on 27 overdue follow-ups", () => {
    const signal = expectSignal(followupBacklogEvaluator, context(OVERDUE_FOLLOWUPS_CLINIC));
    expect(signal.severity).toBe("critical");
    expect(signal.confidence).toBe(1);
  });

  it("is floored at low when barely over the limit", () => {
    const signal = expectSignal(
      followupBacklogEvaluator,
      context({ [MetricKey.FOLLOWUPS_OVERDUE]: 11, [MetricKey.FOLLOWUPS_DUE_TODAY]: 3 }),
    );
    // breach 0.1 lands in the low band; the configured floor keeps it there
    expect(signal.severity).toBe("low");
    expect(signal.priority).toBe("low");
  });

  it("floors an info-band breach up to low", () => {
    const signal = expectSignal(
      followupBacklogEvaluator,
      context(
        { [MetricKey.FOLLOWUPS_OVERDUE]: 11, [MetricKey.FOLLOWUPS_DUE_TODAY]: 3 },
        { config: { followups: { overdueFollowupLimit: 10.5 } } },
      ),
    );
    const breach = (signal.evidence ?? []).find((e) => e.id.endsWith("#breach"));
    expect(breach?.data).toMatchObject({ bandSeverity: "info", severity: "low" });
  });

  it("loses confidence when the optional metric is absent", () => {
    const signal = expectSignal(
      followupBacklogEvaluator,
      context({ [MetricKey.FOLLOWUPS_OVERDUE]: 27 }),
    );
    expect(signal.confidence).toBe(0.9);
  });

  it("stays silent within the limit", () => {
    expect(followupBacklogEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });
});
