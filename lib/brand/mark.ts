/**
 * lib/brand/mark.ts — DentGrow's one piece of brand geometry.
 *
 * The logo is a tooth with a growth chart inside it and an arrow sweeping
 * through: "Dent" and "Grow" in one drawing. The sign-in artwork is a full
 * dental arch built from that same tooth, repeated and rotated along an
 * ellipse. Everything is exported from here so the mark in the sidebar and the
 * shapes behind the sign-in form are provably the same drawing rather than two
 * silhouettes that merely resemble each other.
 *
 * Authored in a 128 x 100 box. Wider than tall because the arrow travels well
 * past the tooth on the right — the mark is a landscape lockup, not a square
 * icon, and MARK_ASPECT below is how callers size it.
 */

/** The viewBox every part of the mark is authored in. */
export const MARK_VIEWBOX = "0 0 128 100";

/** The box the mark is drawn in. */
export const MARK_BOX = { width: 128, height: 100 } as const;

/** Width divided by height. Callers multiply their height by this. */
export const MARK_ASPECT = MARK_BOX.width / MARK_BOX.height;

/**
 * The tooth, as a CENTRELINE to be stroked — not as a pre-offset ring.
 *
 * A ring means authoring an inner path parallel to the outer one by hand, and
 * every attempt drifted: the band came out fat at the shoulders and thin at the
 * roots, which pulled the crown's two lobes into something that read as a
 * heart. Stroking a single centreline makes the band width exact by
 * construction, and `stroke-linejoin: round` gives the root tips and the notch
 * their soft ends for free.
 *
 * The shape: a broad crown with two lobes and a shallow central dip, near
 * vertical flanks, then two splayed roots separated by a deep notch.
 */
export const TOOTH_PATH =
  "M18 42C18 22 27 10 38 10C47 10 53 15 58 19C63 15 70 10 79 10C90 10 98 22 98 42" +
  "C98 56 94 70 89 81C86 87 83 90 80 90C77 90 75 83 73 71C70 55 66 43 58 43" +
  "C50 43 46 55 43 71C41 83 39 90 36 90C33 90 30 87 27 81C22 70 18 56 18 42Z";

/** Band width for TOOTH_PATH, in viewBox units. */
export const TOOTH_STROKE = 11;

/**
 * Three ascending bars inside the crown — the "Grow" half of the name, drawn as
 * the smallest possible chart.
 *
 * They run all the way down to y~92 on purpose. The arrow crosses over their
 * lower half and, being the same colour, merges with them; only the rounded
 * tops read as separate columns. That is exactly how the reference behaves, and
 * it is why the bars sit 5 units apart — any tighter and the three tops close
 * into one mass above the band.
 */
export const GROWTH_BARS: ReadonlyArray<{
  x: number;
  y: number;
  width: number;
  height: number;
}> = [
  { x: 41, y: 52, width: 10, height: 40 },
  { x: 56.5, y: 41, width: 10, height: 51 },
  { x: 72, y: 31, width: 10, height: 61 },
];

/** Corner radius on the growth bars — half their width, so the tops are domes. */
export const GROWTH_BAR_RADIUS = 5.5;

/**
 * The arrow: one filled ribbon, tail and head in a single path.
 *
 * A tapering ribbon rather than a uniform stroke, because the reference's arrow
 * narrows to a point where it enters at the left and widens through the sweep.
 * It enters left of the tooth, passes under and across both roots, then climbs
 * away through the tooth's right flank to a full triangular head.
 *
 * The crossings are the point. An arc that merely passed beneath the tooth read
 * as a detached swoosh parked under a logo; cutting across the silhouette is
 * what fuses the two shapes into one mark.
 */
export const ARROW_PATH =
  "M7 58C3 78 20 93 42 92C68 91 92 70 111 38L118.4 44L126 15L97 24L103.5 30.5" +
  "C88 55 66 81 42 81C22 80 10 70 7 58Z";

/**
 * An SVG transform that places the tooth at (x, y), rotated and scaled about
 * its own centre rather than the origin — which is what lets the sign-in arch
 * rotate each tooth to stand normal to the curve without also flinging it
 * across the canvas.
 */
export function toothTransform(
  x: number,
  y: number,
  rotateDeg: number,
  scale: number
): string {
  return (
    `translate(${x.toFixed(2)} ${y.toFixed(2)}) ` +
    `rotate(${rotateDeg.toFixed(2)}) ` +
    `scale(${scale.toFixed(3)}) ` +
    `translate(${-MARK_BOX.width / 2} ${-MARK_BOX.height / 2})`
  );
}
