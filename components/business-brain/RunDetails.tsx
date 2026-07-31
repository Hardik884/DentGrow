"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BusinessBrainResult } from "@/business-brain";
import type { UnmeasuredItem } from "@/lib/business-brain/dashboard-view";

interface RunDetailsProps {
  execution: BusinessBrainResult["execution"];
  unmeasured: readonly UnmeasuredItem[];
}

/** Turn "appointments.minimumDailyAppointments" into something readable. */
function humaniseThresholdPath(path: string): string {
  const leaf = path.includes(".") ? path.slice(path.indexOf(".") + 1) : path;
  const words = leaf.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STAGE_LABELS: Record<string, string> = {
  metrics: "Measured the clinic",
  signals: "Checked against thresholds",
  diagnosis: "Correlated into patterns",
};

/**
 * How this was worked out.
 *
 * Collapsed by default — a dentist does not need it on a normal day. It exists
 * because the Business Brain's claim is that it is deterministic and does not
 * guess, and a claim like that is only worth anything if it can be inspected.
 *
 * The unavailable-checks list is the most important part: it is the difference
 * between "we checked and found nothing" and "we could not check", which a
 * dashboard that only showed findings would silently conflate.
 */
export function RunDetails({ execution, unmeasured }: RunDetailsProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#FAFAFA] transition-colors"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#09090B]">How this was worked out</h3>
          <p className="text-xs text-[#71717A] mt-0.5">
            {unmeasured.length > 0
              ? `${unmeasured.length} ${unmeasured.length === 1 ? "check" : "checks"} could not run · analysis steps and timing`
              : "Every check ran · analysis steps and timing"}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[#A1A1AA] shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-[#F4F4F5] px-5 py-4 space-y-6 animate-fade-in">
          {/* What could not be measured — the honest gap. */}
          {unmeasured.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                Checks that could not run
              </p>
              <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
                These were not evaluated, so nothing above accounts for them. A check that could
                not run is not the same as one that found nothing.
              </p>
              <ul className="mt-2.5 divide-y divide-[#F4F4F5] border border-[#F4F4F5] rounded-lg">
                {unmeasured.map((item, i) => (
                  <li
                    key={`${item.label}-${i}`}
                    className="flex items-start justify-between gap-4 px-3 py-2.5"
                  >
                    <span className="text-sm text-[#09090B]">{item.label}</span>
                    <span className="text-xs text-[#A1A1AA] text-right max-w-[60%] leading-relaxed">
                      {item.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Thresholds sized from this clinic rather than the global defaults. */}
          {execution.calibration.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                Limits tailored to your clinic
              </p>
              <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
                These were sized from your own figures rather than a fixed number, so a quiet
                day at a small clinic is not treated the same as one at a large clinic.
              </p>
              <ul className="mt-2.5 divide-y divide-[#F4F4F5] border border-[#F4F4F5] rounded-lg">
                {execution.calibration.map((c) => (
                  <li key={c.path} className="px-3 py-2.5">
                    <p className="text-sm text-[#09090B]">{humaniseThresholdPath(c.path)}</p>
                    <p className="text-xs text-[#A1A1AA] mt-0.5 leading-relaxed">{c.basis}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pipeline stages. */}
          <div>
            <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
              Analysis steps
            </p>
            <ul className="mt-2.5 divide-y divide-[#F4F4F5] border border-[#F4F4F5] rounded-lg">
              {execution.stages.map((stage) => (
                <li
                  key={stage.stage}
                  className="flex items-center justify-between gap-4 px-3 py-2.5"
                >
                  <span className="text-sm text-[#09090B]">
                    {STAGE_LABELS[stage.stage] ?? stage.stage}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[#A1A1AA]">
                      {stage.outputCount} {stage.outputCount === 1 ? "result" : "results"}
                    </span>
                    <Badge variant={stage.ok ? "success" : stage.executed ? "danger" : "outline"}>
                      {stage.ok ? "Complete" : stage.executed ? "Failed" : "Not run"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Provenance. */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">History used</dt>
              <dd className="text-sm text-[#09090B] mt-0.5">
                {execution.historyDaysLoaded} of {execution.historyDaysRequested} days
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Analysis time</dt>
              <dd className="text-sm text-[#09090B] mt-0.5">{execution.durationMs} ms</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Engine version</dt>
              <dd className="text-sm text-[#09090B] mt-0.5">{execution.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Run reference</dt>
              <dd className="text-xs text-[#A1A1AA] mt-1 font-mono truncate">
                {execution.correlationId}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-[#A1A1AA] leading-relaxed border-t border-[#F4F4F5] pt-4">
            Every figure above is calculated directly from your clinic records using fixed rules.
            No AI is involved, and the same data always produces the same result. The Business
            Brain reports what it observes and what the evidence does or does not settle — it does
            not recommend actions.
          </p>
        </div>
      )}
    </section>
  );
}
