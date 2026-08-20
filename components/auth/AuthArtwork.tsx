/**
 * AuthArtwork — the decorative canvas behind the sign-in panel.
 *
 * The brief for this was "premium, not generic SaaS" with restraint, so the
 * whole thing is line-work: a dental arch drawn as fourteen rounded segments
 * following an ellipse, a couple of concentric arch outlines behind it, a soft
 * off-centre glow, and a barely-there grain. No photographs, no cartoon teeth,
 * no glassmorphism.
 *
 * Everything is stroked in `currentColor` at low opacity, so the artwork simply
 * inherits whatever ink the panel sets. That is what makes one component work
 * on the staff panel (white on deep emerald), the patient panel (emerald on
 * mint) and the admin panel (grey on graphite) without a single conditional.
 *
 * Purely decorative: aria-hidden, and it never carries information that isn't
 * also in the text beside it.
 */

interface AuthArtworkProps {
  /** Glow colour. Defaults to the emerald accent. */
  glow?: string;
  className?: string;
}

/**
 * Arch geometry, in viewBox units.
 *
 * `cy` is set high on purpose. The panel's message block sits roughly in the
 * vertical middle, and on the shortest panel (admin, which has no bullet list)
 * an arch centred lower put a tooth directly behind the eyebrow rule. Raising
 * the arch clears the text on all three tones without needing per-tone
 * geometry.
 */
const ARCH = {
  cx: 300,
  cy: 340,
  rx: 208,
  ry: 168,
  teeth: 14,
};

/** Positions for the arch segments, spaced evenly over the upper half-ellipse. */
function archSegments() {
  const { cx, cy, rx, ry, teeth } = ARCH;
  return Array.from({ length: teeth }, (_, i) => {
    // π → 2π sweeps left-to-right over the top of the ellipse.
    const a = Math.PI + ((i + 0.5) / teeth) * Math.PI;
    return {
      x: cx + rx * Math.cos(a),
      y: cy + ry * Math.sin(a),
      // +90° so each segment stands normal to the curve: upright at the apex,
      // laid over at the ends, the way a real arch reads.
      rotate: (a * 180) / Math.PI + 90,
      // The molars at the ends are wider than the incisors at the apex.
      scale: 0.78 + Math.abs(i - (teeth - 1) / 2) / (teeth - 1) * 0.6,
    };
  });
}

export function AuthArtwork({ glow = "#35A18F", className }: AuthArtworkProps) {
  const segments = archSegments();

  return (
    <svg
      className={className}
      viewBox="0 0 600 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="dg-auth-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.55" />
          <stop offset="55%" stopColor={glow} stopOpacity="0.14" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>

        <radialGradient id="dg-auth-glow-2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.26" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>

        {/* Fine grain. baseFrequency is high so it reads as paper texture
            rather than visible noise, and the whole layer sits at 0.16. */}
        <filter id="dg-auth-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>

        {/* Softens the arch outlines so they sit behind the segments rather
            than competing with them. */}
        <linearGradient id="dg-auth-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.02" />
          <stop offset="45%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Glows — off-centre so the composition is asymmetric. */}
      <circle cx="430" cy="200" r="300" fill="url(#dg-auth-glow)" />
      <circle cx="90" cy="720" r="260" fill="url(#dg-auth-glow-2)" />

      {/* Horizon lines: a very quiet rhythm behind everything. */}
      <g stroke="currentColor" strokeOpacity="0.05" strokeWidth="1">
        {[120, 260, 400, 540, 680, 820].map((y) => (
          <line key={y} x1="-40" y1={y} x2="640" y2={y} />
        ))}
      </g>

      {/* Concentric arch outlines. */}
      <g stroke="url(#dg-auth-arc)" strokeWidth="1.25" strokeLinecap="round">
        {[0, 34, 68].map((offset) => (
          <path
            key={offset}
            d={`M ${ARCH.cx - ARCH.rx - offset} ${ARCH.cy}
                A ${ARCH.rx + offset} ${ARCH.ry + offset} 0 0 1 ${ARCH.cx + ARCH.rx + offset} ${ARCH.cy}`}
          />
        ))}
      </g>

      {/* The arch itself. */}
      <g stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4">
        {segments.map((s, i) => (
          <g
            key={i}
            transform={`translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${s.rotate.toFixed(2)}) scale(${s.scale.toFixed(3)})`}
          >
            <rect x="-15" y="-19" width="30" height="38" rx="13" />
          </g>
        ))}
      </g>

      {/* Two filled accents mark the arch without lighting the whole thing up. */}
      <g fill={glow} fillOpacity="0.5">
        {[segments[6], segments[7]].map((s, i) => (
          <g
            key={i}
            transform={`translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${s.rotate.toFixed(2)}) scale(${s.scale.toFixed(3)})`}
          >
            <rect x="-15" y="-19" width="30" height="38" rx="13" />
          </g>
        ))}
      </g>

      {/* Grain, last so it sits over everything. */}
      <rect
        width="600"
        height="900"
        filter="url(#dg-auth-grain)"
        opacity="0.16"
        style={{ mixBlendMode: "overlay" }}
      />
    </svg>
  );
}
