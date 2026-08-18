/**
 * lib/dental-chart/status.ts
 *
 * Presentation mappings for ToothStatus, shared by the Legend, Tooth SVG, and
 * the tooth detail panel's status badge. Colors intentionally mirror
 * lib/utils.ts's BadgeVariant palette (the codebase's existing restrained
 * status-color vocabulary) rather than inventing a new one.
 */

import { TOOTH_STATUS_LABELS, type ToothStatus } from "@/types";
import type { BadgeVariant } from "@/lib/utils";

export { TOOTH_STATUS_LABELS };

export const TOOTH_STATUS_BADGE_VARIANT: Record<ToothStatus, BadgeVariant> = {
  normal: "default",
  recommended: "warning",
  planned: "info",
  in_progress: "info",
  completed: "success",
  missing: "default",
};

/**
 * Tooth presentation, as Tailwind utility classes rather than hex strings.
 *
 * There used to be TWO copies of this palette — one here for the legend and one
 * in Tooth.tsx for the SVG — and they had drifted apart (they disagreed on
 * `normal`, `recommended` and `missing`). This is now the only copy, and both
 * consumers render from it.
 *
 * Classes, not hexes, because the values resolve through CSS variables. That is
 * what lets the chart carry a genuinely different clinical palette in dark mode
 * — the light colours are near-white enamel tints that would glare on a dark
 * page, so dark defines its own set rather than inverting these.
 */
export const TOOTH_STATUS_CLASSES: Record<
  ToothStatus,
  { fill: string; stroke: string; swatchBg: string; swatchBorder: string }
> = {
  normal: {
    fill: "fill-tooth-normal",
    stroke: "stroke-tooth-normal-line",
    swatchBg: "bg-tooth-normal",
    swatchBorder: "border-tooth-normal-line",
  },
  recommended: {
    fill: "fill-tooth-recommended",
    stroke: "stroke-tooth-recommended-line",
    swatchBg: "bg-tooth-recommended",
    swatchBorder: "border-tooth-recommended-line",
  },
  planned: {
    fill: "fill-tooth-planned",
    stroke: "stroke-tooth-planned-line",
    swatchBg: "bg-tooth-planned",
    swatchBorder: "border-tooth-planned-line",
  },
  in_progress: {
    fill: "fill-tooth-in-progress",
    stroke: "stroke-tooth-in-progress-line",
    swatchBg: "bg-tooth-in-progress",
    swatchBorder: "border-tooth-in-progress-line",
  },
  completed: {
    fill: "fill-tooth-completed",
    stroke: "stroke-tooth-completed-line",
    swatchBg: "bg-tooth-completed",
    swatchBorder: "border-tooth-completed-line",
  },
  missing: {
    fill: "fill-tooth-missing",
    stroke: "stroke-tooth-missing-line",
    swatchBg: "bg-tooth-missing",
    swatchBorder: "border-tooth-missing-line",
  },
};
