/**
 * Specs for the AI explanation guardrail.
 *
 * This verifier is the only thing standing between a language model and a
 * dentist's financial dashboard. A prompt asking for no invented numbers is a
 * request; this is the enforcement. So these tests care less about the happy
 * path and more about whether the guard actually fires on the failure modes a
 * model exhibits in practice: rounding a figure, deriving a new one, and
 * slipping into advice.
 */

import { describe, expect, it } from "vitest";

import type { Diagnosis } from "../../domain";
import {
  ExplanationViolation,
  explanationInputFor,
  verifyExplanation,
  type AIExplanationEngineInput,
} from "../ai-explanation-engine";

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: "diagnosis.collection_gap:c:2026-07-28",
    pattern: "collection_gap",
    title: "Work delivered is not converting to cash",
    summary: "2 treatments were completed today and INR 0 was collected.",
    category: "financial",
    severity: "medium",
    confidence: 0.7,
    persistence: "transient",
    signalIds: [],
    metricIds: [],
    hypotheses: [
      {
        id: "h1",
        statement: "Billing has lagged behind delivery by a day.",
        status: "supported",
        confidence: 0.7,
        supporting: [],
        contradicting: [],
        requiredData: [],
      },
    ],
    discriminators: [],
    relatedEntities: [],
    evidence: [
      {
        id: "e1",
        source: "DiagnosisEngine",
        description: "Treatments completed today = 2",
        capturedAt: "2026-07-28T06:30:00.000Z",
      },
    ],
    generatedAt: "2026-07-28T06:30:00.000Z",
    ...over,
  };
}

const input: AIExplanationEngineInput = explanationInputFor(diagnosis(), [
  "You collected INR 0 today while INR 9,000 of work was finished.",
]);

describe("accepts a faithful rewording", () => {
  it("passes plain text that introduces no figures", () => {
    const v = verifyExplanation(
      "You finished work for patients today but no money came in. It looks like billing simply has not caught up yet.",
      input,
    );
    expect(v.ok).toBe(true);
    expect(v.violations).toEqual([]);
  });

  it("passes figures copied exactly from the facts", () => {
    const v = verifyExplanation(
      "You finished 2 treatments today and took in INR 0, against INR 9,000 of completed work.",
      input,
    );
    expect(v.ok).toBe(true);
  });

  it("treats INR 9,000 and 9000 as the same figure", () => {
    // A model will reformat currency freely; that is not fabrication.
    const v = verifyExplanation("Around 9000 of finished work is unpaid.", input);
    expect(v.ok).toBe(true);
  });
});

describe("rejects invented numbers", () => {
  it("catches a figure that appears nowhere in the facts", () => {
    const v = verifyExplanation("You are owed roughly INR 45,000 from today.", input);
    expect(v.ok).toBe(false);
    expect(v.violations[0].code).toBe(ExplanationViolation.UNSUPPORTED_NUMBER);
  });

  it("catches a ROUNDED figure — the most likely real failure", () => {
    // "INR 9,000" becoming "about 10,000" reads perfectly and is wrong.
    const v = verifyExplanation("About 10000 of work is sitting unpaid.", input);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.code === ExplanationViolation.UNSUPPORTED_NUMBER)).toBe(true);
  });

  it("catches a percentage the engine never calculated", () => {
    const v = verifyExplanation("You collected on only 40% of the work you finished.", input);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.code === ExplanationViolation.UNSUPPORTED_NUMBER)).toBe(true);
  });

  it("reports every invented figure, not just the first", () => {
    const v = verifyExplanation("You are owed 45000 across 7 patients.", input);
    const unsupported = v.violations.filter(
      (x) => x.code === ExplanationViolation.UNSUPPORTED_NUMBER,
    );
    expect(unsupported).toHaveLength(2);
  });
});

describe("rejects advice", () => {
  it.each([
    "You should call the patients who have not paid.",
    "Consider following up on unpaid work.",
    "We recommend chasing these balances.",
    "You need to review your billing process.",
    "Try invoicing on the same day.",
    "This must be corrected before month end.",
    "It would be advisable to bill sooner.",
  ])("catches %j", (text) => {
    const v = verifyExplanation(text, input);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.code === ExplanationViolation.ADVISORY_LANGUAGE)).toBe(true);
  });

  it("holds the explainer to the same rule as the engine", () => {
    // engines/diagnosis/__tests__/no-advice.spec.ts forbids the engine from
    // advising. The layer that speaks for it must not become the loophole.
    const v = verifyExplanation(
      "Billing has not caught up, so you should chase it.",
      input,
    );
    expect(v.ok).toBe(false);
  });
});

describe("rejects malformed output", () => {
  it("catches empty output", () => {
    const v = verifyExplanation("   ", input);
    expect(v.violations[0].code).toBe(ExplanationViolation.LENGTH_OUT_OF_RANGE);
  });

  it("catches output long enough to be editorialising", () => {
    const v = verifyExplanation("Money came in slowly today. ".repeat(40), input);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.code === ExplanationViolation.LENGTH_OUT_OF_RANGE)).toBe(
      true,
    );
  });
});

describe("the fact set is closed", () => {
  it("permits figures from the diagnosis itself without being told", () => {
    const v = verifyExplanation("2 treatments were finished.", explanationInputFor(diagnosis()));
    expect(v.ok).toBe(true);
  });

  it("does NOT permit a figure only present in a signal that was not supplied", () => {
    // Guards the input contract: widening what the model may say requires
    // widening the facts passed in, not hoping the verifier is lenient.
    const withoutSignals = explanationInputFor(diagnosis());
    const v = verifyExplanation("INR 9,000 of work is unpaid.", withoutSignals);
    expect(v.ok).toBe(false);
  });
});
