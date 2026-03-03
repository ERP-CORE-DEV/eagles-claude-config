import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createProviderRouterServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createProviderRouterServer();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`[provider-router-mcp] Fatal: ${String(error)}\n`);
  process.exit(1);
});
