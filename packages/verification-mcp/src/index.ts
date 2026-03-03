import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVerificationServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createVerificationServer();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`[verification-mcp] Fatal: ${String(error)}\n`);
  process.exit(1);
});
