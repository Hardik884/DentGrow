"use client";

import { useId } from "react";
import {
  ARROW_HEAD,
  ARROW_TAIL,
  GROWTH_BARS,
  GROWTH_BAR_RADIUS,
  MARK_VIEWBOX,
  TOOTH_PATH,
} from "@/lib/brand/mark";

/**
 * DentGrowLogo — the DentGrow mark.
 *
 * WHAT IT IS
 *   An outlined tooth with three ascending bars inside it and an arrow sweeping
 *   under the roots and away to the upper right. Both halves of the name in one
 *   drawing: the tooth is "Dent", the bars and the arrow are "Grow".
 *
 *   The tooth is the same TOOTH_PATH the sign-in artwork repeats into a dental
 *   arch (lib/brand/mark.ts) — stroked here rather than filled — so the mark and
 *   the canvas behind the sign-in form are provably the same silhouette.
 *
 * COLOUR
 *   A single diagonal gradient runs across the whole mark, deep emerald at the
 *   bottom-left to bright mint at the arrowhead, so the arrow reads as
 *   accelerating into the light. The stops are DentGrow's own accent ramp
 *   (#0D6B5E and the lighter #35A18F that dark mode already uses), not a
 *   separate brand palette.
 *
 * DETAIL VS. SIZE
 *   Three elements is a lot to hold at the 24–28px the sidebar renders. The
 *   `detail` prop is the answer: at small sizes the bars and arrow are dropped
 *   and the tooth fills solid, which is the same silhouette reading as a
 *   confident dot rather than as three overlapping strokes turning to mush.
 *   `auto` picks by size and is what every call site should use.
 *
 * VARIANTS
 *   `gradient` (default) — the full-colour mark, for a neutral surface.
 *   `mono` — every part in `currentColor`, for a painted brand surface (the
 *     sign-in panels) where a second gradient would fight the panel.
 *
 * @example
 *   <DentGrowLogo size={28} withWordmark />       // sidebar — auto-simplifies
 *   <DentGrowLogo size={40} variant="mono" />     // on a brand panel
 *   <DentGrowLogo size={64} detail="full" />      // hero / marketing
 */

interface DentGrowLogoProps {
  /** Width and height of the mark in px. Default: 28. */
  size?: number;
  /** Render the "DentGrow" wordmark beside the mark. Default: false. */
  withWordmark?: boolean;
  /** `gradient` for a neutral surface, `mono` for a painted brand surface. */
  variant?: "gradient" | "mono";
  /**
   * `full` draws tooth + bars + arrow. `simple` draws the solid tooth alone.
   * `auto` (default) chooses by size.
   */
  detail?: "auto" | "full" | "simple";
  className?: string;
}

/**
 * Below this the bars close up and the arrow's tail merges with the tooth
 * outline, so the mark reads as a smudge. Measured against renders at 24, 28,
 * 32, 40, 48, 64, 96 and 140px, not guessed.
 *
 * The app chrome was moved up to 32px to sit on the right side of this line —
 * a four-pixel change in the sidebar, in exchange for the real mark rather than
 * a fallback silhouette everywhere in the product. The favicon stays on the
 * simple side: a browser tab is 16px and nothing survives there.
 */
const FULL_DETAIL_MIN_SIZE = 32;

export function DentGrowLogo({
  size = 28,
  withWordmark = false,
  variant = "gradient",
  detail = "auto",
  className,
}: DentGrowLogoProps) {
  // The gradient needs a document-unique id: the sidebar renders a logo in both
  // the desktop rail and the mobile header, and two <defs> sharing an id is
  // invalid HTML that breaks the moment one of them unmounts.
  //
  // useId's output is stripped to alphanumerics first. React generates ids
  // containing guillemets (React 19) or colons (React 18), and neither is safe
  // inside an SVG `url(#…)` reference.
  const gradientId = `dg-mark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const full = detail === "full" || (detail === "auto" && size >= FULL_DETAIL_MIN_SIZE);
  const paint = variant === "mono" ? "currentColor" : `url(#${gradientId})`;

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.34),
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={full ? MARK_VIEWBOX : "0 0 32 32"}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="DentGrow"
        style={{ flexShrink: 0, display: "block", overflow: "visible" }}
      >
        {variant === "gradient" && (
          <defs>
            {/* Bottom-left → top-right, so the ramp runs along the arrow. */}
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#0A5347" />
              <stop offset="45%" stopColor="#0D6B5E" />
              <stop offset="100%" stopColor="#35A18F" />
            </linearGradient>
          </defs>
        )}

        {full ? (
          <>
            {/* Tooth — stroked, so the bars inside it are visible. */}
            <path
              d={TOOTH_PATH}
              fill="none"
              stroke={paint}
              strokeWidth="2.4"
              strokeLinejoin="round"
            />

            {/* Growth bars. */}
            {GROWTH_BARS.map((bar) => (
              <rect
                key={bar.x}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={GROWTH_BAR_RADIUS}
                fill={paint}
              />
            ))}

            {/* Arrow. */}
            <path
              d={ARROW_TAIL}
              fill="none"
              stroke={paint}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path d={ARROW_HEAD} fill={paint} />
          </>
        ) : (
          // Small sizes: the silhouette alone.
          <path d={TOOTH_PATH} fill={paint} />
        )}
      </svg>

      {withWordmark && (
        <span
          style={{
            fontSize: Math.round(size * 0.5),
            fontWeight: 600,
            letterSpacing: "-0.025em",
            // In `mono` the mark and wordmark inherit together. In `gradient`
            // the mark carries its own colour, but the wordmark is plain text
            // on the page and has to follow the theme to stay readable.
            color: variant === "mono" ? "currentColor" : "var(--text-primary)",
            lineHeight: 1,
            userSelect: "none",
            fontFamily:
              "var(--font-geist-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif)",
          }}
        >
          DentGrow
        </span>
      )}
    </div>
  );
}
