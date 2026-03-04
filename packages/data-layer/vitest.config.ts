import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Map self-reference and workspace packages to source for test resolution
      "@eagles-ai-platform/data-layer": resolve(__dirname, "./src/index.ts"),
      "@eagles-ai-platform/shared-utils": resolve(__dirname, "../shared-utils/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
