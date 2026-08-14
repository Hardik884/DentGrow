/**
 * components/dental-chart/Tooth.tsx
 *
 * Reusable tooth SVG. Renders ONE tooth shape whose crown/root morphology is
 * driven by `toothType` (incisor / canine / premolar / molar) and whose fill
 * is driven by `status`. `arch` flips the shape vertically so upper-arch
 * teeth hang crown-down (root up) and lower-arch teeth stand crown-up
 * (root down) — the standard two-row dental-chart convention, matching how
 * the teeth actually meet at the bite line between the two rows.
 *
 * Plain functional component computing geometry inline, no external SVG-icon
 * abstraction — mirrors components/business-brain/HealthMeter.tsx, the
 * codebase's existing precedent for a hand-drawn SVG shape.
 */

import type { ToothStatus } from "@/types";
import type { ToothType, ArchSide } from "@/lib/dental-chart/teeth";
import { cn } from "@/lib/utils";

export type ToothVisualState = ToothStatus;

const STATUS_FILL: Record<ToothVisualState, string> = {
  normal: "#FFFFFF",
  recommended: "#FEFCE8",
  planned: "#EFF6FF",
  in_progress: "#EFF6FF",
  completed: "#F0FDF4",
  missing: "#F4F4F5",
};

const STATUS_STROKE: Record<ToothVisualState, string> = {
  normal: "#D4D4D8",
  recommended: "#EAB308",
  planned: "#93C5FD",
  in_progress: "#2563EB",
  completed: "#4ADE80",
  missing: "#D4D4D8",
};

const STATUS_STROKE_WIDTH: Record<ToothVisualState, number> = {
  normal: 1.5,
  recommended: 1.5,
  planned: 1.5,
  in_progress: 2.25,
  completed: 1.5,
  missing: 1.5,
};

/** Crown + root path data per anatomical type, viewBox 0 0 40 68, crown-down orientation. */
const TOOTH_SHAPES: Record<
  ToothType,
  { crown: string; roots: string[] }
> = {
  incisor: {
    crown:
      "M12,26 C12,23.5 14.5,21.5 20,21.5 C25.5,21.5 28,23.5 28,26 L28,58 Q28,64 24,64 L16,64 Q12,64 12,58 Z",
    roots: [
      "M13,26.5 C13,20 14,14 16,8 C17,5 18.5,3 20,3 C21.5,3 23,5 24,8 C26,14 27,20 27,26.5 Z",
    ],
  },
  canine: {
    crown:
      "M12,26 C12,23.5 14.5,21.5 20,21.5 C25.5,21.5 28,23.5 28,26 C27.3,37 25.5,48 22.5,57 L20.5,66 L19.5,66 L17.5,57 C14.5,48 12.7,37 12,26 Z",
    roots: [
      "M13,26.5 C13,18 14,10 16.5,5 C17.7,2.3 18.7,1 20,1 C21.3,1 22.3,2.3 23.5,5 C26,10 27,18 27,26.5 Z",
    ],
  },
  premolar: {
    // Two shallow occlusal cusps (buccal + lingual) — a wider crown than the
    // incisor/canine with a gentle concave notch at the bottom instead of a
    // flat edge or a single point. Root is a single, noticeably SHORTER cone
    // with a subtle bifid tip — premolars have the shortest roots of the four.
    crown:
      "M11,26 C11,23.5 14.5,21.5 20,21.5 C25.5,21.5 29,23.5 29,26 C29,35 28,44 27,49 C26.5,54 25,57.5 22.5,59 C21.3,59.7 20.6,57 20,55.5 C19.4,57 18.7,59.7 17.5,59 C15,57.5 13.5,54 13,49 C12,44 11,35 11,26 Z",
    roots: [
      "M12,26.5 C12,20.5 12.8,15.5 14.8,12 C15.7,10.4 16.9,10.9 17.2,12.7 C17.4,14 18,14.6 20,14.6 C22,14.6 22.6,14 22.8,12.7 C23.1,10.9 24.3,10.4 25.2,12 C27.2,15.5 28,20.5 28,26.5 Z",
    ],
  },
  molar: {
    // The widest crown, with a wavy 3-cusp occlusal edge. Root is drawn as
    // ONE connected mass that forks into two stout, rounded prongs near the
    // crown rather than two separate thin spikes, which reads as "molar
    // roots" instead of insect antennae at small sizes.
    crown:
      "M7,27 C7,23.3 12,21 20,21 C28,21 33,23.3 33,27 C33,35.5 32,44 31,49 C30.4,53.5 28.8,56.5 26.3,58 C24.7,59 24,56.8 22.5,56.3 C21.3,55.9 21,57 20,57 C19,57 18.7,55.9 17.5,56.3 C16,56.8 15.3,59 13.7,58 C11.2,56.5 9.6,53.5 9,49 C8,44 7,35.5 7,27 Z",
    roots: [
      "M8.5,27.3 C8.5,20.5 9.6,14.8 12.3,11 C13.4,9.4 14.8,10.2 15.1,12.2 C15.4,14.2 16.1,15 17.6,15.2 L17.6,27.3 Z M31.5,27.3 C31.5,20.5 30.4,14.8 27.7,11 C26.6,9.4 25.2,10.2 24.9,12.2 C24.6,14.2 23.9,15 22.4,15.2 L22.4,27.3 Z",
    ],
  },
};

export type ToothProps = {
  toothType: ToothType;
  arch: ArchSide;
  status: ToothVisualState;
  size?: number;
  className?: string;
  /** Renders a subtle "not present" cross-hatch instead of a normal fill. */
  ariaLabel?: string;
};

export function Tooth({ toothType, arch, status, size = 40, className, ariaLabel }: ToothProps) {
  const shape = TOOTH_SHAPES[toothType];
  const fill = STATUS_FILL[status];
  const stroke = STATUS_STROKE[status];
  const strokeWidth = STATUS_STROKE_WIDTH[status];
  const isMissing = status === "missing";

  // Upper arch: crown-down (as authored). Lower arch: flip vertically so the
  // crown points up toward the bite line, root hanging down — mirrors the
  // reference chart's two-row presentation.
  const flipTransform = arch === "lower" ? "matrix(1,0,0,-1,0,68)" : undefined;

  return (
    <svg
      viewBox="0 0 40 68"
      width={size}
      height={(size * 68) / 40}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <g transform={flipTransform} opacity={isMissing ? 0.55 : 1}>
        {shape.roots.map((d, i) => (
          <path
            key={`root-${i}`}
            d={d}
            fill={isMissing ? "#F4F4F5" : "#FAFAFA"}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={isMissing ? "3 2.5" : undefined}
          />
        ))}
        <path
          d={shape.crown}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={isMissing ? "3 2.5" : undefined}
        />
        {isMissing && (
          <path
            d="M13,26 L27,60 M27,26 L13,60"
            stroke="#A1A1AA"
            strokeWidth={1.25}
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}
