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
      // Ensure all async functions have error handling surface
      "@typescript-eslint/no-floating-promises": "warn",
    },
  },
];

export default eslintConfig;
