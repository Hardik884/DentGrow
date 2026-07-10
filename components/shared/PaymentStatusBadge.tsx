import { Badge } from "@/components/ui/badge";
import type { AppointmentPaymentStatus } from "@/actions/payments";

/**
 * PaymentStatusBadge
 *
 * Renders a payment-status chip for an appointment. The status is derived
 * server-side from existing treatment + payment records (see
 * getAppointmentPaymentStatuses) — never recomputed here.
 */
export function PaymentStatusBadge({
  status,
}: {
  status: AppointmentPaymentStatus | undefined;
}) {
  switch (status) {
    case "paid":
      return <Badge variant="success">Paid</Badge>;
    case "partial":
      return <Badge variant="warning">Partial</Badge>;
    case "pending":
      return <Badge variant="danger">Pending</Badge>;
    default:
      return <span className="text-xs text-text-disabled">—</span>;
  }
}
