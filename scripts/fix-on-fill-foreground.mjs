/**
 * Second codemod pass: text sitting ON a filled accent/status surface.
 *
 * `text-white` is correct in light mode, where every filled chip and button is
 * a dark colour. It is wrong in dark mode, where those fills have to be LIGHT
 * to read against a dark page — white on the dark-mode emerald measures 3.16:1.
 *
 * Wherever a `bg-<role>` and a `text-white` appear in the same class string,
 * the white becomes `text-<role>-foreground`, which is white in light and dark
 * ink in dark.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROLES = ["accent", "danger", "success", "warning", "info"];

const files = execSync('git ls-files "*.tsx"', { encoding: "utf8" })
  .split("\n").map((f) => f.trim()).filter(Boolean);

let changed = 0, edits = 0;

for (const file of files) {
  if (file.includes("Document") || file.includes("SignaturePad")) continue;
  const original = readFileSync(file, "utf8");
  let src = original;

  // Work class string by class string so a `bg-accent` on one element never
  // rewrites a `text-white` belonging to a different one.
  src = src.replace(/"([^"\n]*\btext-white\b[^"\n]*)"/g, (whole, cls) => {
    const role = ROLES.find((r) =>
      new RegExp(String.raw`\bbg-${r}\b(?!-)`).test(cls) ||
      new RegExp(String.raw`\bbg-${r}-(hover|active)\b`).test(cls),
    );
    if (!role) return whole;
    edits++;
    return `"${cls.replace(/\btext-white\b/g, `text-${role}-foreground`)}"`;
  });

  if (src !== original) { changed++; writeFileSync(file, src, "utf8"); }
}

console.log(`files changed: ${changed}, replacements: ${edits}`);
