/**
 * lib/portal-profile.ts
 *
 * Validation schema + constants for the patient portal profile update flow.
 *
 * These cannot live in `actions/portal-link.ts` because that file is marked
 * "use server" and Next.js only allows async function exports from server
 * action modules.
 */

import { z } from "zod";

/**
 * The fields a patient can update from the portal profile page.
 * Clinical and system fields (name, gender, date_of_birth, notes,
 * total_visits, last_visit) are NOT in this list and must never be
 * accepted from a portal-side request.
 */
export const PORTAL_UPDATABLE_FIELDS = [
  "phone",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

const phoneRegex = /^[+]?[\d\s\-().]{7,15}$/;

export const UpdatePortalProfileSchema = z.object({
  phone: z
    .string()
    .refine(
      (val) => val === "" || phoneRegex.test(val),
      "Invalid phone number format"
    )
    .optional(),
  address: z.string().max(500).optional(),
  emergency_contact_name: z.string().max(100).optional(),
  emergency_contact_phone: z
    .string()
    .refine(
      (val) => val === "" || phoneRegex.test(val),
      "Invalid emergency contact phone"
    )
    .optional(),
});
export type UpdatePortalProfileInput = z.infer<typeof UpdatePortalProfileSchema>;
