/**
 * DentGrow Logo — DG monogram in a rounded square container.
 *
 * Design language: Linear / Vercel / Notion style.
 *   - Background: #111827 (off-black, not pure black)
 *   - Letterforms: white
 *   - Shape: rounded square with rx proportional to size
 *   - No gradients, no tooth/dental icons, no complex illustration
 *
 * The DG mark uses the exact same geometry as /app/icon.svg,
 * scaled via the `size` prop.
 *
 * @example
 *   // Mark only (sidebar, header)
 *   <DentGrowLogo size={28} />
 *
 *   // Mark + wordmark (auth pages, larger contexts)
 *   <DentGrowLogo size={32} withWordmark />
 */

interface DentGrowLogoProps {
  /** Width and height of the mark container in px. Default: 28. */
  size?: number;
  /** Render "DentGrow" wordmark text beside the mark. Default: false. */
  withWordmark?: boolean;
  className?: string;
}

export function DentGrowLogo({
  size = 28,
  withWordmark = false,
  className,
}: DentGrowLogoProps) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.35),
      }}
    >
      {/*
        32×32 viewBox — matches icon.svg exactly.
        The `size` prop scales it uniformly via width/height attrs.

        D (left half):
          Outer shape: solid white D, inner punch: #111827 bowl hollow.

        G (right half):
          Stroked arc ~300° with horizontal spur at mid-right.
      */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="DentGrow"
        role="img"
        style={{ flexShrink: 0, display: "block" }}
      >
        {/* Container */}
        <rect width="32" height="32" rx="7" fill="#111827" />

        {/* D — outer fill */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.5 5h8C18 5 20.5 9.2 20.5 16S18 27 12.5 27H4.5V5z"
          fill="white"
        />
        {/* D — inner punch (creates the bowl) */}
        <path
          d="M7.5 8h5C15.5 8 17.5 11 17.5 16S15.5 24 12.5 24H7.5V8z"
          fill="#111827"
        />

        {/* G — arc (~300°, gap at bottom-right) */}
        <path
          d="M27.9 11.5 A5.5 5.5 0 1 0 27.9 20.5"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        {/* G — horizontal spur */}
        <rect x="23" y="14.7" width="5.5" height="2.5" rx="0.6" fill="white" />
      </svg>

      {withWordmark && (
        <span
          style={{
            fontSize: Math.round(size * 0.5),
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "#09090B",
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
