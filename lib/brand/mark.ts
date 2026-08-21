/**
 * lib/brand/mark.ts — DentGrow's one piece of brand geometry.
 *
 * The logo is a single tooth. The sign-in artwork is a full dental arch built
 * from that same tooth, repeated and rotated along an ellipse. They are the
 * same path, exported once, so the mark in the sidebar and the shapes behind
 * the sign-in form are provably the same drawing rather than two silhouettes
 * that merely resemble each other.
 *
 * The path is authored in a 32×32 box with the crown at the top, which is also
 * the logo's viewBox — so the logo uses it untransformed, and the artwork
 * places copies with the helper below.
 */

/**
 * The tooth: a broad crown, a slight shoulder flare, and two splayed roots
 * separated by a notch.
 *
 * Deliberately drawn wide. An anatomically narrow tooth collapses into a
 * featureless capsule below about 24px, and the sidebar renders this at 24–28px
 * — so the silhouette is stylised toward width, which is what keeps it legible
 * as a TOOTH at the sizes it is actually used.
 */
export const TOOTH_PATH =
  "M16 4.6C10.2 4.6 6 8.2 6 13.4C6 17.2 7 20.2 8.2 23.4C9.1 25.9 9.8 28 11.6 28" +
  "C13.5 28 14 24.6 14.6 22.2C14.9 21 15.4 20.4 16 20.4C16.6 20.4 17.1 21 17.4 22.2" +
  "C18 24.6 18.5 28 20.4 28C22.2 28 22.9 25.9 23.8 23.4C25 20.2 26 17.2 26 13.4" +
  "C26 8.2 21.8 4.6 16 4.6Z";

/** The box TOOTH_PATH is drawn in. */
export const TOOTH_BOX = 32;

/**
 * An SVG transform that places the tooth at (x, y), rotated and scaled about
 * its own centre rather than the origin — which is what lets the arch rotate
 * each tooth to stand normal to the curve without also flinging it across the
 * canvas.
 */
export function toothTransform(
  x: number,
  y: number,
  rotateDeg: number,
  scale: number
): string {
  const half = TOOTH_BOX / 2;
  return (
    `translate(${x.toFixed(2)} ${y.toFixed(2)}) ` +
    `rotate(${rotateDeg.toFixed(2)}) ` +
    `scale(${scale.toFixed(3)}) ` +
    `translate(${-half} ${-half})`
  );
}

/**
 * Inset transform for the logo tile: shrinks the tooth about the tile centre so
 * it sits with real padding instead of touching the rounded corners.
 */
export function toothInset(k: number): string {
  const half = TOOTH_BOX / 2;
  return `translate(${half * (1 - k)} ${half * (1 - k)}) scale(${k})`;
}

/** How much the tooth is inset inside the logo tile. */
export const LOGO_TOOTH_INSET = 0.86;

// ── The full mark: tooth outline + growth bars + momentum arrow ────────────

/**
 * The viewBox the full mark is drawn in.
 *
 * Wider than the tooth's own 32-unit box on every side, because the arrow has
 * to sweep OUTSIDE the tooth to read as an arrow at all. A first attempt kept
 * everything inside 0 0 32 32 and the tail disappeared behind the silhouette —
 * only the head poked out, so the mark read as a circle with a spur.
 */
export const MARK_VIEWBOX = "-3 -2 38 38";

/**
 * The three ascending bars inside the tooth's crown — the "Grow" half of the
 * name, drawn as the smallest possible chart.
 *
 * Bottom-aligned at y=19.5 rather than lower down because TOOTH_PATH starts
 * splitting into roots at y=20.4; a bar crossing that line would poke through
 * the notch between the roots.
 */
export const GROWTH_BARS: ReadonlyArray<{
  x: number;
  y: number;
  width: number;
  height: number;
}> = [
  { x: 11.0, y: 15.5, width: 2.8, height: 4.0 },
  { x: 14.6, y: 12.7, width: 2.8, height: 6.8 },
  { x: 18.2, y: 9.9, width: 2.8, height: 9.6 },
];

/** Corner radius on the growth bars. */
export const GROWTH_BAR_RADIUS = 1.4;

/**
 * The arrow's tail: enters at the left below the crown, sweeps under and across
 * both root tips, then climbs away through the tooth's right flank.
 *
 * The crossings are the point. An arc that merely passed beneath the tooth read
 * as a detached swoosh sitting under a logo; cutting across the silhouette is
 * what ties the two shapes into one mark.
 */
export const ARROW_TAIL =
  "M-1.8 13C-2.4 23.5 4.6 30.4 15.4 30C23.6 29.7 29.6 25.4 31.4 17.6";

/** The arrowhead, a solid triangle aligned with the tail's exit tangent. */
export const ARROW_HEAD = "M32.4 13.1L33.8 18.2L29 17Z";
