import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/shared-utils",
  "packages/data-layer",
  "packages/token-tracker-mcp",
  "packages/vector-memory-mcp",
  "packages/drift-detector-mcp",
  "packages/benchmark",
]);
