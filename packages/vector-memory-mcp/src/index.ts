import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVectorMemoryServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createVectorMemoryServer();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`[vector-memory-mcp] Fatal: ${String(error)}\n`);
  process.exit(1);
});
