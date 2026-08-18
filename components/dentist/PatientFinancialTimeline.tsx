import Link from "next/link";
import { ArrowRight, IndianRupee } from "lucide-react";

import { getOutstandingBalance, getPatientPayments } from "@/actions/payments";
import { getFollowUp } from "@/actions/follow-ups";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Payment } from "@/types";

interface PatientFinancialTimelineProps {
  patientId: string;
  /** The appointment being viewed, so its own payments are not double-counted. */
  appointmentId: string;
  /** Set when this visit was booked to fulfil a follow-up. */
  followUpId?: string | null;
}

/** How many prior payments to show before pointing at the full history. */
const RECENT_LIMIT = 4;

/**
 * The patient's money, across every visit — not just this one.
 *
 * The Payments panel below this deliberately shows only what was charged and
 * paid on THIS appointment, which is right for reconciling a single visit and
 * wrong as the whole picture. A visit auto-created from a follow-up has no
 * treatments and no payments yet, so that panel renders empty and the clinic
 * reads it as a patient who owes nothing — when in fact the balance from the
 * visit that prompted the recall is still open.
 *
 * This strip is the continuity: one running balance and the payments that came
 * before, so the follow-up visit is visibly part of the same financial story
 * rather than a fresh start.
 *
 * It reuses `getOutstandingBalance` and `getPatientPayments` exactly as they
 * are. Nothing new is computed and no payment is recorded here, so there is no
 * second source of truth and no way to create a duplicate entry.
 */
export async function PatientFinancialTimeline({
  patientId,
  appointmentId,
  followUpId,
}: PatientFinancialTimelineProps) {
  const [balanceResult, paymentsResult, followUpResult] = await Promise.all([
    getOutstandingBalance(patientId),
    getPatientPayments(patientId),
    followUpId ? getFollowUp(followUpId) : Promise.resolve(null),
  ]);

  const balance = balanceResult.data ?? 0;
  const allPayments = (paymentsResult.data ?? []) as Payment[];

  // Payments from every OTHER visit. The current visit's payments already have
  // their own panel; repeating them here would read as double the money.
  const priorPayments = allPayments
    .filter((p) => p.appointment_id !== appointmentId)
    .slice(0, RECENT_LIMIT);

  const followUp = followUpResult?.data ?? null;
  const priorCount = allPayments.filter((p) => p.appointment_id !== appointmentId).length;

  // Nothing to add: no history and no follow-up origin means this strip would
  // only restate what the panel below already says.
  if (balance === 0 && priorPayments.length === 0 && !followUp) return null;

  return (
    <div className="bg-surface border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-text-primary">Account so far</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {followUp
              ? "This visit was booked as a follow-up, so it continues the patient's existing account."
              : "Across all of this patient's visits, not just this one."}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-text-primary tabular-nums leading-none">
            {formatCurrency(balance)}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {balance > 0 ? "outstanding" : "fully settled"}
          </div>
        </div>
      </div>

      {/* Why this visit exists, when it came from a recall. */}
      {followUp && (
        <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
          <p className="text-xs text-text-secondary">
            Follow-up due {formatDate(followUp.due_date)}
            {followUp.follow_up_type ? ` — ${followUp.follow_up_type}` : ""}
          </p>
          {followUp.notes && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{followUp.notes}</p>
          )}
        </div>
      )}

      {priorPayments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Earlier payments
          </p>
          <ul className="divide-y divide-border border border-border rounded-lg">
            {priorPayments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-xs text-text-secondary">
                  {formatDate(p.payment_date)}
                  {p.payment_type === "opd" ? " · consultation" : ""}
                </span>
                <span className="text-sm font-medium text-text-primary tabular-nums flex items-center">
                  <IndianRupee className="h-3 w-3 text-text-disabled" aria-hidden />
                  {Number(p.amount).toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
          {priorCount > priorPayments.length && (
            <Link
              href={`/dentist/patients/${patientId}?tab=payments`}
              className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              See all {priorCount} earlier payments
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
