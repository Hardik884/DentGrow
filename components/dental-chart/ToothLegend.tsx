/**
 * components/dental-chart/ToothLegend.tsx
 *
 * Small "colored dot + label" legend row, built from the codebase's existing
 * building blocks (a rounded swatch + text-secondary label) since no bespoke
 * legend component exists elsewhere to reuse. Color is never the only signal:
 * each swatch also carries a distinct border weight/style, matching the same
 * cue used on the tooth shapes themselves (dashed border for "missing").
 */

import { TOOTH_STATUS_ORDER } from "@/lib/dental-chart/teeth";
import { TOOTH_STATUS_LABELS, TOOTH_STATUS_SWATCH } from "@/lib/dental-chart/status";

export function ToothLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="list" aria-label="Tooth status legend">
      {TOOTH_STATUS_ORDER.map((status) => {
        const swatch = TOOTH_STATUS_SWATCH[status];
        return (
          <div key={status} role="listitem" className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{
                backgroundColor: swatch.fill,
                border: `1.5px ${status === "missing" ? "dashed" : "solid"} ${swatch.stroke}`,
              }}
            />
            <span className="text-xs text-[#737A76]">{TOOTH_STATUS_LABELS[status]}</span>
          </div>
        );
      })}
    </div>
  );
}
