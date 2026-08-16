/**
 * lib/consents/status.ts
 *
 * Consent status model + transition/immutability rules. Framework-free and
 * unit-tested. The single source of truth used by server actions (to guard
 * mutations) and the UI (to decide which actions to show).
 *
 * Statuses (spec §8):
 *   draft         — being prepared; fully editable.
 *   ready_to_sign — finalised for the patient to sign; content still editable
 *                   back to draft, but presented as ready.
 *   signed        — a signature (digital) or an uploaded signed document exists.
 *                   IMMUTABLE and terminal. Never editable; a material change
 *                   requires creating a NEW consent.
 *   cancelled     — abandoned. Terminal.
 */

export const CONSENT_STATUSES = ["draft", "ready_to_sign", "signed", "cancelled"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_SOURCES = ["digital", "uploaded"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/** Human-facing labels. Uploaded signed consents are labelled distinctly from
 *  digitally-signed ones so an upload never looks app-signed (spec §9/upload). */
export function consentStatusLabel(status: ConsentStatus, source: ConsentSource): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready_to_sign":
      return "Ready to Sign";
    case "signed":
      return source === "uploaded" ? "Patient Signed — Uploaded" : "Digitally Signed";
    case "cancelled":
      return "Cancelled";
  }
}

/** Allowed status transitions for a DIGITAL consent authored in-app. */
const DIGITAL_TRANSITIONS: Record<ConsentStatus, ConsentStatus[]> = {
  draft: ["ready_to_sign", "signed", "cancelled"],
  ready_to_sign: ["draft", "signed", "cancelled"],
  signed: [], // terminal + immutable
  cancelled: [], // terminal
};

export function canTransition(from: ConsentStatus, to: ConsentStatus): boolean {
  return DIGITAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Whether a consent's editable content may still be changed. Only unsigned,
 * non-cancelled consents are editable. A signed consent is permanently frozen.
 */
export function isConsentEditable(status: ConsentStatus): boolean {
  return status === "draft" || status === "ready_to_sign";
}

/** Whether a consent can be signed right now (digital signing flow). */
export function canSignConsent(status: ConsentStatus, source: ConsentSource): boolean {
  return source === "digital" && (status === "draft" || status === "ready_to_sign");
}

/** Whether a consent can be cancelled. */
export function canCancelConsent(status: ConsentStatus): boolean {
  return status === "draft" || status === "ready_to_sign";
}

/** A signed consent is immutable — this is the guard used everywhere. */
export function isConsentImmutable(status: ConsentStatus): boolean {
  return status === "signed";
}
