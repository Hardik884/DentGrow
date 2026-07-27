import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias from tsconfig.json so specs can import
    // application modules the same way the app does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: [
      "business-brain/**/*.spec.ts",
      // The Business Brain's Supabase adapter lives in lib/ (the port stays in
      // business-brain/, the adapter belongs to the app). Its integration specs
      // run against the local Supabase stack and skip themselves when it is not
      // running — see lib/business-brain/__tests__.
      "lib/**/*.spec.ts",
    ],
    environment: "node",
    // Integration specs talk to Postgres over HTTP; the default 5s is tight for
    // the seeding step on a cold container.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
