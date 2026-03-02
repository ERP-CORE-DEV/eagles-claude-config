import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Map workspace package to source for test resolution without requiring a build
      "@eagles-advanced/data-layer": resolve(__dirname, "../data-layer/src/index.ts"),
      "@eagles-advanced/shared-utils": resolve(__dirname, "../shared-utils/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
