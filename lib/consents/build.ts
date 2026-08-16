/**
 * lib/consents/build.ts
 *
 * Pure helpers for assembling consent content and the immutable snapshot.
 * Framework-free and unit-tested.
 */

import type { ConsentContent, ConsentSection, ConsentSnapshot } from "./content";
import { cloneConsentContent } from "./content";

/** A per-consent section edit. */
export interface ConsentSectionEdit {
  key: string;
  body: string;
}

/**
 * Apply patient-specific edits to consent content, returning a NEW content
 * object (the input is never mutated).
 *
 * SAFETY: only sections flagged `editablePerConsent` may be overridden. An edit
 * targeting a fixed section (acknowledgement / questions / voluntary) or an
 * unknown key is ignored — a per-consent edit can never weaken the fixed
 * informed-consent statements, and never invent new sections.
 */
export function applyConsentEdits(
  content: ConsentContent,
  edits: ConsentSectionEdit[] | undefined | null
): ConsentContent {
  const next = cloneConsentContent(content);
  if (!edits || edits.length === 0) return next;

  const byKey = new Map(edits.map((e) => [e.key, e.body]));
  next.sections = next.sections.map((section: ConsentSection) => {
    if (section.editablePerConsent && byKey.has(section.key)) {
      return { ...section, body: byKey.get(section.key) ?? section.body };
    }
    return section;
  });
  return next;
}

/** Compute age in whole years from a date-of-birth string, or null. */
export function ageFromDob(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 200 ? age : null;
}

/**
 * Build the immutable consent snapshot from resolved parts. This is what is
 * stored in consents.content_snapshot — editable while draft (rebuilt from the
 * latest edits), frozen once signed.
 */
export function buildConsentSnapshot(input: {
  templateKey: string;
  templateName: string;
  templateVersion: number;
  content: ConsentContent;
  patient: { name: string; phone: string | null; dob: string | null };
  treatmentType: string | null;
  clinic: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    registrationNumber: string | null;
  };
  dentist: { name: string | null; signatureUrl: string | null };
  now?: Date;
}): ConsentSnapshot {
  const now = input.now ?? new Date();
  return {
    templateKey: input.templateKey,
    templateName: input.templateName,
    templateVersion: input.templateVersion,
    content: cloneConsentContent(input.content),
    patient: {
      name: input.patient.name,
      phone: input.patient.phone,
      age: ageFromDob(input.patient.dob, now),
    },
    treatment: { type: input.treatmentType },
    clinic: { ...input.clinic },
    dentist: { ...input.dentist },
    frozenAt: now.toISOString(),
  };
}
