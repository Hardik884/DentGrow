# Brand source

`logo-source.png` is the DentGrow logo artwork. `trace-logo.py` converts it into
the SVG path used by the app.

**The logo path in `lib/brand/mark.ts` is generated from this file. Do not
hand-edit it.** Earlier attempts hand-authored those curves from the artwork by
eye and were never close enough; the trace is the artwork.

## Re-tracing

Needed only when the artwork itself changes. Requires Pillow (`pip install
pillow`).

```bash
python brand/trace-logo.py brand/logo-source.png 720 0.6 48 traced.txt
```

Arguments: source image, trace width in px, Ramer-Douglas-Peucker epsilon, and
the corner threshold in degrees (turns sharper than this keep their crease, so
the arrowhead stays pointed). The output file's first line is the viewBox; the
rest is the path data. Both go into `lib/brand/mark.ts` as `MARK_VIEWBOX` and
`MARK_PATH`.

Raising the epsilon shrinks the path at the cost of fidelity; 0.6 gives ~10KB
and is visually indistinguishable from the bitmap at every size the app renders.

## What the tracer does

Marching squares with sub-pixel interpolation over an antialiased downsample —
so contours come out smooth rather than stair-stepped — then RDP simplification,
then Catmull-Rom-to-Bezier smoothing with corner preservation.

The artwork's tooth, bars and arrow overlap into one flat silhouette, so the
trace produces outer boundaries plus holes. They are emitted as a single path
rendered with `fill-rule: evenodd`, which is correct regardless of winding
order. That is also why the mark takes a single fill and its parts cannot be
coloured separately.
