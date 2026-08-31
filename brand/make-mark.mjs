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
import { writeFile } from "node:fs/promises";

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

// ── Theme-aware SVG favicon ──────────────────────────────────────────────────
//
// A black PNG favicon disappears on a dark browser tab strip. Fixing that needs
// the favicon to know the scheme, and only SVG favicons can carry a media query.
//
// The artwork is a raster, so the shape reaches the SVG as an embedded image used
// as a LUMINANCE MASK over a filled rect — the rect supplies the colour, the mask
// supplies the shape, and `prefers-color-scheme` swaps the rect's fill. That
// keeps the supplied artwork pixel-for-pixel rather than re-tracing it into paths.
//
// The mask image has to be WHITE on transparent, not black: an SVG mask reads
// luminance x alpha, so a black shape would evaluate to zero everywhere and mask
// the whole thing away.
//
// app/icon.png stays as a fallback for anything that will not take an SVG
// favicon; Next.js lists both and the browser picks.
const ICON_SVG = "app/icon.svg";

const maskPng = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  // Invert RGB only: black -> white, alpha untouched.
  .negate({ alpha: false })
  .png({ compressionLevel: 9 })
  .toBuffer();

const maskB64 = maskPng.toString("base64");

// Centred on a square viewBox with the same padding as the PNG icon, so the two
// favicons are the same drawing at the same scale.
const svgMarkWidth = 1 - ICON_PADDING * 2;
const svgMarkHeight = svgMarkWidth / (w / h);
const svgX = ICON_PADDING;
const svgY = (1 - svgMarkHeight) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">
  <!--
    GENERATED by brand/make-mark.mjs from brand/logo-source-v2.png.
    Do not hand-edit: re-run the script instead.

    The mark is the supplied artwork, embedded as a luminance mask so the fill
    below can follow the browser's colour scheme. Near-black on a light tab strip,
    near-white on a dark one - the same two tokens the app's UI uses.
  -->
  <defs>
    <mask id="m" maskContentUnits="objectBoundingBox">
      <image href="data:image/png;base64,${maskB64}"
             x="${svgX}" y="${svgY.toFixed(6)}"
             width="${svgMarkWidth}" height="${svgMarkHeight.toFixed(6)}"
             preserveAspectRatio="xMidYMid meet" />
    </mask>
  </defs>
  <style>
    .mark { fill: #151918; }
    @media (prefers-color-scheme: dark) { .mark { fill: #F1F5F3; } }
  </style>
  <rect class="mark" width="1" height="1" mask="url(#m)" />
</svg>
`;

await writeFile(ICON_SVG, svg, "utf8");
console.log(`${ICON_SVG}  theme-aware (${Math.round(maskPng.length / 1024)}KB mask embedded)`);

// ── Apple touch icon ─────────────────────────────────────────────────────────
//
// iOS composites a home-screen icon onto an opaque tile: transparency becomes
// black. A transparent black mark would therefore render black-on-black and
// vanish, which is exactly what pointing `apple` at icon.png would have done.
//
// So this one is deliberately NOT transparent — the mark is white on the brand's
// near-black ground, which is also how the product actually looks.
const APPLE_ICON = "app/apple-icon.png";
const APPLE_SIZE = 180; // the size iOS asks for
const APPLE_BG = { r: 15, g: 20, b: 18, alpha: 1 }; // #0F1412, the app's dark ground

const appleMarkWidth = Math.round(APPLE_SIZE * (1 - ICON_PADDING * 2));
const appleMarkHeight = Math.round(appleMarkWidth / (w / h));

const appleMark = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .negate({ alpha: false }) // black -> white, alpha untouched
  .resize(appleMarkWidth, appleMarkHeight)
  .png()
  .toBuffer();

await sharp({
  create: { width: APPLE_SIZE, height: APPLE_SIZE, channels: 4, background: APPLE_BG },
})
  .composite([{ input: appleMark, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(APPLE_ICON);

console.log(`${APPLE_ICON}  ${APPLE_SIZE}x${APPLE_SIZE}  white mark on #0F1412`);
