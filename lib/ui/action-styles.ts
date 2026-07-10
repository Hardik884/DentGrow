/**
 * Shared inline-action button styles.
 *
 * ACTION_BUTTON is the single source of truth for the app-wide "inline action"
 * / "View" button — the bordered pill first shipped on the Appointments page
 * (AppointmentRowActions). Every listing page's View button and every visit
 * quick-action reuses this exact string so sizing, typography, padding, radius,
 * hover and focus states are identical everywhere.
 *
 * ACTION_BUTTON_DANGER is the destructive counterpart (e.g. Cancel).
 */

export const ACTION_BUTTON =
  "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border text-text-secondary hover:bg-surface hover:text-text-primary hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed";

export const ACTION_BUTTON_DANGER =
  "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-[#FECACA] text-danger hover:bg-danger-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-danger disabled:opacity-50 disabled:cursor-not-allowed";
