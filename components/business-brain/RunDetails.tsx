"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BusinessBrainResult, Signal } from "@/business-brain";
import type { UnmeasuredItem } from "@/lib/business-brain/dashboard-view";

interface RunDetailsProps {
  execution: BusinessBrainResult["execution"];
  unmeasured: readonly UnmeasuredItem[];
  /** Signals that did not group into any diagnosed problem. */
  looseSignals?: readonly Signal[];
}

function humaniseThresholdPath(path: string): string {
  const leaf = path.includes(".") ? path.slice(path.indexOf(".") + 1) : path;
  const words = leaf.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STAGE_LABELS: Record<string, string> = {
  metrics: "Looked at your clinic numbers",
  signals: "Checked if anything is unusual",
  diagnosis: "Figured out what's connected",
  strategy: "Worked out what to do",
  actions: "Prepared shortcuts for you",
};

/**
 * Audit trail — how this was worked out.
 *
 * Collapsed by default. A dentist does not need it on a normal day. It exists
 * because the Business Brain claims to be deterministic, and that claim is
 * only credible when it can be inspected.
 *
 * Now also houses "loose signals" — figures outside their usual range that the
 * engine could not group into a problem. Previously these were a separate section
 * that created cognitive overhead without actionable value.
 */
export function RunDetails({ execution, unmeasured, looseSignals = [] }: RunDetailsProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#09090B]">How we worked this out</h3>
          <p className="text-xs text-[#71717A] mt-0.5">
            {unmeasured.length > 0
              ? `${unmeasured.length} ${unmeasured.length === 1 ? "thing" : "things"} we couldn't check`
              : "Checked everything we could"}
            {looseSignals.length > 0 && ` · ${looseSignals.length} other unusual ${looseSignals.length === 1 ? "number" : "numbers"}`}
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
          {/* Loose signals — figures outside range not tied to a problem */}
          {looseSignals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                Other things that looked unusual
              </p>
              <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
                These numbers were different from normal, but we couldn&apos;t connect them to a specific problem.
              </p>
              <ul className="mt-2.5 divide-y divide-[#F4F4F5] border border-[#F4F4F5] rounded-lg">
                {looseSignals.map((signal) => (
                  <li key={signal.id} className="px-3 py-2.5">
                    <p className="text-sm text-[#09090B]">{signal.title}</p>
                    <p className="text-xs text-[#71717A] mt-0.5">{signal.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What could not be measured */}
          {unmeasured.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                Things we couldn&apos;t check
              </p>
              <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
                We couldn&apos;t look at these today, so the summary above doesn&apos;t account for them.
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

          {/* Thresholds tailored to this clinic */}
          {execution.calibration.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                Adjusted for your clinic
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

          {/* Pipeline stages */}
          <div>
            <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
              What we did
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
                      {stage.ok ? "Done" : stage.executed ? "Failed" : "Skipped"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Provenance */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Past data used</dt>
              <dd className="text-sm text-[#09090B] mt-0.5">
                {execution.historyDaysLoaded} of {execution.historyDaysRequested} days
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Took</dt>
              <dd className="text-sm text-[#09090B] mt-0.5">{execution.durationMs} ms</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Version</dt>
              <dd className="text-sm text-[#09090B] mt-0.5">{execution.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#71717A] tracking-wide">Reference</dt>
              <dd className="text-xs text-[#A1A1AA] mt-1 font-mono truncate">
                {execution.correlationId}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-[#A1A1AA] leading-relaxed border-t border-[#F4F4F5] pt-4">
            Everything here is calculated directly from your clinic records using fixed rules.
            No AI guesses are involved. The same data always gives the same result.
          </p>
        </div>
      )}
    </section>
  );
}
