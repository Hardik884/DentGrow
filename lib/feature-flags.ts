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
