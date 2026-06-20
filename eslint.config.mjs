import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Enforce no-any in strict mode — matches TypeScript strict: true
      "@typescript-eslint/no-explicit-any": "error",
      // NOTE: no-floating-promises is a type-aware rule that requires
      // parserOptions.project (typed linting). The next/core-web-vitals
      // compat preset does not configure typed linting, so this rule
      // causes a fatal ESLint error at build time. Removed to unblock builds.
      // Re-enable by adding languageOptions.parserOptions.project if typed
      // linting is explicitly configured.
    },
  },
];

export default eslintConfig;
