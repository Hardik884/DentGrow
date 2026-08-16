/**
 * lib/consents/content.ts
 *
 * Shared, framework-free type definitions for consent-document CONTENT.
 *
 * A consent document is an ordered list of typed prose SECTIONS plus a
 * configurable clinic disclaimer. Structural parts of the printed document —
 * patient demographics, clinic letterhead, the signature blocks and dates — are
 * NOT stored as content sections; they are rendered by the document component
 * from the consent row and its snapshot, so they can never drift from the
 * record. Only the informed-consent PROSE lives here.
 *
 * This file has no runtime dependencies (no React, no Supabase, no DB types) so
 * it can be imported from server actions, client components, pure library code,
 * and unit tests alike.
 *
 * IMPORTANT (clinical/legal): the default wording shipped in
 * lib/consents/templates.ts is a STARTING POINT for the clinic to review and
 * approve. Nothing here asserts legal sufficiency. See the disclaimer field.
 */

/** Stable identifiers for the informed-consent sections we render, in the
 *  canonical order they appear in a document. Not every template uses every
 *  key, and clinics may rename the human-facing `title` freely. */
export type ConsentSectionKey =
  | "diagnosis" // reason for treatment
  | "procedure_detail" // what the procedure involves
  | "benefits" // expected benefits / intended outcome
  | "risks_common" // material risks & common complications
  | "risks_serious" // important serious risks where clinically relevant
  | "alternatives" // alternatives, incl. no treatment
  | "limitations" // expected limitations / uncertainty
  | "aftercare" // aftercare / important instructions
  | "additional_notes" // patient-specific notes added for THIS consent
  | "questions" // opportunity-to-ask-questions acknowledgement
  | "acknowledgement" // patient acknowledgement
  | "voluntary"; // voluntary consent statement

/** One prose section of a consent document. */
export interface ConsentSection {
  /** Stable key (usually a ConsentSectionKey, but clinics may add custom ones). */
  key: string;
  /** Heading shown in the rendered document. Clinic-editable. */
  title: string;
  /** The prose the patient reads. Clinic-editable in the master template. */
  body: string;
  /**
   * Whether the dentist may tailor THIS section for THIS patient without
   * touching the master template. Enabled for clinical specifics
   * (diagnosis, alternatives discussed, limitations, aftercare, extra notes);
   * disabled for the fixed acknowledgement / voluntary-consent statements so a
   * per-patient edit can never quietly weaken them.
   */
  editablePerConsent: boolean;
}

/** The full editable content of a consent document. */
export interface ConsentContent {
  /** Ordered prose sections. */
  sections: ConsentSection[];
  /**
   * Configurable clinic disclaimer, rendered in a distinct box. Documents that
   * this form records an informed-consent discussion and must be reviewed and
   * approved by the treating dentist/clinic (and, where appropriate, legal
   * counsel) before production use. NOT a claim of legal sufficiency.
   */
  disclaimer: string;
}

/**
 * The immutable snapshot frozen onto a consent when it is signed (digital) or
 * created (uploaded). It captures everything needed to reproduce the exact
 * document that was presented and agreed to, independent of any later master
 * template change.
 */
export interface ConsentSnapshot {
  /** Template identity at snapshot time. */
  templateKey: string;
  templateName: string;
  templateVersion: number;
  /** The exact content presented. */
  content: ConsentContent;
  /** Patient identity as printed. */
  patient: {
    name: string;
    phone: string | null;
    /** Age in years at snapshot time, or null if DOB unknown. */
    age: number | null;
  };
  /** Treatment as printed. */
  treatment: {
    type: string | null;
  };
  /** Clinic letterhead as printed. */
  clinic: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    registrationNumber: string | null;
  };
  /** Dentist as printed (name + signature image URL, resolved at sign time). */
  dentist: {
    name: string | null;
    signatureUrl: string | null;
  };
  /** When this snapshot was frozen (ISO 8601). */
  frozenAt: string;
}

/** Deep-clone consent content so per-consent edits never mutate a shared
 *  default object. structuredClone is available in Node 18+ and modern
 *  browsers, which this project targets. */
export function cloneConsentContent(content: ConsentContent): ConsentContent {
  return structuredClone(content);
}
