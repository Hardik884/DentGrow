"use client";

import { useState } from "react";
import { Check, ChevronDown, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Diagnosis, Hypothesis, Severity } from "@/business-brain";
import {
  availabilityLabel,
  confidenceLabel,
  persistenceLabel,
} from "@/lib/business-brain/dashboard-view";

interface DiagnosisListProps {
  diagnoses: readonly Diagnosis[];
}

const SEVERITY_BADGE: Record<Severity, BadgeVariant> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "secondary",
  info: "outline",
};

const PERSISTENCE_BADGE: Record<string, BadgeVariant> = {
  worsening: "danger",
  sustained: "warning",
  improving: "success",
  intermittent: "secondary",
  transient: "secondary",
  insufficient_history: "outline",
};

/**
 * One candidate explanation.
 *
 * The status is the whole point and is never softened: `supported` means the
 * evidence backs it, `contradicted` means the evidence rules it out, and
 * `undetermined` means the data cannot separate it from the alternatives. A
 * dashboard that showed only the supported one would be inventing certainty the
 * engine explicitly refused to claim.
 */
function HypothesisRow({ hypothesis }: { hypothesis: Hypothesis }) {
  const status = hypothesis.status;

  const icon =
    status === "supported" ? (
      <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden />
    ) : status === "contradicted" ? (
      <X className="h-3.5 w-3.5 text-[#A1A1AA]" aria-hidden />
    ) : (
      <HelpCircle className="h-3.5 w-3.5 text-[#CA8A04]" aria-hidden />
    );

  const label =
    status === "supported"
      ? "Evidence supports this"
      : status === "contradicted"
        ? "Evidence rules this out"
        : "Cannot tell from current data";

  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            status === "contradicted" ? "text-[#A1A1AA]" : "text-[#09090B]",
          )}
        >
          {hypothesis.statement}
        </p>
        <p className="text-xs text-[#A1A1AA] mt-0.5">{label}</p>
      </div>
    </li>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis }) {
  const [open, setOpen] = useState(false);

  const supported = diagnosis.hypotheses.filter((h) => h.status === "supported").length;
  const undetermined = diagnosis.hypotheses.filter((h) => h.status === "undetermined").length;

  return (
    <article className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-sm font-semibold text-[#09090B] leading-snug">{diagnosis.title}</h4>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={SEVERITY_BADGE[diagnosis.severity]}>{diagnosis.severity}</Badge>
            <Badge variant={PERSISTENCE_BADGE[diagnosis.persistence] ?? "outline"}>
              {persistenceLabel(diagnosis.persistence)}
            </Badge>
          </div>
        </div>

        <p className="text-sm text-[#71717A] mt-1.5 leading-relaxed">{diagnosis.summary}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
          <span className="text-xs text-[#A1A1AA]">
            {supported > 0
              ? `${supported} of ${diagnosis.hypotheses.length} explanations supported`
              : `${undetermined} possible ${undetermined === 1 ? "explanation" : "explanations"}, none ruled in yet`}
          </span>
          <span className="text-xs text-[#A1A1AA]">·</span>
          <span className="text-xs text-[#A1A1AA]">{confidenceLabel(diagnosis.confidence)}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#09090B] transition-colors ml-auto"
          >
            {open ? "Hide" : "Examine"}
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[#F4F4F5] bg-[#FAFAFA] px-5 py-4 space-y-5 animate-fade-in">
          <div>
            <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
              Possible explanations
            </p>
            <ul className="mt-1.5 divide-y divide-[#EFEFF1]">
              {diagnosis.hypotheses.map((h) => (
                <HypothesisRow key={h.id} hypothesis={h} />
              ))}
            </ul>
          </div>

          {diagnosis.discriminators.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                What would tell these apart
              </p>
              <ul className="mt-1.5 space-y-2">
                {diagnosis.discriminators.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3">
                    <span className="text-sm text-[#71717A] leading-relaxed">{d.description}</span>
                    <Badge variant="outline" className="shrink-0">
                      {availabilityLabel(d.availability)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Why this is happening.
 *
 * Deliberately shows competing explanations rather than a single cause. The
 * Diagnosis Engine correlates observations into patterns and states what the
 * evidence does and does not settle; collapsing that into one answer would be
 * the dashboard asserting something the engine refused to.
 */
export function DiagnosisList({ diagnoses }: DiagnosisListProps) {
  if (diagnoses.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl">
        <EmptyState
          title="No pattern found"
          description="Nothing today correlates into a recognised pattern. Individual observations are listed above."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {diagnoses.map((d) => (
        <DiagnosisCard key={d.id} diagnosis={d} />
      ))}
    </div>
  );
}
