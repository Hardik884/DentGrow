import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["business-brain/**/*.spec.ts"],
    environment: "node",
  },
});
