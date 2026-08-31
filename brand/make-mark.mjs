/**
 * Builds public/brand/oramedha-mark.png from brand/logo-source-v2.png.
 *
 * The supplied artwork is a screenshot: the mark in a blue-to-purple gradient on
 * a flat near-white field (#FBFBFB). What the app needs is the SHAPE, so this
 * throws the gradient away and keeps only coverage — an all-black image whose
 * ALPHA channel is the mark.
 *
 * Why alpha and not a coloured PNG: the app paints the mark with
 * `background-color` through a CSS mask, so one file serves every surface —
 * near-black on light backgrounds, near-white on dark ones, white on the painted
 * sign-in panel. Two colour variants of a raster would have to be kept in sync,
 * and neither could follow a theme toggle.
 *
 * Coverage is derived from distance-to-background rather than a hard threshold,
 * so the anti-aliased edge survives as partial alpha instead of turning into a
 * staircase. The source is sharply bimodal — ~8.5k pixels sit >150 away from the
 * background, ~43k sit <20, and only ~1k fall between — so a single normalising
 * constant reproduces the edge faithfully.
 *
 * Run: node brand/make-mark.mjs
 */

import sharp from "sharp";

const SRC = "brand/logo-source-v2.png";
const OUT = "public/brand/oramedha-mark.png";

/** The screenshot's flat background. */
const BG = [251, 251, 251];

/**
 * Distance at which a pixel counts as fully covered.
 *
 * Set to the low end of the mark's own distance cluster (~271) rather than the
 * maximum (~334): the gradient means a fully-opaque pixel's distance varies with
 * where it sits in the mark, and normalising by the maximum would leave the
 * blue end permanently under-opaque.
 */
const FULL_COVERAGE_DISTANCE = 271;

/** Below this, a pixel is background and contributes nothing. */
const BACKGROUND_DISTANCE = 20;

const { data, info } = await sharp(SRC)
  .raw()
  .ensureAlpha()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

const distanceAt = (x, y) => {
  const i = (y * width + x) * channels;
  return Math.hypot(data[i] - BG[0], data[i + 1] - BG[1], data[i + 2] - BG[2]);
};

// Tight bounding box, so the component controls spacing rather than inheriting
// whatever margin the screenshot happened to have.
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (distanceAt(x, y) > BACKGROUND_DISTANCE) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const w = maxX - minX + 1;
const h = maxY - minY + 1;

// Black everywhere; the alpha channel carries the mark.
const out = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y += 1) {
  for (let x = 0; x < w; x += 1) {
    const d = distanceAt(x + minX, y + minY);
    const alpha = Math.max(0, Math.min(1, d / FULL_COVERAGE_DISTANCE));
    const o = (y * w + x) * 4;
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = Math.round(alpha * 255);
  }
}

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`${OUT}  ${w}x${h}  aspect ${(w / h).toFixed(4)}`);

// ── Favicon ──────────────────────────────────────────────────────────────────
//
// A browser tab is square and the mark is 2:1, so the mark is centred on a
// square canvas with a little breathing room rather than stretched or cropped.
// That costs height: at a 16px tab the mark ends up ~7px tall, and its strokes
// are thin. It is still the right trade — a cropped mark would no longer be the
// logo, and redrawing a simplified glyph would be inventing artwork.
//
// Black with transparency, matching the instruction that the mark be black. Note
// this means it is near-invisible on a dark browser tab strip; a light variant
// would need a second file and `prefers-color-scheme`, which favicons support
// only in SVG.
const ICON = "app/icon.png";
const ICON_SIZE = 512;
const ICON_PADDING = 0.08; // fraction of the canvas kept clear on each side

const markWidth = Math.round(ICON_SIZE * (1 - ICON_PADDING * 2));
const markHeight = Math.round(markWidth / (w / h));

const resized = await sharp(OUT).resize(markWidth, markHeight).toBuffer();

await sharp({
  create: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: resized, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(ICON);

console.log(`${ICON}  ${ICON_SIZE}x${ICON_SIZE}  (mark ${markWidth}x${markHeight})`);
