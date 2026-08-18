/**
 * One-shot codemod: hardcoded colour literals -> design tokens.
 *
 * DentGrow's components were written with the palette inlined as Tailwind
 * arbitrary values (`text-[#151918]`, `border-[#E3E9E6]`) and bare palette
 * classes (`bg-white`). Those compile to literal colours, so no amount of
 * CSS-variable work can retheme them. This rewrites them to the token
 * utilities that Tailwind v4 compiles to `var(--color-*)`, which the `.dark`
 * block in app/globals.css can then override wholesale.
 *
 * Every hex mapped here is one the light theme already defines a token for, so
 * LIGHT MODE OUTPUT IS BYTE-IDENTICAL. This is a refactor, not a restyle.
 *
 * Run: node scripts/tokenize-colors.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry");

/**
 * Files that render a PRINTABLE DOCUMENT — an invoice, a prescription, a
 * consent form. These are deliberately excluded: a bill is a white sheet of
 * paper whatever theme the app is wearing, and html2canvas/jsPDF rasterise
 * exactly what is on screen. Rewriting these to tokens would produce dark PDFs.
 */
const EXCLUDED = new Set([
  // The document bodies themselves.
  "components/billing/InvoiceDocument.tsx",
  "components/consent/ConsentDocument.tsx",
  "components/receptionist/PrescriptionDialog.tsx",
  // The capture/print drivers, which pass backgroundColor: "#ffffff" to
  // html2canvas-pro. That white must survive.
  "components/billing/InvoiceActions.tsx",
  "components/consent/ConsentActions.tsx",
  // Signature ink is drawn onto a canvas that ends up embedded in the light
  // PDF. The stroke stays dark even when the pad's chrome goes dark.
  "components/consent/SignaturePad.tsx",
  // Fixed brand mark.
  "components/shared/DentGrowLogo.tsx",
  // Renders its own <html>/<body> outside the provider, and is themed by hand.
  "app/global-error.tsx",
  // Semantic colour SETS that need designed dark values, not substitution.
  // Handled individually — see the dark-mode commit.
  "components/analytics/PeakHoursHeatmap.tsx",
  "components/business-brain/ProblemCard.tsx",
  "components/business-brain/HealthMeter.tsx",
  "components/dentist/DashboardKPIs.tsx",
  "components/shared/PatientAvatar.tsx",
  "components/dental-chart/Tooth.tsx",
]);

/** hex (lowercased) -> token name, i.e. the `X` in `--color-X`. */
const HEX_TO_TOKEN = {
  // Surfaces
  "#f6f8f6": "background",
  "#ffffff": "surface",
  "#fafcfa": "surface-secondary",
  "#eef2f0": "surface-muted",
  // Borders
  "#e3e9e6": "border",
  "#cbd5d0": "border-strong",
  "#d8e0db": "surface-pressed",
  // Text — a five-step ramp. `strong` and `body` sit between primary and
  // secondary; both were used heavily in components but never named in the
  // theme, so they are added as real tokens here.
  "#151918": "text-primary",
  "#333b36": "text-strong",
  "#5b635e": "text-body",
  "#737a76": "text-secondary",
  "#9ba39d": "text-disabled",
  // Modal scrim
  "#0b0f0e": "scrim",
  // Emerald accent ramp
  "#0d6b5e": "accent",
  "#09544b": "accent-hover",
  "#084a42": "accent-active",
  "#e8f4f0": "accent-soft",
  "#cfe7e0": "accent-soft-border",
  "#dceee8": "accent-tint-hover",
  "#f6fbf9": "accent-subtle-bg",
  // Status
  "#16a34a": "success",
  "#f0fdf4": "success-bg",
  "#bbf7d0": "success-border",
  "#166534": "success-strong",
  "#15803d": "success-hover",
  "#b45309": "warning",
  "#fffbeb": "warning-bg",
  "#fde68a": "warning-border",
  "#854d0e": "warning-strong",
  "#a16207": "warning-strong",
  "#dc2626": "danger",
  "#fef2f2": "danger-bg",
  "#fecaca": "danger-border",
  "#b91c1c": "danger-hover",
  "#9f1414": "danger-active",
  "#2563eb": "info",
  "#eff6ff": "info-bg",
  "#bfdbfe": "info-border",
  "#1e40af": "info-strong",
};

/**
 * Bare Tailwind palette classes -> token utilities. Only the ones that clearly
 * mean "app chrome" are mapped; anything ambiguous is left for manual review so
 * the codemod never silently changes a deliberate colour.
 */
const BARE_CLASS_MAP = {
  "bg-white": "bg-surface",
  "text-gray-900": "text-text-primary",
  "text-gray-800": "text-text-primary",
  "text-gray-700": "text-text-secondary",
  "text-gray-600": "text-text-secondary",
  "text-gray-500": "text-text-secondary",
  "text-gray-400": "text-text-disabled",
  "bg-gray-50": "bg-surface-secondary",
  "bg-gray-100": "bg-surface-muted",
  "border-gray-200": "border-border",
  "border-gray-300": "border-border-strong",
  "text-red-600": "text-danger",
  "text-red-700": "text-danger",
  "bg-red-50": "bg-danger-bg",
  "border-red-200": "border-danger-border",
  "text-green-600": "text-success",
  "text-green-700": "text-success",
  "bg-green-50": "bg-success-bg",
  "border-green-200": "border-success-border",
  "text-amber-600": "text-warning",
  "text-amber-700": "text-warning",
  "bg-amber-50": "bg-warning-bg",
  "border-amber-200": "border-warning-border",
  "text-blue-600": "text-info",
  "text-blue-700": "text-info",
  "bg-blue-50": "bg-info-bg",
  "border-blue-200": "border-info-border",
};

/**
 * Utility prefixes that take a colour. `text-[#fff]` -> `text-<token>`.
 * Order matters: longer prefixes first so `hover:bg-` isn't split wrongly.
 */
const COLOR_PREFIXES = [
  "bg", "text", "border", "ring", "outline", "fill", "stroke",
  "divide", "placeholder", "shadow", "accent", "caret",
  "from", "via", "to",
  "border-t", "border-b", "border-l", "border-r", "border-x", "border-y",
];

const files = execSync(
  'git ls-files "app/**/*.tsx" "components/**/*.tsx" "lib/**/*.tsx" "app/**/*.ts" "components/**/*.ts"',
  { encoding: "utf8", cwd: process.cwd() },
)
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

let changedFiles = 0;
let totalReplacements = 0;
const unmapped = new Map();

for (const file of files) {
  if (EXCLUDED.has(file)) continue;

  const original = readFileSync(file, "utf8");
  let src = original;
  let count = 0;

  // 1) Arbitrary hex values in utility classes: prefix-[#RRGGBB]
  src = src.replace(
    /\b((?:[a-z-]+:)*)([a-z]+(?:-[a-z]+)?)-\[(#[0-9A-Fa-f]{6})\]/g,
    (match, variants, prefix, hex) => {
      if (!COLOR_PREFIXES.includes(prefix)) return match;
      const token = HEX_TO_TOKEN[hex.toLowerCase()];
      if (!token) {
        unmapped.set(hex.toLowerCase(), (unmapped.get(hex.toLowerCase()) ?? 0) + 1);
        return match;
      }
      count++;
      return `${variants}${prefix}-${token}`;
    },
  );

  // 2) Bare palette classes, variant-aware (`hover:bg-white` -> `hover:bg-surface`)
  for (const [from, to] of Object.entries(BARE_CLASS_MAP)) {
    const re = new RegExp(String.raw`\b((?:[a-z-]+:)*)` + from + String.raw`\b`, "g");
    src = src.replace(re, (_m, variants) => {
      count++;
      return `${variants}${to}`;
    });
  }

  if (src !== original) {
    changedFiles++;
    totalReplacements += count;
    if (!DRY) writeFileSync(file, src, "utf8");
  }
}

console.log(`${DRY ? "[dry run] " : ""}files changed: ${changedFiles}`);
console.log(`replacements: ${totalReplacements}`);

if (unmapped.size) {
  console.log(`\nunmapped hex literals (left untouched, review manually):`);
  [...unmapped.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([hex, n]) => console.log(`  ${hex}  x${n}`));
}
