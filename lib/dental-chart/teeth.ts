/**
 * lib/dental-chart/teeth.ts
 *
 * Pure FDI-numbering helpers for the Dental Chart. No I/O, no Supabase — safe
 * to import from both server and client components, and covered directly by
 * unit tests (lib/dental-chart/__tests__/teeth.spec.ts) with no mocking,
 * mirroring the lib/scheduling/slots.ts pure-function convention.
 *
 * FDI (ISO 3950) numbering:
 *   Adult   — quadrant 1 (11-18) upper right, quadrant 2 (21-28) upper left,
 *             quadrant 3 (31-38) lower left, quadrant 4 (41-48) lower right.
 *   Primary — quadrant 5 (51-55) upper right, quadrant 6 (61-65) upper left,
 *             quadrant 7 (71-75) lower left, quadrant 8 (81-85) lower right.
 * The second digit is the position within the quadrant, counting from the
 * midline outward (1 = central incisor ... 8/5 = last molar).
 */

import { DentitionType, type ToothStatus } from "@/types";

export type ToothType = "incisor" | "canine" | "premolar" | "molar";

export type ArchSide = "upper" | "lower";

/** One tooth's static identity — everything derivable from its FDI number alone. */
export type ToothIdentity = {
  toothNumber: number;
  dentitionType: DentitionType;
  quadrant: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Position within the quadrant, counting from the midline (1) outward. */
  position: number;
  arch: ArchSide;
  /** true for quadrants 1/2 (adult) or 5/6 (primary) — the patient's right side. */
  isPatientRight: boolean;
  toothType: ToothType;
};

const ADULT_QUADRANTS: Record<1 | 2 | 3 | 4, { arch: ArchSide; isPatientRight: boolean }> = {
  1: { arch: "upper", isPatientRight: true },
  2: { arch: "upper", isPatientRight: false },
  3: { arch: "lower", isPatientRight: false },
  4: { arch: "lower", isPatientRight: true },
};

const PRIMARY_QUADRANTS: Record<5 | 6 | 7 | 8, { arch: ArchSide; isPatientRight: boolean }> = {
  5: { arch: "upper", isPatientRight: true },
  6: { arch: "upper", isPatientRight: false },
  7: { arch: "lower", isPatientRight: false },
  8: { arch: "lower", isPatientRight: true },
};

/** FDI tooth number ranges, keyed by dentition type. */
export const FDI_TOOTH_NUMBERS: Record<DentitionType, readonly number[]> = {
  adult: [
    11, 12, 13, 14, 15, 16, 17, 18,
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48,
  ],
  primary: [
    51, 52, 53, 54, 55,
    61, 62, 63, 64, 65,
    71, 72, 73, 74, 75,
    81, 82, 83, 84, 85,
  ],
};

export function isValidToothNumber(dentitionType: DentitionType, toothNumber: number): boolean {
  return (FDI_TOOTH_NUMBERS[dentitionType] as readonly number[]).includes(toothNumber);
}

/**
 * Decompose an FDI tooth number into its quadrant, position, arch, side and
 * anatomical type. Throws on an invalid number for the given dentition —
 * callers should validate with isValidToothNumber() first if the number is
 * untrusted input (server actions do this via zod's UpsertToothSchema).
 */
export function getToothIdentity(dentitionType: DentitionType, toothNumber: number): ToothIdentity {
  if (!isValidToothNumber(dentitionType, toothNumber)) {
    throw new Error(`Invalid FDI tooth number ${toothNumber} for dentition "${dentitionType}"`);
  }

  const quadrant = Math.floor(toothNumber / 10) as ToothIdentity["quadrant"];
  const position = toothNumber % 10;

  const quadrantInfo =
    dentitionType === DentitionType.ADULT
      ? ADULT_QUADRANTS[quadrant as 1 | 2 | 3 | 4]
      : PRIMARY_QUADRANTS[quadrant as 5 | 6 | 7 | 8];

  return {
    toothNumber,
    dentitionType,
    quadrant,
    position,
    arch: quadrantInfo.arch,
    isPatientRight: quadrantInfo.isPatientRight,
    toothType: getToothType(dentitionType, position),
  };
}

/**
 * Anatomical type from the within-quadrant position digit.
 *   Adult:   1-2 incisor, 3 canine, 4-5 premolar, 6-8 molar.
 *   Primary: 1-2 incisor, 3 canine, 4-5 molar (primary dentition has no premolars —
 *            the primary molars are shed and replaced by permanent premolars).
 */
export function getToothType(dentitionType: DentitionType, position: number): ToothType {
  if (position <= 2) return "incisor";
  if (position === 3) return "canine";
  if (dentitionType === DentitionType.PRIMARY) return "molar"; // positions 4-5
  if (position <= 5) return "premolar"; // adult 4-5
  return "molar"; // adult 6-8
}

/** One quadrant's tooth numbers, in midline-to-distal order (ascending). */
export type QuadrantRow = {
  quadrant: number;
  teeth: ToothIdentity[];
};

/** Full-arch layout, teeth ordered left-to-right exactly as charted on paper/screen. */
export type DentalChartLayout = {
  dentitionType: DentitionType;
  /** Upper arch, patient's right → patient's left (e.g. adult: 18..11 | 21..28). */
  upper: ToothIdentity[];
  /** Lower arch, patient's right → patient's left (e.g. adult: 48..41 | 31..38). */
  lower: ToothIdentity[];
};

/**
 * Build the full visual layout for a dentition: two rows (upper/lower), each
 * ordered distal-to-midline on the patient's right side then midline-to-distal
 * on the patient's left side — the standard dental-chart reading order shown
 * left-to-right on screen (18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28).
 */
export function getDentalChartLayout(dentitionType: DentitionType): DentalChartLayout {
  const quadrants = dentitionType === DentitionType.ADULT ? [1, 2, 3, 4] : [5, 6, 7, 8];

  const byQuadrant = new Map<number, ToothIdentity[]>();
  for (const q of quadrants) {
    const numbers = (FDI_TOOTH_NUMBERS[dentitionType] as readonly number[]).filter(
      (n) => Math.floor(n / 10) === q
    );
    byQuadrant.set(
      q,
      numbers.map((n) => getToothIdentity(dentitionType, n))
    );
  }

  const [q1, q2, q3, q4] = quadrants;

  // Right-quadrant rows are stored midline-out (ascending, e.g. 11..18); the
  // visual chart reads distal-to-midline on the patient's right, so reverse.
  const upper = [...(byQuadrant.get(q1) ?? [])].reverse().concat(byQuadrant.get(q2) ?? []);
  const lower = [...(byQuadrant.get(q4) ?? [])].reverse().concat(byQuadrant.get(q3) ?? []);

  return { dentitionType, upper, lower };
}

/** Restrained legend order — matches the requirement's listed state order. */
export const TOOTH_STATUS_ORDER: ToothStatus[] = [
  "normal",
  "recommended",
  "planned",
  "in_progress",
  "completed",
  "missing",
];
