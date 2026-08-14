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

/** Legend swatch colors — matches Tooth.tsx's STATUS_FILL/STATUS_STROKE. */
export const TOOTH_STATUS_SWATCH: Record<ToothStatus, { fill: string; stroke: string }> = {
  normal: { fill: "#FFFFFF", stroke: "#D4D4D8" },
  recommended: { fill: "#FEFCE8", stroke: "#EAB308" },
  planned: { fill: "#EFF6FF", stroke: "#93C5FD" },
  in_progress: { fill: "#EFF6FF", stroke: "#2563EB" },
  completed: { fill: "#F0FDF4", stroke: "#4ADE80" },
  missing: { fill: "#F4F4F5", stroke: "#D4D4D8" },
};
