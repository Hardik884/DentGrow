import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpForm } from "@/components/follow-ups/FollowUpForm";
import { getFollowUp } from "@/actions/follow-ups";

export const metadata: Metadata = {
  title: "Follow-Up — DentGrow",
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /dentist/follow-ups/[id]
 *
 * Follow-up detail + edit form — dentist role.
 * Fetches follow-up server-side and passes initialData to the form.
 * Shows complete and cancel action buttons for pending follow-ups.
 */
export default async function DentistFollowUpDetailPage({ params }: Props) {
  const { id } = await params;

  if (!id) notFound();

  const result = await getFollowUp(id);

  if (result.error || !result.data) {
    notFound();
  }

  const followUp = result.data;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Follow-Up"
        backHref={
          followUp.patient
            ? `/dentist/patients/${followUp.patient_id}?tab=follow-ups`
            : "/dentist/follow-ups"
        }
      />

      <FollowUpForm
        followUpId={id}
        initialData={followUp}
        role="dentist"
      />
    </div>
  );
}
