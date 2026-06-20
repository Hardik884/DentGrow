import Link from "next/link";
import { getFollowUpsForPatient } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "./OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  formatDate,
  formatDateTime,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
} from "@/lib/utils";
import { Calendar, Stethoscope } from "lucide-react";
import type { FollowUpWithRelations } from "@/types";

interface PatientFollowUpsTabProps {
  patientId: string;
  patientName?: string;
  /** base href — controls where "New" and detail links go */
  baseHref: string;
  /** role — controls whether create button is shown */
  role: "dentist" | "receptionist";
}

/**
 * PatientFollowUpsTab
 *
 * Server Component — follow-up timeline panel on patient profile pages.
 *
 * Shows:
 * - Overdue follow-ups (pending, due_date < today) — highlighted in red
 * - Upcoming follow-ups (pending, not overdue)
 * - Completed follow-ups
 * - Cancelled follow-ups
 *
 * Each row shows:
 * - Follow-up type
 * - Due date + urgency indicator
 * - Related treatment + appointment (if linked)
 * - Status badge
 *
 * Dentist: sees "+ New Follow-Up" button and follow-up detail links.
 * Receptionist: sees follow-ups read-only.
 */
export async function PatientFollowUpsTab({
  patientId,
  patientName,
  baseHref,
  role,
}: PatientFollowUpsTabProps) {
  const result = await getFollowUpsForPatient(patientId);
  const followUps: FollowUpWithRelations[] = result.data ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue  = followUps.filter((f) => f.status === "pending" && new Date(f.due_date) < today);
  const upcoming = followUps.filter((f) => f.status === "pending" && new Date(f.due_date) >= today);
  const completed = followUps.filter((f) => f.status === "completed");
  const cancelled = followUps.filter((f) => f.status === "cancelled");

  // Build the "new follow-up" href — include patientName so the form can
  // show the selected-patient chip without a client-side search round-trip.
  const newHref = patientName
    ? `${baseHref}/follow-ups/new?patient=${patientId}&patientName=${encodeURIComponent(patientName)}`
    : `${baseHref}/follow-ups/new?patient=${patientId}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">Follow-Ups</h3>
          {followUps.length > 0 && (
            <p className="text-xs text-text-secondary mt-0.5">
              {followUps.length} total ·{" "}
              {overdue.length > 0 && (
                <span className="text-danger font-medium">{overdue.length} overdue · </span>
              )}
              {upcoming.length} upcoming · {completed.length} completed
            </p>
          )}
        </div>
        {role === "dentist" && (
          <Link
            href={newHref}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + New Follow-Up
          </Link>
        )}
      </div>

      {result.error && (
        <p className="text-sm text-danger bg-danger-bg border border-[#FECACA] rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {followUps.length === 0 ? (
        <div className="bg-white border border-border rounded-xl px-4 py-8 text-center">
          <p className="text-sm text-text-secondary">No follow-ups recorded for this patient.</p>
          {role === "dentist" && (
            <Link
              href={newHref}
              className="mt-3 inline-block text-sm text-blue-600 hover:underline underline-offset-4"
            >
              Create the first follow-up
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {overdue.length > 0 && (
            <TimelineSection title="Overdue" titleClass="text-danger">
              {overdue.map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(
                  (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <FollowUpTimelineRow
                    key={f.id}
                    followUp={f}
                    isOverdue
                    diffLabel={`${diffDays} day${diffDays !== 1 ? "s" : ""} overdue`}
                    baseHref={baseHref}
                  />
                );
              })}
            </TimelineSection>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <TimelineSection title="Upcoming">
              {upcoming.map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(
                  (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <FollowUpTimelineRow
                    key={f.id}
                    followUp={f}
                    diffLabel={
                      diffDays === 0
                        ? "Due today"
                        : `${diffDays} day${diffDays !== 1 ? "s" : ""} remaining`
                    }
                    baseHref={baseHref}
                  />
                );
              })}
            </TimelineSection>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <TimelineSection title="Completed">
              {completed.map((f) => (
                <FollowUpTimelineRow key={f.id} followUp={f} baseHref={baseHref} />
              ))}
            </TimelineSection>
          )}

          {/* Cancelled */}
          {cancelled.length > 0 && (
            <TimelineSection title="Cancelled" titleClass="text-text-secondary">
              {cancelled.map((f) => (
                <FollowUpTimelineRow key={f.id} followUp={f} baseHref={baseHref} />
              ))}
            </TimelineSection>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function TimelineSection({
  title,
  titleClass = "text-text-primary",
  children,
}: {
  title: string;
  titleClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${titleClass}`}>
        {title}
      </p>
      <div className="bg-white border border-border rounded-xl divide-y divide-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function FollowUpTimelineRow({
  followUp,
  isOverdue = false,
  diffLabel,
  baseHref,
}: {
  followUp: FollowUpWithRelations;
  isOverdue?: boolean;
  diffLabel?: string;
  baseHref: string;
}) {
  const followUpType: string = followUp.follow_up_type ?? "";
  const typeLabel = FOLLOW_UP_TYPE_LABELS[followUpType] ?? followUpType ?? "Follow-up";

  return (
    <Link
      href={`${baseHref}/follow-ups/${followUp.id}`}
      className="flex items-start justify-between px-4 py-3 hover:bg-[#FAFAFA] transition-colors gap-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        {/* Type label */}
        <p className="text-sm font-semibold text-text-primary">{typeLabel}</p>

        {/* Due date + urgency */}
        <p className="text-xs text-text-secondary">
          Due {formatDate(followUp.due_date)}
          {followUp.status === "completed" && (
            <span className="text-success ml-2">
              · Completed {formatDate(followUp.updated_at)}
            </span>
          )}
          {diffLabel && (
            <span
              className={`ml-2 font-medium ${
                isOverdue ? "text-danger" : "text-amber-600"
              }`}
            >
              · {diffLabel}
            </span>
          )}
        </p>

        {/* Notes */}
        {followUp.notes && (
          <p className="text-xs text-text-secondary truncate">{followUp.notes}</p>
        )}

        {/* Related appointment + treatment */}
        {(followUp.appointment || followUp.treatment) && (
          <div className="flex items-center gap-3 flex-wrap">
            {followUp.appointment && (
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                {formatDateTime(followUp.appointment.scheduled_at)}
              </span>
            )}
            {followUp.treatment && (
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <Stethoscope className="h-3 w-3 shrink-0" aria-hidden />
                {followUp.treatment.treatment_type}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        {isOverdue && <OverdueFollowUpBadge />}
        <StatusBadge
          label={FOLLOW_UP_STATUS_LABELS[followUp.status]}
          variant={
            followUp.status === "completed"
              ? "success"
              : followUp.status === "cancelled"
                ? "error"
                : isOverdue
                  ? "error"
                  : "default"
          }
        />
      </div>
    </Link>
  );
}
