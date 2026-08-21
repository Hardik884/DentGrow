"""
Trace a black-and-white logo bitmap into smooth SVG paths.

Marching squares with sub-pixel interpolation over an antialiased downsample,
then Ramer-Douglas-Peucker simplification, then Catmull-Rom -> cubic Bezier
smoothing with corner preservation. Pure Python + Pillow (no numpy here).
"""

import math
import sys
from PIL import Image

SRC = sys.argv[1]
TRACE_WIDTH = int(sys.argv[2]) if len(sys.argv) > 2 else 720
RDP_EPS = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
CORNER_DEG = float(sys.argv[4]) if len(sys.argv) > 4 else 48.0
OUT_WIDTH = 128.0

# ── Load, crop to content, downsample with antialiasing ──────────────────────
im = Image.open(SRC).convert("L")
mask = im.point(lambda p: 255 if p > 128 else 0)
bbox = mask.getbbox()
im = im.crop(bbox)

w0, h0 = im.size
scale = TRACE_WIDTH / w0
tw, th = TRACE_WIDTH, max(1, int(round(h0 * scale)))
im = im.resize((tw, th), Image.LANCZOS)

px = im.load()
# Pad by one transparent cell all round so contours touching the edge close.
W, H = tw + 2, th + 2


def val(x, y):
    if x <= 0 or y <= 0 or x > tw or y > th:
        return 0.0
    return px[x - 1, y - 1] / 255.0


LEVEL = 0.5


def interp(p, q, vp, vq):
    """Sub-pixel crossing of LEVEL between two corners."""
    d = vq - vp
    t = 0.5 if abs(d) < 1e-12 else (LEVEL - vp) / d
    t = max(0.0, min(1.0, t))
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


# ── Marching squares ─────────────────────────────────────────────────────────
segs = []
for y in range(H - 1):
    for x in range(W - 1):
        tl, tr = (x, y), (x + 1, y)
        bl, br = (x, y + 1), (x + 1, y + 1)
        a, b = val(*tl), val(*tr)
        c, d = val(*br), val(*bl)
        idx = (1 if a > LEVEL else 0) | (2 if b > LEVEL else 0) \
            | (4 if c > LEVEL else 0) | (8 if d > LEVEL else 0)
        if idx in (0, 15):
            continue
        top = interp(tl, tr, a, b)
        right = interp(tr, br, b, c)
        bottom = interp(br, bl, c, d)
        left = interp(bl, tl, d, a)

        # Segments oriented so the filled side is on the left.
        if idx == 1:   segs.append((left, top))
        elif idx == 2: segs.append((top, right))
        elif idx == 3: segs.append((left, right))
        elif idx == 4: segs.append((right, bottom))
        elif idx == 5:
            if (a + b + c + d) / 4 > LEVEL:
                segs.append((left, top)); segs.append((right, bottom))
            else:
                segs.append((left, bottom)); segs.append((right, top))
        elif idx == 6: segs.append((top, bottom))
        elif idx == 7: segs.append((left, bottom))
        elif idx == 8: segs.append((bottom, left))
        elif idx == 9: segs.append((bottom, top))
        elif idx == 10:
            if (a + b + c + d) / 4 > LEVEL:
                segs.append((bottom, right)); segs.append((top, left))
            else:
                segs.append((bottom, left)); segs.append((top, right))
        elif idx == 11: segs.append((bottom, right))
        elif idx == 12: segs.append((right, left))
        elif idx == 13: segs.append((right, top))
        elif idx == 14: segs.append((top, left))

# ── Link segments into closed contours ───────────────────────────────────────
def key(p):
    return (round(p[0], 4), round(p[1], 4))


adj = {}
for s, e in segs:
    adj.setdefault(key(s), []).append((key(e), e))

contours = []
used = set()
for start_k in list(adj.keys()):
    if start_k in used:
        continue
    if not adj.get(start_k):
        continue
    path = [start_k]
    used.add(start_k)
    cur = start_k
    while True:
        nxts = adj.get(cur)
        if not nxts:
            break
        nk, npt = nxts.pop(0)
        if nk == start_k:
            break
        if nk in used:
            break
        used.add(nk)
        path.append(nk)
        cur = nk
    if len(path) > 8:
        contours.append([(p[0], p[1]) for p in path])

# ── Ramer-Douglas-Peucker ────────────────────────────────────────────────────
def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    dmax, index = 0.0, 0
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy)
    for i in range(1, len(pts) - 1):
        p = pts[i]
        if norm < 1e-12:
            d = math.hypot(p[0] - a[0], p[1] - a[1])
        else:
            d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / norm
        if d > dmax:
            dmax, index = d, i
    if dmax > eps:
        return rdp(pts[:index + 1], eps)[:-1] + rdp(pts[index:], eps)
    return [a, b]


sys.setrecursionlimit(100000)

simplified = []
for c in contours:
    # RDP on a closed ring: rotate so the split point is stable, keep it closed.
    s = rdp(c + [c[0]], RDP_EPS)
    if s[0] == s[-1]:
        s = s[:-1]
    if len(s) >= 3:
        simplified.append(s)

# Keep meaningful contours only (drop antialiasing specks).
def area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


simplified = [c for c in simplified if area(c) > (tw * th) * 0.0004]
simplified.sort(key=area, reverse=True)

# ── Normalise into the output box ────────────────────────────────────────────
xs = [p[0] for c in simplified for p in c]
ys = [p[1] for c in simplified for p in c]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
k = OUT_WIDTH / (maxx - minx)
out_h = (maxy - miny) * k


def to_out(p):
    return ((p[0] - minx) * k, (p[1] - miny) * k)


# ── Catmull-Rom -> cubic Bezier, with corner preservation ────────────────────
CORNER_COS = math.cos(math.radians(180.0 - CORNER_DEG))


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


def smooth_path(pts):
    n = len(pts)
    P = [to_out(p) for p in pts]

    # A vertex is a corner when the polyline turns hard through it; its tangent
    # is zeroed so the curve keeps the crease (the arrowhead needs this).
    tang = []
    for i in range(n):
        prev, cur, nxt = P[(i - 1) % n], P[i], P[(i + 1) % n]
        v1 = (cur[0] - prev[0], cur[1] - prev[1])
        v2 = (nxt[0] - cur[0], nxt[1] - cur[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if l1 < 1e-9 or l2 < 1e-9:
            tang.append((0.0, 0.0))
            continue
        cosang = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
        if cosang < CORNER_COS:
            tang.append((0.0, 0.0))
        else:
            tang.append(((nxt[0] - prev[0]) * 0.5, (nxt[1] - prev[1]) * 0.5))

    d = [f"M{fmt(P[0][0])} {fmt(P[0][1])}"]
    for i in range(n):
        j = (i + 1) % n
        p0, p1 = P[i], P[j]
        t0, t1 = tang[i], tang[j]
        c1 = (p0[0] + t0[0] / 3.0, p0[1] + t0[1] / 3.0)
        c2 = (p1[0] - t1[0] / 3.0, p1[1] - t1[1] / 3.0)
        d.append(
            f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} "
            f"{fmt(p1[0])} {fmt(p1[1])}"
        )
    d.append("Z")
    return "".join(d)


paths = [smooth_path(c) for c in simplified]
full = "".join(paths)

print(f"contours: {len(simplified)}")
print(f"points:   {sum(len(c) for c in simplified)}")
print(f"viewBox:  0 0 {OUT_WIDTH:.0f} {out_h:.2f}")
print(f"bytes:    {len(full)}")

with open(sys.argv[5] if len(sys.argv) > 5 else "traced.txt", "w") as f:
    f.write(f"VIEWBOX 0 0 {OUT_WIDTH:.0f} {out_h:.2f}\n")
    f.write(full)
