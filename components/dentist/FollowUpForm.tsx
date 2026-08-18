"use client";

interface FollowUpFormProps {
  followUpId?: string;
  patientId?: string;
}

/**
 * FollowUpForm
 *
 * Create + edit follow-up form — dentist role only.
 * Uses react-hook-form + CreateFollowUpSchema / UpdateFollowUpSchema.
 *
 * Submits to:
 * - New: actions/follow-ups.ts → createFollowUp()
 * - Edit: actions/follow-ups.ts → updateFollowUp()
 */
export function FollowUpForm({ followUpId, patientId }: FollowUpFormProps) {
  // TODO: implement with react-hook-form + zodResolver
  void followUpId;
  void patientId;

  return (
    <div className="bg-surface border rounded-lg p-6">
      <h2 className="font-semibold text-text-primary mb-4">
        {followUpId ? "Edit Follow-Up" : "New Follow-Up"}
      </h2>
      {/* TODO: due_date, notes fields */}
      {/* TODO: Complete / Cancel action buttons */}
    </div>
  );
}
