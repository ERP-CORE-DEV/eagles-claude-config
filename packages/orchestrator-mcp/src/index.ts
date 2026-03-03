import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOrchestratorServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createOrchestratorServer();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`[orchestrator-mcp] Fatal: ${String(error)}\n`);
  process.exit(1);
});
