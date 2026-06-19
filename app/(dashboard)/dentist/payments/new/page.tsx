import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PaymentForm } from "@/components/dentist/PaymentForm";

export const metadata: Metadata = {
  title: "Record Payment — DentGrow",
};

interface Props {
  searchParams: Promise<{ patient?: string }>;
}

/**
 * /dentist/payments/new
 *
 * Record payment form — dentist role.
 * Supports ?patient=<id> to pre-select a patient.
 */
export default async function NewPaymentPage({ searchParams }: Props) {
  const { patient: patientId } = await searchParams;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="Record Payment" backHref="/dentist/payments" />
      <PaymentForm patientId={patientId} />
    </div>
  );
}

