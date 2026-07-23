/**
 * Business Brain — Domain: Shared references
 *
 * Small building blocks shared across several domain models (e.g. a way to
 * point at the DentGrow entities a Signal or Action relates to).
 *
 * These are business concepts, NOT database rows. `id` is an opaque reference,
 * not a foreign key.
 */

/**
 * The kinds of DentGrow business entities a Business Brain object can refer to.
 */
export const EntityType = {
  PATIENT: "patient",
  APPOINTMENT: "appointment",
  TREATMENT: "treatment",
  PAYMENT: "payment",
  FOLLOW_UP: "follow_up",
  QUEUE_ENTRY: "queue_entry",
  CLINIC: "clinic",
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/**
 * A typed, human-labelled reference to a DentGrow entity. Lets engines and the
 * UI link a Signal/Action back to the patient, appointment, etc. it concerns
 * without embedding database rows.
 */
export interface RelatedEntity {
  /** What kind of entity this points to. */
  readonly type: EntityType;
  /** Opaque identifier of the entity within DentGrow. */
  readonly id: string;
  /** Optional display label (e.g. patient name) for UI rendering. */
  readonly label?: string;
}
