/**
 * lib/consents/templates.ts
 *
 * The DentGrow default consent-template catalogue and the treatment-type ->
 * template auto-selection logic.
 *
 * These defaults are the STARTING POINT a clinic provisions into its own
 * `consent_templates` rows (see actions/consent-templates.ts). Once provisioned,
 * the clinic-owned rows are the source of truth and are independently
 * versioned; editing a clinic template creates a new version and never changes
 * historical signed consents.
 *
 * ── CLINICAL / LEGAL SAFETY ──────────────────────────────────────────────────
 * The prose below is deliberately GENERIC and non-prescriptive. It does not
 * invent procedure-specific statistics or clinical claims. Where a real clinic
 * must add procedure-specific detail, the body carries a bracketed
 * "[Clinic to review …]" marker. Every template ships with a disclaimer stating
 * the treating dentist/clinic (and where appropriate, legal counsel) must review
 * and approve the wording before use with patients. No template asserts legal
 * sufficiency, contains a blanket liability waiver, claims the patient waives
 * legal rights, or states compliance with any jurisdiction.
 *
 * This module is framework-free (no React/Supabase/DB types) and unit-tested.
 */

import type { ConsentContent, ConsentSection } from "./content";

/** Stable keys for the built-in templates. `general` is the fallback. */
export const CONSENT_TEMPLATE_KEYS = [
  "root_canal",
  "extraction",
  "implant",
  "crown_bridge",
  "orthodontic",
  "filling",
  "periodontal",
  "general",
] as const;

export type ConsentTemplateKey = (typeof CONSENT_TEMPLATE_KEYS)[number];

/** A default template definition (the seed for a clinic's editable template). */
export interface ConsentTemplateDefinition {
  key: ConsentTemplateKey;
  name: string;
  /**
   * Lower-cased substrings matched against a treatment's free-text
   * `treatment_type` for auto-selection. `general` intentionally has none — it
   * is the fallback when nothing else matches.
   */
  treatmentKeywords: string[];
  /** Default value of the treatment form's "Consent Required?" toggle. */
  consentRequired: boolean;
  /** Whether consent is clinically recommended (informational). */
  consentRecommended: boolean;
  /** The default document content. */
  content: ConsentContent;
}

/** The configurable clinic review disclaimer shipped with every template. */
export const DEFAULT_CONSENT_DISCLAIMER =
  "This consent form is intended to document the informed-consent discussion " +
  "between the patient and the treating dentist. It should be reviewed and " +
  "approved by the treating dentist/clinic and, where appropriate, by qualified " +
  "legal counsel before it is used with patients. It does not by itself " +
  "constitute legal advice or guarantee legal sufficiency in any jurisdiction.";

/**
 * Non-coercive voluntary-consent statement. Deliberately contains NO waiver of
 * legal rights and NO "I accept all possible complications" language.
 */
const VOLUNTARY_STATEMENT =
  "The proposed treatment, its purpose, the material risks and common " +
  "complications, the reasonable alternatives (including the option of no " +
  "treatment), and the likely consequences of not proceeding have been " +
  "explained to me in a way I understand. I have had the opportunity to ask " +
  "questions and they have been answered to my satisfaction. I understand that " +
  "no guarantee has been made about the outcome of the treatment. I give my " +
  "consent to this treatment voluntarily.";

const QUESTIONS_STATEMENT =
  "I confirm that I was given the opportunity to ask questions about this " +
  "treatment and about the alternatives, and that my questions were answered " +
  "before I signed this form.";

const ACKNOWLEDGEMENT_STATEMENT =
  "I confirm that I have read (or had read to me) and understood the " +
  "information in this form, and that the information above reflects the " +
  "discussion I had with my dentist.";

/**
 * Build the standard section list for a template. The fixed acknowledgement /
 * questions / voluntary statements are shared and marked non-editable per
 * consent; the clinical sections are procedure-specific and editable per
 * consent so the dentist can tailor them for the patient.
 */
function buildSections(parts: {
  diagnosis: string;
  procedureDetail: string;
  benefits: string;
  risksCommon: string;
  risksSerious: string;
  alternatives: string;
  limitations: string;
  aftercare: string;
}): ConsentSection[] {
  return [
    { key: "diagnosis", title: "Diagnosis / Reason for Treatment", body: parts.diagnosis, editablePerConsent: true },
    { key: "procedure_detail", title: "What the Procedure Involves", body: parts.procedureDetail, editablePerConsent: true },
    { key: "benefits", title: "Expected Benefits", body: parts.benefits, editablePerConsent: true },
    { key: "risks_common", title: "Material Risks & Common Complications", body: parts.risksCommon, editablePerConsent: true },
    { key: "risks_serious", title: "Important Serious Risks", body: parts.risksSerious, editablePerConsent: true },
    { key: "alternatives", title: "Alternatives (Including No Treatment)", body: parts.alternatives, editablePerConsent: true },
    { key: "limitations", title: "Expected Limitations & Uncertainty", body: parts.limitations, editablePerConsent: true },
    { key: "aftercare", title: "Aftercare & Important Instructions", body: parts.aftercare, editablePerConsent: true },
    { key: "additional_notes", title: "Additional Patient-Specific Notes", body: "", editablePerConsent: true },
    { key: "questions", title: "Opportunity to Ask Questions", body: QUESTIONS_STATEMENT, editablePerConsent: false },
    { key: "acknowledgement", title: "Patient Acknowledgement", body: ACKNOWLEDGEMENT_STATEMENT, editablePerConsent: false },
    { key: "voluntary", title: "Voluntary Consent", body: VOLUNTARY_STATEMENT, editablePerConsent: false },
  ];
}

const REVIEW = "[Clinic to review and complete this section clinically before use.]";

/** Generic risk boilerplate reused across templates (clinic must specialise). */
const GENERIC_COMMON_RISKS =
  "As with any dental procedure, possible common effects include temporary " +
  "discomfort, swelling, bruising, sensitivity, or soreness around the treated " +
  "area, which usually settle within a few days. " + REVIEW;

const GENERIC_SERIOUS_RISKS =
  "Serious complications are uncommon but can occur. Your dentist will discuss " +
  "the serious risks that are relevant to your specific case and general " +
  "health. " + REVIEW;

const GENERIC_NO_TREATMENT =
  "You may choose not to proceed with the proposed treatment. Your dentist will " +
  "explain the likely consequences of no treatment for your specific situation, " +
  "which may include worsening of the condition, pain, infection, or loss of a " +
  "tooth. " + REVIEW;

/** The eight built-in default templates. */
export const DEFAULT_CONSENT_TEMPLATES: ConsentTemplateDefinition[] = [
  {
    key: "root_canal",
    name: "Root Canal Treatment Consent",
    treatmentKeywords: ["root canal", "rct", "endodont"],
    consentRequired: true,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "Root canal (endodontic) treatment has been recommended for the " +
          "affected tooth. " + REVIEW,
        procedureDetail:
          "Root canal treatment removes infected or inflamed tissue from inside " +
          "the tooth, cleans and shapes the root canals, and fills and seals " +
          "them. It may require more than one appointment. A crown or other " +
          "restoration is often needed afterwards to protect the tooth.",
        benefits:
          "The treatment aims to relieve pain and infection and to retain the " +
          "natural tooth rather than removing it.",
        risksCommon: GENERIC_COMMON_RISKS,
        risksSerious:
          "In some cases the tooth cannot be saved and may still need to be " +
          "removed later; an instrument may separate within a canal; a canal " +
          "may be difficult to locate; or symptoms may persist and further " +
          "treatment (including re-treatment or referral to a specialist) may " +
          "be required. " + REVIEW,
        alternatives:
          "Alternatives may include tooth extraction (with later replacement " +
          "options such as an implant, bridge, or denture), or no treatment. " +
          GENERIC_NO_TREATMENT,
        limitations:
          "Root canal treatment has a good success rate but cannot be " +
          "guaranteed; a treated tooth can still fracture or become re-infected.",
        aftercare:
          "Avoid chewing on the treated tooth until any final restoration is " +
          "placed. Take medication as directed and attend the follow-up and " +
          "restoration appointments. " + REVIEW,
      }),
    },
  },
  {
    key: "extraction",
    name: "Tooth Extraction Consent",
    treatmentKeywords: ["extraction", "extract", "tooth removal"],
    consentRequired: true,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "Removal (extraction) of the affected tooth has been recommended. " + REVIEW,
        procedureDetail:
          "The tooth is removed under local anaesthetic. A surgical approach " +
          "(including sectioning the tooth or reflecting the gum) may be needed " +
          "for some teeth.",
        benefits:
          "Removing the tooth aims to resolve pain, infection, or crowding that " +
          "cannot be adequately treated by other means.",
        risksCommon:
          "Common effects include bleeding, swelling, bruising and discomfort " +
          "for a few days, and a temporary gap in the bite. " + REVIEW,
        risksSerious:
          "Less common risks include dry socket (painful delayed healing), " +
          "infection, damage to adjacent teeth or restorations, a piece of root " +
          "left behind, jaw stiffness, and — for lower back teeth — the small " +
          "risk of temporary or, rarely, lasting altered sensation in the lip, " +
          "chin or tongue due to nerve proximity. For some upper teeth there is " +
          "a small risk of a sinus communication. " + REVIEW,
        alternatives:
          "Alternatives may include root canal treatment, restoration, or other " +
          "measures to keep the tooth where feasible, or no treatment. " +
          GENERIC_NO_TREATMENT,
        limitations:
          "After extraction the space may need replacing (implant, bridge or " +
          "denture) and neighbouring teeth can drift over time.",
        aftercare:
          "Follow the post-extraction instructions provided: bite on gauze as " +
          "directed, avoid rinsing vigorously for 24 hours, avoid smoking, and " +
          "take pain relief as advised. Contact the clinic if bleeding or pain " +
          "is severe or worsening. " + REVIEW,
      }),
    },
  },
  {
    key: "implant",
    name: "Dental Implant Consent",
    treatmentKeywords: ["implant"],
    consentRequired: true,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "A dental implant has been recommended to replace a missing or " +
          "unrestorable tooth. " + REVIEW,
        procedureDetail:
          "An implant (a small titanium or ceramic post) is surgically placed " +
          "into the jawbone and, after a period of healing, restored with a " +
          "crown, bridge or denture. Treatment is staged over several months " +
          "and may involve bone or gum grafting.",
        benefits:
          "The treatment aims to replace the missing tooth with a fixed, " +
          "function-and-appearance solution without altering neighbouring teeth.",
        risksCommon: GENERIC_COMMON_RISKS,
        risksSerious:
          "Risks include failure of the implant to integrate with the bone, " +
          "infection, gum recession, and — for lower implants — proximity to " +
          "nerves that can, rarely, cause altered sensation; for upper implants, " +
          "proximity to the sinus. Implant failure may require removal and " +
          "further treatment. " + REVIEW,
        alternatives:
          "Alternatives may include a conventional bridge, a removable denture, " +
          "or leaving the space unrestored. " + GENERIC_NO_TREATMENT,
        limitations:
          "Success depends on adequate bone, good oral hygiene and general " +
          "health; smoking and some medical conditions reduce success. Outcomes " +
          "cannot be guaranteed and implants require ongoing maintenance.",
        aftercare:
          "Maintain excellent oral hygiene, attend all staged and maintenance " +
          "appointments, and follow post-surgical instructions. " + REVIEW,
      }),
    },
  },
  {
    key: "crown_bridge",
    name: "Crown / Bridge Consent",
    treatmentKeywords: ["crown", "bridge", "cap", "prosthodont"],
    consentRequired: true,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "A crown or bridge has been recommended to restore or replace the " +
          "affected tooth/teeth. " + REVIEW,
        procedureDetail:
          "The tooth is prepared (reshaped), an impression or scan is taken, " +
          "and a temporary restoration is fitted while the crown or bridge is " +
          "made. At a later visit the final restoration is cemented.",
        benefits:
          "The treatment aims to restore strength, function and appearance to " +
          "a damaged, heavily filled, or missing tooth/teeth.",
        risksCommon:
          "Common effects include temporary sensitivity and the need to adjust " +
          "the bite. A temporary crown may come loose before the final fit. " + REVIEW,
        risksSerious:
          "Preparing a tooth can occasionally irritate the nerve and lead to a " +
          "need for root canal treatment; a crowned tooth can still decay at the " +
          "margin or fracture; a bridge places load on the supporting teeth. " + REVIEW,
        alternatives:
          "Alternatives may include a direct filling, a different type of " +
          "restoration, an implant (for a bridge), or no treatment. " +
          GENERIC_NO_TREATMENT,
        limitations:
          "Crowns and bridges have a long but finite lifespan and may need " +
          "replacement in future; a precise colour match cannot always be " +
          "achieved.",
        aftercare:
          "Care for the temporary restoration as advised, maintain good hygiene " +
          "around the margins, and attend the fitting appointment. " + REVIEW,
      }),
    },
  },
  {
    key: "orthodontic",
    name: "Orthodontic Treatment Consent",
    treatmentKeywords: ["ortho", "braces", "aligner"],
    consentRequired: true,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "Orthodontic treatment has been recommended to correct the position " +
          "of the teeth and/or the bite. " + REVIEW,
        procedureDetail:
          "Teeth are moved gradually using fixed braces or removable aligners " +
          "over months to years, with regular adjustment visits. Some teeth may " +
          "need removing, and retainers are required afterwards to hold the " +
          "result.",
        benefits:
          "The treatment aims to improve alignment, bite function and " +
          "appearance, and can make cleaning easier.",
        risksCommon:
          "Common effects include discomfort after adjustments, temporary " +
          "difficulty speaking or eating, and mouth ulceration from appliances. " + REVIEW,
        risksSerious:
          "Risks include shortening of tooth roots, gum recession, decalc" +
          "ification or decay if hygiene is poor, relapse if retainers are not " +
          "worn, and jaw-joint symptoms. " + REVIEW,
        alternatives:
          "Alternatives may include a different appliance type, limited " +
          "treatment, or no treatment. " + GENERIC_NO_TREATMENT,
        limitations:
          "The final result depends heavily on patient cooperation (wear time " +
          "and hygiene); an ideal result and stability cannot be guaranteed, and " +
          "lifelong retainer wear may be advised.",
        aftercare:
          "Maintain excellent oral hygiene, avoid hard/sticky foods that damage " +
          "appliances, attend all adjustment visits, and wear retainers exactly " +
          "as instructed. " + REVIEW,
      }),
    },
  },
  {
    key: "filling",
    name: "Filling / Restorative Treatment Consent",
    treatmentKeywords: ["filling", "restorative", "restoration", "composite", "cavity"],
    consentRequired: false,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "A filling / restoration has been recommended to treat decay or " +
          "damage in the affected tooth. " + REVIEW,
        procedureDetail:
          "Decayed or damaged tooth material is removed and the tooth is " +
          "restored with a suitable filling material, usually in a single visit " +
          "under local anaesthetic where needed.",
        benefits:
          "The treatment aims to stop decay progressing and to restore the " +
          "tooth's function and shape.",
        risksCommon:
          "Common effects include temporary sensitivity to hot, cold or " +
          "pressure, and the need to adjust the bite. " + REVIEW,
        risksSerious:
          "A deep filling can occasionally irritate the nerve and lead to a " +
          "need for root canal treatment or extraction; a filling can chip, " +
          "wear or fall out over time. " + REVIEW,
        alternatives:
          "Alternatives may include a different restoration type, a crown for " +
          "extensive damage, or no treatment. " + GENERIC_NO_TREATMENT,
        limitations:
          "Fillings have a finite lifespan and may need replacement; a precise " +
          "colour match is not always possible.",
        aftercare:
          "Avoid chewing on the numbed side until sensation returns; report a " +
          "high bite or lasting sensitivity. " + REVIEW,
      }),
    },
  },
  {
    key: "periodontal",
    name: "Periodontal Treatment Consent",
    treatmentKeywords: ["scaling", "perio", "gum", "cleaning", "root planing"],
    consentRequired: false,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "Periodontal (gum) treatment such as scaling and root planing has " +
          "been recommended to treat gum disease. " + REVIEW,
        procedureDetail:
          "Plaque, calculus (tartar) and bacterial deposits are removed from " +
          "above and below the gum line, sometimes over several visits and " +
          "sometimes under local anaesthetic.",
        benefits:
          "The treatment aims to reduce gum inflammation and bleeding, slow the " +
          "progression of gum disease, and help retain the teeth.",
        risksCommon:
          "Common effects include gum tenderness, bleeding and increased tooth " +
          "sensitivity for a period after treatment, and the appearance of " +
          "gaps as swollen gums shrink to health. " + REVIEW,
        risksSerious:
          "Advanced gum disease may not fully resolve and some teeth may still " +
          "be lost; further or surgical periodontal treatment or referral may " +
          "be needed. " + REVIEW,
        alternatives:
          "Alternatives may include more frequent hygiene visits, surgical " +
          "periodontal treatment, or no treatment. " + GENERIC_NO_TREATMENT,
        limitations:
          "Success depends heavily on daily home care and stopping smoking; " +
          "outcomes cannot be guaranteed and ongoing maintenance is required.",
        aftercare:
          "Follow the oral-hygiene instructions provided, use any prescribed " +
          "aids, and attend maintenance appointments. " + REVIEW,
      }),
    },
  },
  {
    key: "general",
    name: "General Dental Treatment Consent",
    treatmentKeywords: [], // fallback — matches nothing directly
    consentRequired: false,
    consentRecommended: true,
    content: {
      disclaimer: DEFAULT_CONSENT_DISCLAIMER,
      sections: buildSections({
        diagnosis:
          "The proposed dental treatment has been recommended following " +
          "examination. " + REVIEW,
        procedureDetail:
          "Your dentist will explain what the proposed treatment involves, how " +
          "long it is expected to take, and whether more than one visit is " +
          "needed. " + REVIEW,
        benefits:
          "The treatment aims to address the diagnosed problem and restore or " +
          "protect your oral health. " + REVIEW,
        risksCommon: GENERIC_COMMON_RISKS,
        risksSerious: GENERIC_SERIOUS_RISKS,
        alternatives:
          "Reasonable alternatives to the proposed treatment will be discussed " +
          "with you. " + GENERIC_NO_TREATMENT,
        limitations:
          "No dental treatment outcome can be guaranteed; your dentist will " +
          "explain the expected limitations relevant to your case. " + REVIEW,
        aftercare:
          "Any specific aftercare instructions will be provided at your " +
          "appointment. " + REVIEW,
      }),
    },
  },
];

/** Map of key -> default definition for quick lookup. */
export const DEFAULT_TEMPLATE_BY_KEY: Record<ConsentTemplateKey, ConsentTemplateDefinition> =
  DEFAULT_CONSENT_TEMPLATES.reduce(
    (acc, t) => {
      acc[t.key] = t;
      return acc;
    },
    {} as Record<ConsentTemplateKey, ConsentTemplateDefinition>
  );

/**
 * Auto-select the consent template key for a given free-text treatment type.
 *
 * Case-insensitive substring match of the treatment type against each
 * template's keywords. The first non-fallback template with a matching keyword
 * wins (definition order is the priority order). Falls back to `general` when
 * nothing matches, when the input is empty, or when the input is unrecognised.
 *
 * Pure and deterministic — the single source of truth for auto-selection, used
 * by the treatment form, server actions, and tests alike.
 */
export function selectTemplateKeyForTreatmentType(
  treatmentType: string | null | undefined
): ConsentTemplateKey {
  if (!treatmentType || treatmentType.trim().length === 0) return "general";
  const haystack = treatmentType.toLowerCase();

  for (const template of DEFAULT_CONSENT_TEMPLATES) {
    if (template.key === "general") continue;
    if (template.treatmentKeywords.some((kw) => haystack.includes(kw))) {
      return template.key;
    }
  }
  return "general";
}

/** Convenience: get the full default definition auto-selected for a treatment type. */
export function selectTemplateForTreatmentType(
  treatmentType: string | null | undefined
): ConsentTemplateDefinition {
  return DEFAULT_TEMPLATE_BY_KEY[selectTemplateKeyForTreatmentType(treatmentType)];
}
