"use client";

import { useId } from "react";
import { LOGO_TOOTH_INSET, TOOTH_PATH, toothInset } from "@/lib/brand/mark";

/**
 * DentGrowLogo — the DentGrow mark.
 *
 * WHAT IT IS
 *   A single tooth, drawn wide and solid, sitting on a rounded emerald tile.
 *   The tooth is the same path the sign-in artwork repeats into a dental arch
 *   (lib/brand/mark.ts), so the mark reads as one tooth lifted out of that arch
 *   rather than as unrelated decoration.
 *
 * WHY IT REPLACED THE "DG" MONOGRAM
 *   The previous mark was a letter D beside a stroked letter G on a near-black
 *   tile. Two problems: at the 24–28px the sidebar actually renders it, the G's
 *   arc and spur closed up and the pair read as "DE"; and nothing about it said
 *   dentistry — it would have suited any product whose name began with those
 *   letters. A tooth is legible at 16px and unmistakable at every size.
 *
 * WHY THE TOOTH IS SOLID AND UNDECORATED
 *   Interior detail was tried — a growth chevron, rising bars, an enamel
 *   gradient — and every one of them survived at 96px and turned to mush at 24.
 *   The sidebar size is the design constraint, so the mark carries exactly one
 *   idea.
 *
 * VARIANTS
 *   `tile` (default) — gradient tile + white tooth. The primary mark: sidebar,
 *     portal nav, favicon.
 *   `mono` — the tooth alone in `currentColor`, no tile. For placement on a
 *     painted brand surface (the sign-in panels), where a second coloured tile
 *     would either fight the panel or sink into it.
 *
 * @example
 *   <DentGrowLogo size={28} withWordmark />          // sidebar
 *   <DentGrowLogo size={30} variant="mono" />        // on a brand panel
 */

interface DentGrowLogoProps {
  /** Width and height of the mark in px. Default: 28. */
  size?: number;
  /** Render the "DentGrow" wordmark beside the mark. Default: false. */
  withWordmark?: boolean;
  /** `tile` for the standard mark, `mono` for currentColor on a brand surface. */
  variant?: "tile" | "mono";
  className?: string;
}

export function DentGrowLogo({
  size = 28,
  withWordmark = false,
  variant = "tile",
  className,
}: DentGrowLogoProps) {
  // The gradient needs a document-unique id: the sidebar renders a logo in both
  // the desktop rail and the mobile header, and two <defs> sharing an id is
  // invalid HTML that breaks the moment one of them unmounts.
  //
  // useId's output is stripped to alphanumerics first. React generates ids
  // containing guillemets (React 19) or colons (React 18), and neither is safe
  // inside an SVG `url(#…)` reference.
  const gradientId = `dg-tile-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

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
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="DentGrow"
        style={{ flexShrink: 0, display: "block" }}
      >
        {variant === "tile" ? (
          <>
            <defs>
              {/*
                A three-stop diagonal, not a flat fill. The tile is the largest
                area of the mark, and a single flat emerald at 24px looks like a
                sticker; the light-to-deep run gives it a little dimension
                without adding anything that has to be "read".
              */}
              <linearGradient
                id={gradientId}
                x1="0.05"
                y1="0"
                x2="0.95"
                y2="1"
              >
                <stop offset="0%" stopColor="#1AA08C" />
                <stop offset="55%" stopColor="#0D6B5E" />
                <stop offset="100%" stopColor="#063B34" />
              </linearGradient>
            </defs>

            <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
            <path
              d={TOOTH_PATH}
              fill="#FFFFFF"
              transform={toothInset(LOGO_TOOTH_INSET)}
            />
          </>
        ) : (
          <path d={TOOTH_PATH} fill="currentColor" />
        )}
      </svg>

      {withWordmark && (
        <span
          style={{
            fontSize: Math.round(size * 0.5),
            fontWeight: 600,
            letterSpacing: "-0.025em",
            // Follows the theme. In `tile` mode the mark beside it is a fixed
            // brand tile, but the wordmark is plain text on the page and has to
            // be readable on both. In `mono` mode both inherit together.
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
