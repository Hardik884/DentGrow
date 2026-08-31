# Brand source

`logo-source-v2.png` is the current OraMedha logo artwork, as supplied.
`make-mark.mjs` turns it into the assets the app uses:

| Output | Used by |
|---|---|
| `public/brand/oramedha-mark.png` | `components/shared/DentGrowLogo` |
| `app/icon.png` | the favicon (`app/layout.tsx` metadata) |

```bash
node brand/make-mark.mjs
```

Requires `sharp`, which is already a project dependency.

## What it produces, and why

Both outputs are **all black, with the shape carried in the alpha channel**. The
supplied artwork is a blue-to-purple gradient on a near-white field; the gradient
is discarded and only coverage is kept.

That is what lets one file serve every surface. The component paints the mark
with `background-color` through a CSS mask, so it renders near-black on light
backgrounds, near-white in dark mode, and white on the painted sign-in panel —
all from the same PNG, all following the theme toggle. A coloured raster would
need one file per surface and none of them could respond to a theme change.

Coverage comes from each pixel's distance to the background rather than a hard
cutoff, so the anti-aliased edge survives as partial alpha instead of turning
into a staircase.

## Known limits

- **Resolution.** The artwork was supplied as a screenshot, so the mark is
  238x117. That is comfortable at the 21–28px heights the app renders at, and
  thin at favicon size.
- **The favicon is black on transparent**, so it is close to invisible on a dark
  browser tab strip. Fixing that needs either a second light asset or an SVG
  favicon with a `prefers-color-scheme` rule.
- Both limits go away if a vector version of the artwork turns up. In that case
  change `lib/brand/mark.ts` — swap `MARK_SRC` for a path export and update
  `DentGrowLogo` to draw it. Nothing else in the app knows how the mark is
  stored.

## The previous mark

`logo-source.png` and `trace-logo.py` produced the **old** tooth-and-arrow logo,
which was traced to an SVG path. They are kept only as history — the app no
longer uses either, and `MARK_PATH` no longer exists. Do not run the tracer
expecting it to update the current logo.

The dental arch behind the sign-in form is unrelated to the logo and is still a
vector (`ARCH_TOOTH_PATH` in `lib/brand/mark.ts`), because it is stroked, scaled
and rotated a dozen times per render.
