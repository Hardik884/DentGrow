import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PaymentForm } from "@/components/dentist/PaymentForm";
import { checkReceptionistPaymentAccess } from "@/actions/clinic-settings";

export const metadata: Metadata = {
  title: "Record Payment",
};

interface Props {
  searchParams: Promise<{ patient?: string }>;
}

/**
 * /receptionist/payments/new
 *
 * Record payment form — receptionist role.
 * Conditional access: requires payment permission from clinic settings.
 * Supports ?patient=<id> to pre-select a patient.
 * Reuses shared PaymentForm component.
 */
export default async function ReceptionistNewPaymentPage({ searchParams }: Props) {
  const hasAccess = await checkReceptionistPaymentAccess();

  if (!hasAccess) {
    redirect("/receptionist");
  }

  const { patient: patientId } = await searchParams;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="Record Payment" backHref="/receptionist/payments" />
      <PaymentForm patientId={patientId} />
    </div>
  );
}

