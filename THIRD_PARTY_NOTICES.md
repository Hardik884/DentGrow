# Third-Party Notices

This file documents third-party assets embedded in DentGrow's own source code
(as opposed to npm dependencies, which carry their own licenses under
`node_modules` and are not duplicated here).

---

## Dental Chart tooth illustrations

**Source:** [React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul)
by Zoltán Dul.

**License:** MIT

```
MIT License

Copyright (c) 2026 Zoltán Dul

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**What was used:** The upstream project ships large, multi-layer clinical
charting SVGs per FDI tooth number (`src/assets/teeth-svgs/{11,13,14,16}.svg`)
— each containing dozens of toggleable pathology/restoration/orthodontic
overlay layers, gradients, and `data-active` states for a full periodontal
charting editor. DentGrow uses only the base healthy-tooth silhouette path
(`id="tooth-base"`, and where present `id="tooth-base-beauty"` for the small
specular highlight) from four representative teeth — 11 (central incisor), 13
(canine), 14 (first premolar), 16 (first molar) — as the four morphological
tooth shapes in `components/dental-chart/Tooth.tsx`. The path data is
reproduced as-is; only the fill/stroke colors are made dynamic (driven by
`ToothStatus`) in place of the source's static clinical fill.
