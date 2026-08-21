"use client";

import { useId } from "react";
import { MARK_ASPECT, MARK_PATH, MARK_VIEWBOX } from "@/lib/brand/mark";

/**
 * DentGrowLogo — the DentGrow mark.
 *
 * The mark is the supplied logo artwork, traced to vector (see
 * lib/brand/mark.ts): a tooth outline with a growth chart inside it and an
 * arrow sweeping through and away to the upper right.
 *
 * SHAPE
 *   Landscape, not square — the arrow travels well past the tooth on the right.
 *   `size` is the mark's HEIGHT and the width follows from MARK_ASPECT, so call
 *   sites keep controlling the dimension that matters in a row of nav items.
 *
 * COLOUR
 *   The artwork is a single flat silhouette, so the mark takes one fill. In
 *   `gradient` that fill is one diagonal ramp across the whole mark — deep
 *   emerald at the bottom-left to bright mint at the arrowhead, so it brightens
 *   along the arrow. The stops are DentGrow's own accent ramp (#0D6B5E and the
 *   lighter #35A18F dark mode already uses), not a separate brand palette.
 *
 * VARIANTS
 *   `gradient` (default) — for a neutral surface: sidebar, nav, forms.
 *   `mono` — `currentColor`, for a painted brand surface (the sign-in panels)
 *     where a second gradient would fight the panel.
 *
 * @example
 *   <DentGrowLogo size={24} withWordmark />       // sidebar
 *   <DentGrowLogo size={25} variant="mono" withWordmark />   // brand panel
 */

/**
 * Wordmark font-size as a fraction of the mark's height.
 *
 * NOT 0.5, which is the intuitive "mark is twice the text" and is what this
 * started as. The mark is a landscape drawing — a tooth, a chart and an arrow —
 * and its optical mass is far greater than a run of glyphs at the same height,
 * so a 2:1 relationship makes it loom over the wordmark instead of sitting
 * beside it.
 *
 * Chosen by rendering the lockup at mark:font ratios from 2.1 down to 1.2 in
 * both the panel and sidebar contexts. Balance lands at ~1.5, which is what
 * this fraction produces (1 / 0.66).
 */
const WORDMARK_RATIO = 0.66;

/** Gap between mark and wordmark, as a fraction of the wordmark's font size. */
const LOCKUP_GAP_RATIO = 0.55;

interface DentGrowLogoProps {
  /** HEIGHT of the mark in px; width follows from MARK_ASPECT. Default: 28. */
  size?: number;
  /** Render the "DentGrow" wordmark beside the mark. Default: false. */
  withWordmark?: boolean;
  /** `gradient` for a neutral surface, `mono` for a painted brand surface. */
  variant?: "gradient" | "mono";
  className?: string;
}

export function DentGrowLogo({
  size = 28,
  withWordmark = false,
  variant = "gradient",
  className,
}: DentGrowLogoProps) {
  // The gradient needs a document-unique id: the sidebar renders a logo in both
  // the desktop rail and the mobile header, and two <defs> sharing an id is
  // invalid HTML that breaks the moment one of them unmounts.
  //
  // useId's output is stripped to alphanumerics first. React generates ids
  // containing guillemets (React 19) or colons (React 18), and neither is safe
  // inside an SVG `url(#...)` reference.
  const gradientId = `dg-mark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const paint = variant === "mono" ? "currentColor" : `url(#${gradientId})`;

  const fontSize = Math.round(size * WORDMARK_RATIO);

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(fontSize * LOCKUP_GAP_RATIO),
      }}
    >
      <svg
        width={Math.round(size * MARK_ASPECT)}
        height={size}
        viewBox={MARK_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="DentGrow"
        style={{ flexShrink: 0, display: "block" }}
      >
        {variant === "gradient" && (
          <defs>
            {/* Bottom-left to top-right, so the ramp runs along the arrow. */}
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#0A5347" />
              <stop offset="45%" stopColor="#0D6B5E" />
              <stop offset="100%" stopColor="#35A18F" />
            </linearGradient>
          </defs>
        )}

        {/* evenodd: the trace yields outer boundaries plus holes, and the
            source artwork's overlapping parts mean winding order is not
            reliable. See lib/brand/mark.ts. */}
        <path fillRule="evenodd" clipRule="evenodd" d={MARK_PATH} fill={paint} />
      </svg>

      {withWordmark && (
        <span
          style={{
            fontSize,
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
