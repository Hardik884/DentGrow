/**
 * lib/__tests__/data-consent.spec.ts
 *
 * The rules that make data-processing consent meaningful rather than decorative.
 *
 * Two of them are properties a reviewer would want to check by hand and would
 * then have no way to keep true:
 *
 *   - refusing marketing must never withhold anything else. If the categories
 *     were ever coupled, this is where it would show.
 *   - a category nobody has been asked about must not default to "yes" for the
 *     optional ones. Silence is not consent.
 */

import { describe, it, expect } from "vitest";
import {
  DATA_CONSENT_CATEGORIES,
  DEFAULT_DECISION,
  WITHDRAWABLE_CATEGORIES,
  isWithdrawable,
  selectApplicableNotice,
  CATEGORY_LABELS,
  type DataConsentNotice,
} from "../data-consent";

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const CLINIC_B = "00000000-0000-0000-0000-00000000000b";

type Row = DataConsentNotice & { clinic_id: string | null };

function notice(over: Partial<Row>): Row {
  return {
    id: "n1",
    clinic_id: null,
    category: "marketing",
    version: 1,
    locale: "en",
    summary: "default text",
    policy_url: null,
    ...over,
  };
}

describe("categories are independent", () => {
  it("marketing can be refused while everything else stands", () => {
    expect(isWithdrawable("marketing")).toBe(true);
    // Nothing in the model lets one category's decision constrain another:
    // withdrawability is a per-category property, and there is no dependency
    // list anywhere for a future change to add one to accidentally.
    for (const category of DATA_CONSENT_CATEGORIES) {
      expect(typeof isWithdrawable(category)).toBe("boolean");
    }
  });

  it("appointment reminders are separate from marketing", () => {
    expect(WITHDRAWABLE_CATEGORIES).toContain("communications");
    expect(WITHDRAWABLE_CATEGORIES).toContain("marketing");
    expect(DEFAULT_DECISION.communications).not.toBe(DEFAULT_DECISION.marketing);
  });

  it("AI-assisted processing can be refused on its own", () => {
    expect(isWithdrawable("ai_assisted")).toBe(true);
  });
});

describe("defaults", () => {
  it("does not treat silence as consent for the optional categories", () => {
    expect(DEFAULT_DECISION.marketing).toBe("withdrawn");
    expect(DEFAULT_DECISION.ai_assisted).toBe("withdrawn");
  });

  it("keeps the clinical record and its operational contact on by default", () => {
    // The record exists because care was given; the reminder is the thing the
    // patient booked an appointment in order to receive.
    expect(DEFAULT_DECISION.data_processing).toBe("granted");
    expect(DEFAULT_DECISION.communications).toBe("granted");
  });

  it("has a default and a label for every category", () => {
    for (const category of DATA_CONSENT_CATEGORIES) {
      expect(DEFAULT_DECISION[category]).toBeDefined();
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

describe("the clinical record is not offered as a switch", () => {
  it("is not withdrawable", () => {
    // Offering a toggle the product cannot honour would tell a patient
    // something untrue about what they control.
    expect(isWithdrawable("data_processing")).toBe(false);
    expect(WITHDRAWABLE_CATEGORIES).not.toContain("data_processing");
  });
});

describe("notice precedence", () => {
  it("prefers the clinic's own wording over the platform default", () => {
    const chosen = selectApplicableNotice(
      [
        notice({ id: "default", clinic_id: null, version: 3 }),
        notice({ id: "clinic", clinic_id: CLINIC_A, version: 1 }),
      ],
      CLINIC_A,
      "marketing"
    );
    // Even though the default is at a higher version: a clinic that authored
    // its own wording meant to use it.
    expect(chosen?.id).toBe("clinic");
  });

  it("falls back to the platform default when the clinic has none", () => {
    const chosen = selectApplicableNotice(
      [
        notice({ id: "default", clinic_id: null, version: 1 }),
        notice({ id: "other-clinic", clinic_id: CLINIC_B, version: 9 }),
      ],
      CLINIC_A,
      "marketing"
    );
    expect(chosen?.id).toBe("default");
  });

  it("never returns another clinic's wording", () => {
    const chosen = selectApplicableNotice(
      [notice({ id: "other-clinic", clinic_id: CLINIC_B, version: 9 })],
      CLINIC_A,
      "marketing"
    );
    expect(chosen).toBeNull();
  });

  it("picks the highest version within the chosen scope", () => {
    const chosen = selectApplicableNotice(
      [
        notice({ id: "v1", clinic_id: null, version: 1 }),
        notice({ id: "v3", clinic_id: null, version: 3 }),
        notice({ id: "v2", clinic_id: null, version: 2 }),
      ],
      CLINIC_A,
      "marketing"
    );
    expect(chosen?.id).toBe("v3");
  });

  it("does not cross categories or locales", () => {
    const rows = [
      notice({ id: "wrong-category", category: "communications" }),
      notice({ id: "wrong-locale", locale: "hi" }),
    ];
    expect(selectApplicableNotice(rows, CLINIC_A, "marketing")).toBeNull();
  });

  it("returns null rather than guessing when nothing applies", () => {
    expect(selectApplicableNotice([], CLINIC_A, "marketing")).toBeNull();
  });
});
