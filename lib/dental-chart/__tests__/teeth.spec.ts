/**
 * Specs for lib/dental-chart/teeth.ts — pure FDI-numbering helpers.
 * No mocking, no I/O — mirrors lib/scheduling/__tests__'s pure-function style.
 */

import { describe, expect, it } from "vitest";
import {
  isValidToothNumber,
  getToothIdentity,
  getToothType,
  getDentalChartLayout,
  FDI_TOOTH_NUMBERS,
} from "../teeth";

describe("isValidToothNumber", () => {
  it("accepts every adult FDI number (11-18, 21-28, 31-38, 41-48)", () => {
    for (const n of FDI_TOOTH_NUMBERS.adult) {
      expect(isValidToothNumber("adult", n)).toBe(true);
    }
  });

  it("accepts every primary FDI number (51-55, 61-65, 71-75, 81-85)", () => {
    for (const n of FDI_TOOTH_NUMBERS.primary) {
      expect(isValidToothNumber("primary", n)).toBe(true);
    }
  });

  it("rejects a position digit that doesn't exist (adult quadrant only goes to 8)", () => {
    expect(isValidToothNumber("adult", 19)).toBe(false);
    expect(isValidToothNumber("adult", 10)).toBe(false);
  });

  it("rejects a primary number outside 1-5 within its quadrant", () => {
    expect(isValidToothNumber("primary", 56)).toBe(false);
  });

  it("rejects an adult number against the primary dentition and vice versa", () => {
    // 11 is a valid adult number but not a valid primary number.
    expect(isValidToothNumber("primary", 11)).toBe(false);
    // 51 is a valid primary number but not a valid adult number.
    expect(isValidToothNumber("adult", 51)).toBe(false);
  });

  it("rejects a quadrant that doesn't exist (adult quadrants are 1-4 only)", () => {
    expect(isValidToothNumber("adult", 51)).toBe(false);
    expect(isValidToothNumber("adult", 91)).toBe(false);
  });
});

describe("getToothIdentity", () => {
  it("decomposes tooth 11 as the adult upper-right central incisor", () => {
    const t = getToothIdentity("adult", 11);
    expect(t.quadrant).toBe(1);
    expect(t.position).toBe(1);
    expect(t.arch).toBe("upper");
    expect(t.isPatientRight).toBe(true);
    expect(t.toothType).toBe("incisor");
  });

  it("decomposes tooth 36 as the adult lower-left first molar", () => {
    // Sanity check against real dental knowledge: 36 is the classic "lower
    // left first molar" used throughout the task's own worked examples.
    const t = getToothIdentity("adult", 36);
    expect(t.quadrant).toBe(3);
    expect(t.position).toBe(6);
    expect(t.arch).toBe("lower");
    expect(t.isPatientRight).toBe(false);
    expect(t.toothType).toBe("molar");
  });

  it("decomposes tooth 24 as the adult upper-left first premolar", () => {
    const t = getToothIdentity("adult", 24);
    expect(t.arch).toBe("upper");
    expect(t.isPatientRight).toBe(false);
    expect(t.toothType).toBe("premolar");
  });

  it("decomposes tooth 13 as the adult upper-right canine", () => {
    const t = getToothIdentity("adult", 13);
    expect(t.toothType).toBe("canine");
  });

  it("classifies primary tooth 84 as a molar (primary dentition has no premolars)", () => {
    const t = getToothIdentity("primary", 84);
    expect(t.quadrant).toBe(8);
    expect(t.arch).toBe("lower");
    expect(t.isPatientRight).toBe(true);
    expect(t.toothType).toBe("molar");
  });

  it("throws on an invalid tooth number rather than silently returning garbage", () => {
    expect(() => getToothIdentity("adult", 19)).toThrow();
    expect(() => getToothIdentity("primary", 11)).toThrow();
  });
});

describe("getToothType", () => {
  it("adult: positions 1-2 incisor, 3 canine, 4-5 premolar, 6-8 molar", () => {
    expect(getToothType("adult", 1)).toBe("incisor");
    expect(getToothType("adult", 2)).toBe("incisor");
    expect(getToothType("adult", 3)).toBe("canine");
    expect(getToothType("adult", 4)).toBe("premolar");
    expect(getToothType("adult", 5)).toBe("premolar");
    expect(getToothType("adult", 6)).toBe("molar");
    expect(getToothType("adult", 7)).toBe("molar");
    expect(getToothType("adult", 8)).toBe("molar");
  });

  it("primary: positions 1-2 incisor, 3 canine, 4-5 molar (no premolars)", () => {
    expect(getToothType("primary", 1)).toBe("incisor");
    expect(getToothType("primary", 3)).toBe("canine");
    expect(getToothType("primary", 4)).toBe("molar");
    expect(getToothType("primary", 5)).toBe("molar");
  });
});

describe("getDentalChartLayout", () => {
  it("orders the adult upper arch 18..11 | 21..28, left to right on screen", () => {
    const layout = getDentalChartLayout("adult");
    expect(layout.upper.map((t) => t.toothNumber)).toEqual([
      18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
    ]);
  });

  it("orders the adult lower arch 48..41 | 31..38, left to right on screen", () => {
    const layout = getDentalChartLayout("adult");
    expect(layout.lower.map((t) => t.toothNumber)).toEqual([
      48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
    ]);
  });

  it("orders the primary upper arch 55..51 | 61..65", () => {
    const layout = getDentalChartLayout("primary");
    expect(layout.upper.map((t) => t.toothNumber)).toEqual([55, 54, 53, 52, 51, 61, 62, 63, 64, 65]);
  });

  it("orders the primary lower arch 85..81 | 71..75", () => {
    const layout = getDentalChartLayout("primary");
    expect(layout.lower.map((t) => t.toothNumber)).toEqual([85, 84, 83, 82, 81, 71, 72, 73, 74, 75]);
  });

  it("covers every FDI number exactly once per dentition", () => {
    for (const dentition of ["adult", "primary"] as const) {
      const layout = getDentalChartLayout(dentition);
      const all = [...layout.upper, ...layout.lower].map((t) => t.toothNumber).sort((a, b) => a - b);
      const expected = [...FDI_TOOTH_NUMBERS[dentition]].sort((a, b) => a - b);
      expect(all).toEqual(expected);
    }
  });
});
