import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTokenTrackerServer } from "../src/server.js";

describe("token-tracker-mcp server", () => {
  let client: Client;

  beforeEach(async () => {
    const testDir = mkdtempSync(join(tmpdir(), "tracker-test-"));
    process.env["EAGLES_DATA_ROOT"] = testDir;

    const server = createTokenTrackerServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(() => {
    delete process.env["EAGLES_DATA_ROOT"];
  });

  it("should list available tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("record_token_usage");
    expect(toolNames).toContain("get_budget_status");
    expect(toolNames).toContain("route_by_budget");
  });

  it("should record token usage and return computed cost", async () => {
    const result = await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "test-session",
        modelName: "claude-sonnet-4-6",
        promptTokens: 10000,
        completionTokens: 5000,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.id).toBeDefined();
    expect(data.totalTokens).toBe(15000);
    expect(data.estimatedCostUsd).toBeGreaterThan(0);
    expect(data.sessionId).toBe("test-session");
  });

  it("should return budget status as 'ok' with no usage", async () => {
    const result = await client.callTool({
      name: "get_budget_status",
      arguments: { windowDays: 30 },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.status).toBe("ok");
    expect(data.totalCostUsd).toBe(0);
  });

  it("should recommend model based on budget", async () => {
    const result = await client.callTool({
      name: "route_by_budget",
      arguments: { requiredCapabilityLevel: "basic" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.recommended).toBeDefined();
    expect(data.currentSpendUsd).toBe(0);
  });
});
