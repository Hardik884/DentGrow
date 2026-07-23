import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * Scoped to the Business Brain module so it does not pick up the Playwright
 * end-to-end specs. Business Brain unit tests are pure and run in a Node
 * environment with no database or browser.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["business-brain/**/*.test.ts"],
  },
});
