import { TOOTH_PATH, toothTransform } from "@/lib/brand/mark";

/**
 * AuthArtwork — the canvas behind the sign-in panel.
 *
 * WHAT IT DRAWS
 *   A full dental arch, built from the same tooth the logo is (lib/brand/mark),
 *   repeated fourteen times along an ellipse with each copy rotated to stand
 *   normal to the curve and scaled so the molars at the ends are broader than
 *   the incisors at the apex. Behind it: nested contour arcs echoing the arch,
 *   an off-centre aurora of soft emerald light, and a fine grain.
 *
 *   The point of reusing the logo's path is that the identity holds together —
 *   the mark in the corner is visibly one tooth lifted out of the arch behind
 *   the form, not a separate drawing that happens to be dental.
 *
 * WHY IT LOOKS THE WAY IT DOES
 *   The first version used plain rounded capsules for the segments, which read
 *   as pills rather than teeth, and a single flat glow that left the panel
 *   feeling like a coloured rectangle. Real tooth silhouettes plus a layered
 *   aurora give the panel depth without adding anything loud: everything is
 *   line-work and soft light, no photography, no glassmorphism.
 *
 * HOW IT THEMES ITSELF
 *   Every stroke is `currentColor` at low opacity, so the artwork inherits
 *   whatever ink the panel sets. That is what lets one component serve the
 *   staff panel (white on deep emerald), the patient panel (emerald on mint or
 *   pale ink on deep green) and the admin panel (grey on graphite) without a
 *   single conditional. Only the aurora takes an explicit colour.
 *
 * Purely decorative: aria-hidden, and it never carries information that isn't
 * also in the text beside it.
 */

interface AuthArtworkProps {
  /** Aurora colour. Defaults to the emerald accent. */
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
  cy: 305,
  rx: 195,
  ry: 158,
  // Twelve rather than a full adult sixteen: at this radius sixteen silhouettes
  // sit shoulder to shoulder and the arch reads as a comb. Twelve leaves air
  // between them, which is what makes them legible as individual teeth.
  teeth: 12,
};

/**
 * Base size of an arch tooth.
 *
 * TOOTH_PATH is authored in a 128-unit box (lib/brand/mark.ts), so this is
 * roughly a quarter — an arch tooth is ~44 units wide in this 600-unit canvas.
 */
const TOOTH_SCALE = 0.34;

/**
 * How much of the curve's normal each tooth actually follows, 0–1.
 *
 * Rotating each tooth fully normal to the ellipse is geometrically "correct"
 * and looks wrong: the molars end up lying on their sides, and a tooth on its
 * side stops reading as a tooth and starts reading as a hook. Damping the
 * rotation keeps the fan — the arch still curves — while every silhouette
 * stays upright enough to be recognisable. This is a drawing of a smile, not
 * an occlusal diagram.
 */
const FAN_DAMPING = 0.4;

/** Positions for the arch teeth, spaced evenly over the upper half-ellipse. */
function archTeeth() {
  const { cx, cy, rx, ry, teeth } = ARCH;
  const mid = (teeth - 1) / 2;

  return Array.from({ length: teeth }, (_, i) => {
    // π → 2π sweeps left-to-right over the top of the ellipse.
    const a = Math.PI + ((i + 0.5) / teeth) * Math.PI;
    // Distance from the centre of the arch, 0 at the incisors → 1 at the molars.
    const outward = Math.abs(i - mid) / mid;

    // Normal to the curve, re-centred so the apex is 0° and the ends are ±90°,
    // then damped. Without the re-centring the damping would pull every tooth
    // toward 0° of the raw sweep, which is the right-hand molar, not the apex.
    let normal = (a * 180) / Math.PI + 90;
    if (normal > 180) normal -= 360;

    return {
      x: cx + rx * Math.cos(a),
      y: cy + ry * Math.sin(a),
      rotate: normal * FAN_DAMPING,
      // Molars are broader than incisors.
      scale: TOOTH_SCALE * (0.84 + outward * 0.38),
    };
  });
}

export function AuthArtwork({ glow = "#35A18F", className }: AuthArtworkProps) {
  const teeth = archTeeth();

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
        {/* Aurora — three lights at different sizes and strengths, so the
            panel has a direction to it instead of one centred halo. */}
        <radialGradient id="dg-auth-aurora-1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="45%" stopColor={glow} stopOpacity="0.16" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-auth-aurora-2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.28" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-auth-aurora-3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.07" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>

        {/* Contour arcs fade at both ends so they read as light catching a
            curve rather than as drawn lines that stop. */}
        <linearGradient id="dg-auth-contour" x1="0" y1="0.2" x2="1" y2="0.8">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="42%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>

        {/* The arch itself, brighter at the apex than at the molars. */}
        <linearGradient id="dg-auth-arch" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>

        {/* Fine grain. baseFrequency is high so it reads as paper texture
            rather than visible noise. */}
        <filter id="dg-auth-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      {/* Aurora, painted first and off-centre so the composition leans. */}
      <circle cx="452" cy="150" r="330" fill="url(#dg-auth-aurora-1)" />
      <circle cx="70" cy="640" r="300" fill="url(#dg-auth-aurora-2)" />
      <circle cx="300" cy="330" r="260" fill="url(#dg-auth-aurora-3)" />

      {/* Contour arcs — five nested curves following the arch. */}
      <g stroke="url(#dg-auth-contour)" strokeWidth="1.2" strokeLinecap="round">
        {[52, 96, 148, 208, 276].map((offset) => (
          <path
            key={offset}
            d={`M ${ARCH.cx - ARCH.rx - offset} ${ARCH.cy + offset * 0.34}
                A ${ARCH.rx + offset} ${ARCH.ry + offset * 0.9} 0 0 1 ${ARCH.cx + ARCH.rx + offset} ${ARCH.cy + offset * 0.34}`}
          />
        ))}
      </g>

      {/* The arch, drawn as outlines. */}
      <g
        stroke="url(#dg-auth-arch)"
        strokeWidth={1 / TOOTH_SCALE}
        strokeLinejoin="round"
        fill="none"
      >
        {teeth.map((t, i) => (
          <path
            key={i}
            d={TOOTH_PATH}
            transform={toothTransform(t.x, t.y, t.rotate, t.scale)}
          />
        ))}
      </g>

      {/* The two central incisors are filled, so the eye has one place to land
          and the arch is anchored without lighting the whole thing up. */}
      <g fill={glow} fillOpacity="0.42">
        {[teeth[5], teeth[6]].map((t, i) => (
          <path
            key={i}
            d={TOOTH_PATH}
            transform={toothTransform(t.x, t.y, t.rotate, t.scale)}
          />
        ))}
      </g>

      {/* Grain, last so it sits over everything. */}
      <rect
        width="600"
        height="900"
        filter="url(#dg-auth-grain)"
        opacity="0.15"
        style={{ mixBlendMode: "overlay" }}
      />
    </svg>
  );
}
