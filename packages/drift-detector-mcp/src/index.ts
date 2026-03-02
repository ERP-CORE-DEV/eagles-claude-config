#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDriftDetectorServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createDriftDetectorServer();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`[drift-detector-mcp] Fatal: ${String(error)}\n`);
  process.exit(1);
});
