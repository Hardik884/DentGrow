/**
 * lib/brand/mark.ts — OraMedha's brand geometry.
 *
 * ## The mark
 *
 * The logo is a raster asset, not a path: `public/brand/oramedha-mark.png`,
 * generated from the supplied artwork by `brand/make-mark.mjs`. It is an
 * all-black image whose ALPHA channel carries the shape.
 *
 * WHY A RASTER, WHEN THIS FILE USED TO HOLD A TRACED PATH.
 *   The previous mark was mechanically traced to vector because hand-authoring
 *   it by eye was not faithful enough. The current artwork was supplied as a
 *   screenshot and the instruction was to use it as-is rather than re-trace it,
 *   so it is used as-is. The trade-off is deliberate and worth stating: the
 *   source is 238x117, which is comfortable at the 21-28px heights the app
 *   renders at, and thin at favicon size (see app/icon.png).
 *
 *   If a vector version of the artwork ever arrives, this is the file to change:
 *   swap MARK_SRC for a path export and update DentGrowLogo to draw it. Nothing
 *   else in the app knows how the mark is stored.
 *
 * HOW IT GETS ITS COLOUR.
 *   The component paints it with `background-color` through a CSS mask, so the
 *   single asset serves every surface: near-black on light backgrounds,
 *   near-white in dark mode, and white on the painted sign-in panel. A coloured
 *   PNG would need one file per surface, and none of them could follow a theme
 *   toggle.
 *
 * ## The arch
 *
 * ARCH_TOOTH_PATH, below, is unrelated to the logo and unchanged: it is the
 * tooth silhouette the sign-in artwork repeats as background texture. It stays a
 * vector because it is stroked, scaled and rotated a dozen times per render.
 */

/** The mark asset, served from `public/`. */
export const MARK_SRC = "/brand/oramedha-mark.png";

/**
 * Width divided by height. Callers multiply their height by this.
 *
 * 238/117 from the generated asset — a wide mark, roughly 2:1, where the
 * previous one was nearly square at 1.24:1. Any layout that assumed a squarish
 * logo needs checking against this.
 */
export const MARK_ASPECT = 238 / 117;

/**
 * A plain tooth silhouette, for the sign-in artwork's dental arch.
 *
 * Deliberately not the logo mark. The arch repeats its tooth a dozen times at low
 * opacity as a background texture; repeating the full logo — bars, arrow and
 * all — would be both illegible at that scale and far too busy behind a form.
 * This is the tooth alone, as a centreline meant to be stroked.
 */
export const ARCH_TOOTH_PATH =
  "M18 42C18 22 27 10 38 10C47 10 53 15 58 19C63 15 70 10 79 10C90 10 98 22 98 42" +
  "C98 56 94 70 89 81C86 87 83 90 80 90C77 90 75 83 73 71C70 55 66 43 58 43" +
  "C50 43 46 55 43 71C41 83 39 90 36 90C33 90 30 87 27 81C22 70 18 56 18 42Z";

/** The box ARCH_TOOTH_PATH is drawn in. */
export const ARCH_TOOTH_BOX = { width: 128, height: 100 } as const;

/**
 * An SVG transform that places an arch tooth at (x, y), rotated and scaled
 * about its own centre rather than the origin — which is what lets the arch
 * rotate each tooth to follow the curve without also flinging it across the
 * canvas.
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
    `translate(${-ARCH_TOOTH_BOX.width / 2} ${-ARCH_TOOTH_BOX.height / 2})`
  );
}
