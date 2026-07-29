/**
 * Feature Flags Configuration
 * 
 * Centralized feature toggles for the DentGrow application.
 * Change these flags to enable/disable features across the application.
 */

export const FEATURE_FLAGS = {
  /**
   * PATIENT_BOOKING_ENABLED
   * 
   * Controls whether patients can initiate appointment booking through:
   * - Patient Portal UI (Book Appointment buttons, CTAs)
   * - AI Chatbot appointment booking tools
   * 
   * When disabled:
   * - All patient-facing booking UI is hidden
   * - AI chatbot returns a friendly message for booking requests
   * - Server-side validation enforces the restriction
   * - All business logic and components remain intact
   * 
   * To re-enable patient booking: set to true
   * 
   * Staff (dentist/receptionist) booking is NOT affected by this flag.
   */
  PATIENT_BOOKING_ENABLED: false,
} as const;

/**
 * BUSINESS_BRAIN_CLINIC_IDS
 *
 * Clinics allowed to see the Business Brain dashboard.
 *
 * An explicit allow-list rather than a boolean: the Business Brain is a
 * development surface, and a global toggle would expose it to the pilot clinic
 * the moment anyone flipped it. Naming the clinics makes accidental exposure
 * impossible — a clinic that is not listed cannot reach the route at all
 * (the page returns 404, so it does not even acknowledge that it exists) and
 * never sees the navigation entry.
 *
 * Production clinics are deliberately absent:
 *   11111111-…  Dr. Liying's Dental Care  (live pilot)
 *   22222222-…  Clinic B
 */
export const BUSINESS_BRAIN_CLINIC_IDS: readonly string[] = [
  // My Dental Clinic — development / demo
  "00000000-0000-0000-0000-000000000001",
];

/** True when this clinic may access the Business Brain dashboard. */
export function isBusinessBrainEnabled(clinicId: string | null | undefined): boolean {
  return !!clinicId && BUSINESS_BRAIN_CLINIC_IDS.includes(clinicId);
}

/**
 * Helper to check if patient booking is enabled
 */
export function isPatientBookingEnabled(): boolean {
  return FEATURE_FLAGS.PATIENT_BOOKING_ENABLED;
}

/**
 * Message to display when patient booking is disabled
 */
export const PATIENT_BOOKING_DISABLED_MESSAGE =
  "Online appointment booking is temporarily unavailable during our pilot phase. Please contact your clinic directly to schedule an appointment.";
