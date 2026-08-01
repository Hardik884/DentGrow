"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Hand,
  MessageSquare,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionPlanView, ActionView } from "@/lib/business-brain/action-view";

interface ActionPlanCardProps {
  plan: ActionPlanView;
  /** The top plan opens by default so the page is scannable before it is readable. */
  defaultOpen?: boolean;
}

const PRIORITY_STRIPE: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#EA580C]",
  medium: "bg-[#CA8A04]",
  low: "bg-[#65A30D]",
};

/**
 * One workflow's prepared actions.
 *
 * The card leads with the single best starting click — the engine names it, so
 * the UI never guesses — and folds the rest away. A receptionist with five
 * minutes clicks the one button; a dentist planning the morning expands.
 */
export function ActionPlanCard({ plan, defaultOpen = false }: ActionPlanCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden flex">
      <div
        className={cn("w-1 shrink-0", PRIORITY_STRIPE[plan.prioritySeverity] ?? PRIORITY_STRIPE.low)}
        aria-hidden
      />

      <div className="flex-1 min-w-0">
        <div className="px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 text-xs text-[#52525B]">
              <Clock className="h-3 w-3" aria-hidden />
              {plan.timeframeLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[#52525B]">
              <User className="h-3 w-3" aria-hidden />
              {plan.ownerLabel}
            </span>
            <span className="text-xs text-[#A1A1AA]">
              {plan.actionCount} {plan.actionCount === 1 ? "action" : "actions"}
            </span>
          </div>

          <h4 className="text-sm font-semibold text-[#09090B] leading-snug">
            {plan.workflowTitle}
          </h4>
        </div>

        {/* The one thing to click. */}
        {plan.primary && (
          <div className="px-5 pt-3">
            <PrimaryAction action={plan.primary} />
          </div>
        )}

        {plan.rest.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="w-full text-left px-5 py-3 mt-1 flex items-center gap-1.5 text-xs font-medium text-[#52525B] hover:text-[#09090B] transition-colors cursor-pointer"
            >
              {open ? "Hide" : "Show"} {plan.rest.length} more{" "}
              {plan.rest.length === 1 ? "action" : "actions"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
                aria-hidden
              />
            </button>

            {open && (
              <ul className="px-5 pb-5 space-y-2 animate-fade-in">
                {plan.rest.map((action) => (
                  <li key={action.id}>
                    <SecondaryAction action={action} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {plan.rest.length === 0 && <div className="pb-5" />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PrimaryAction({ action }: { action: ActionView }) {
  return (
    <div className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#09090B] leading-snug">{action.title}</p>
          <p className="text-xs text-[#71717A] mt-1 leading-relaxed">{action.description}</p>
        </div>
        <ActionButton action={action} emphasis />
      </div>
      <ActionMeta action={action} />
      {action.draft && <DraftBlock draft={action.draft} />}
    </div>
  );
}

function SecondaryAction({ action }: { action: ActionView }) {
  return (
    <div className="rounded-lg border border-[#F4F4F5] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#09090B] leading-snug">{action.title}</p>
          <p className="text-xs text-[#71717A] mt-0.5 leading-relaxed">{action.description}</p>
        </div>
        <ActionButton action={action} />
      </div>
      <ActionMeta action={action} />
      {action.draft && <DraftBlock draft={action.draft} />}
    </div>
  );
}

/**
 * The click.
 *
 * A draft has nowhere to go — its content is the action — so it renders as
 * static text rather than a dead link. Same for an area this role has no screen
 * for: better an honest note than a link that 404s.
 */
function ActionButton({ action, emphasis = false }: { action: ActionView; emphasis?: boolean }) {
  if (action.href === null) {
    return (
      <span className="shrink-0 text-xs text-[#A1A1AA] mt-0.5">
        {action.kind === "prepare_draft" ? "Message below" : "Not available for your role"}
      </span>
    );
  }

  return (
    <Link
      href={action.href}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] focus-visible:ring-offset-2",
        emphasis
          ? "bg-[#09090B] text-white hover:bg-[#27272A]"
          : "border border-[#E4E4E7] text-[#09090B] hover:bg-[#F4F4F5]",
      )}
    >
      {action.actionLabel}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

/** Filter chips, the manual step, and what it is worth. */
function ActionMeta({ action }: { action: ActionView }) {
  const hasChips = action.appliedFilters.length > 0;
  if (!hasChips && !action.sortHint && action.readiness === "prepared") {
    return (
      <p className="mt-2.5 text-xs text-[#A1A1AA]">
        {action.categoryLabel} · {action.effortLabel}
      </p>
    );
  }

  return (
    <div className="mt-2.5 space-y-1.5">
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#16A34A] uppercase tracking-wide">
            <Check className="h-3 w-3" aria-hidden />
            Already filtered
          </span>
          {action.appliedFilters.map((f) => (
            <span
              key={`${f.key}-${f.value}`}
              className="text-[11px] text-[#52525B] bg-[#F4F4F5] border border-[#E4E4E7] rounded px-1.5 py-0.5"
            >
              {f.key}: {f.value}
            </span>
          ))}
        </div>
      )}

      {action.readiness !== "prepared" && action.sortHint && (
        <p className="inline-flex items-start gap-1 text-[11px] text-[#B45309]">
          <Hand className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
          <span>You'll need to: {action.sortHint}</span>
        </p>
      )}

      <p className="text-xs text-[#A1A1AA]">
        {action.categoryLabel} · {action.effortLabel} · {action.readinessLabel}
        {action.afterTitles.length > 0 && ` · after "${action.afterTitles[0]}"`}
      </p>
    </div>
  );
}

/**
 * A prepared message.
 *
 * Says "Draft — not sent" on it, every time. The Action Engine never sends
 * anything, and the surest way to keep that clear is to say so where the text is,
 * not only in a doc comment.
 */
function DraftBlock({ draft }: { draft: NonNullable<ActionView["draft"]> }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission refused. The text is on screen and selectable, so
      // there is nothing to recover from and nothing worth alarming anyone about.
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[#E4E4E7] bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#FAFAFA] border-b border-[#F4F4F5]">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#52525B]">
          <MessageSquare className="h-3 w-3" aria-hidden />
          Ready to send — not sent yet
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#09090B] hover:text-[#52525B] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] focus-visible:ring-offset-1 rounded"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        {draft.subject && (
          <p className="text-xs font-medium text-[#09090B]">{draft.subject}</p>
        )}
        <p className="text-xs text-[#52525B] leading-relaxed whitespace-pre-line">{draft.body}</p>
        {draft.placeholders.length > 0 && (
          <p className="text-[11px] text-[#A1A1AA] pt-1">
            Fill in before sending: {draft.placeholders.map((p) => `{{${p}}}`).join(", ")}
          </p>
        )}
        {draft.channelLabels.length > 0 && (
          <p className="inline-flex items-center gap-1 text-[11px] text-[#A1A1AA]">
            <Sparkles className="h-3 w-3" aria-hidden />
            You can send this via {draft.channelLabels.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
