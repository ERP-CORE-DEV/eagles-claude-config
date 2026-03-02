import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Map self-reference and workspace packages to source for test resolution
      "@eagles-advanced/data-layer": resolve(__dirname, "./src/index.ts"),
      "@eagles-advanced/shared-utils": resolve(__dirname, "../shared-utils/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
