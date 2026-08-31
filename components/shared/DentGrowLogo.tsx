import { MARK_ASPECT, MARK_SRC } from "@/lib/brand/mark";

/**
 * DentGrowLogo — the OraMedha mark.
 *
 * The mark is the supplied logo artwork, used as-is: an all-black PNG whose
 * alpha channel is the shape (see lib/brand/mark.ts and brand/make-mark.mjs).
 *
 * SHAPE
 *   Landscape and wide — roughly 2:1. `size` is the mark's HEIGHT and the width
 *   follows from MARK_ASPECT, so call sites keep controlling the dimension that
 *   matters in a row of nav items.
 *
 * COLOUR
 *   Painted with `background-color` through a CSS mask rather than drawn as an
 *   image, so one asset serves every surface and follows the theme:
 *
 *     `themed` (default) — `var(--text-primary)`: near-black (#151918) on light,
 *       near-white (#F1F5F3) in dark mode. The same token the wordmark uses, so
 *       mark and text always agree.
 *     `mono` — `currentColor`, for a painted brand surface (the sign-in panels)
 *       where the panel sets the colour and a themed mark would fight it.
 *
 *   The mask is what makes this possible. An `<img>` of a black PNG would be
 *   invisible in dark mode and on the painted panel, and fixing that would mean
 *   shipping a second white asset to keep in sync.
 *
 *   No longer a client component: with the gradient gone there is no generated
 *   id to collide, so nothing here needs to run in the browser.
 *
 * @example
 *   <DentGrowLogo size={24} withWordmark />                  // sidebar
 *   <DentGrowLogo size={25} variant="mono" withWordmark />   // brand panel
 */

/**
 * Wordmark font-size as a fraction of the mark's height.
 *
 * Raised from 0.66 when the mark changed. The previous mark was a solid tooth
 * silhouette, nearly square, with far more optical mass than a run of glyphs at
 * the same height — it needed the wordmark held back to stop it looming. The
 * current mark is a thin open stroke at twice the width, so it reads much
 * lighter, and the old ratio left the wordmark looking undersized beside it.
 */
const WORDMARK_RATIO = 0.78;

/** Gap between mark and wordmark, as a fraction of the wordmark's font size. */
const LOCKUP_GAP_RATIO = 0.5;

interface DentGrowLogoProps {
  /** HEIGHT of the mark in px; width follows from MARK_ASPECT. Default: 28. */
  size?: number;
  /** Render the "OraMedha" wordmark beside the mark. Default: false. */
  withWordmark?: boolean;
  /** `themed` for a normal surface, `mono` for a painted brand surface. */
  variant?: "themed" | "mono";
  className?: string;
}

export function DentGrowLogo({
  size = 28,
  withWordmark = false,
  variant = "themed",
  className,
}: DentGrowLogoProps) {
  const fontSize = Math.round(size * WORDMARK_RATIO);
  const paint = variant === "mono" ? "currentColor" : "var(--text-primary)";

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(fontSize * LOCKUP_GAP_RATIO),
      }}
    >
      <span
        role="img"
        aria-label="OraMedha"
        style={{
          width: Math.round(size * MARK_ASPECT),
          height: size,
          flexShrink: 0,
          display: "block",
          backgroundColor: paint,
          // -webkit- first for older Safari, which shipped the prefixed
          // property years before the standard one.
          WebkitMaskImage: `url("${MARK_SRC}")`,
          maskImage: `url("${MARK_SRC}")`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          // `contain`, not `cover`: the mark must never be cropped, and its
          // box is already set to the asset's own aspect ratio.
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />

      {withWordmark && (
        <span
          style={{
            fontSize,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            // In `mono` the mark and wordmark inherit together. In `themed` both
            // read the same token, so they stay matched in either theme.
            color: variant === "mono" ? "currentColor" : "var(--text-primary)",
            lineHeight: 1,
            userSelect: "none",
            fontFamily:
              "var(--font-geist-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif)",
          }}
        >
          OraMedha
        </span>
      )}
    </div>
  );
}
