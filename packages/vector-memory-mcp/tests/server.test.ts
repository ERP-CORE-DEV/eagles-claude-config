import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createVectorMemoryServer } from "../src/server.js";

describe("vector-memory-mcp server", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createVectorMemoryServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  it("should list all 4 tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("memory_store");
    expect(toolNames).toContain("memory_search");
    expect(toolNames).toContain("memory_forget");
    expect(toolNames).toContain("memory_stats");
    expect(toolNames).toHaveLength(4);
  });

  it("should store a memory", async () => {
    const result = await client.callTool({
      name: "memory_store",
      arguments: {
        text: "Always use pnpm for monorepo management",
        project: "eagles-advanced",
        tags: ["pattern"],
        confidence: 0.9,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.success).toBe(true);
    expect(data.project).toBe("eagles-advanced");
  });

  it("should search memories (returns empty for stub)", async () => {
    const result = await client.callTool({
      name: "memory_search",
      arguments: {
        query: "monorepo management",
        topK: 5,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.results).toEqual([]);
    expect(data.query).toBe("monorepo management");
  });

  it("should forget memories (GDPR)", async () => {
    const result = await client.callTool({
      name: "memory_forget",
      arguments: {
        ids: ["id-1", "id-2"],
        reason: "GDPR right to erasure",
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.deleted).toBe(2);
    expect(data.indexRebuilt).toBe(true);
  });

  it("should return stats", async () => {
    const result = await client.callTool({
      name: "memory_stats",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.vectorDimensionality).toBe(384);
    expect(data.modelName).toBe("Xenova/all-MiniLM-L6-v2");
    expect(data.indexHealth).toBe("healthy");
  });
});
