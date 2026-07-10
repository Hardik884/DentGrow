import { Badge } from "@/components/ui/badge";
import { FOLLOW_UP_CONFIRMATION_STATUS_LABELS } from "@/lib/utils";

interface ConfirmationStatusBadgeProps {
  status: "tentative" | "confirmed" | null | undefined;
}

/**
 * ConfirmationStatusBadge
 *
 * Displays a follow-up appointment's confirmation status (Tentative / Confirmed)
 * using the shared Badge styles. Defaults to "confirmed" when unset so legacy
 * records render consistently.
 */
export function ConfirmationStatusBadge({ status }: ConfirmationStatusBadgeProps) {
  const value = status ?? "confirmed";
  return (
    <Badge variant={value === "confirmed" ? "success" : "warning"}>
      {FOLLOW_UP_CONFIRMATION_STATUS_LABELS[value]}
    </Badge>
  );
}
