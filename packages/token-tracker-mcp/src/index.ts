import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTokenTrackerServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createTokenTrackerServer();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`[token-tracker-mcp] Fatal: ${String(error)}\n`);
  process.exit(1);
});
