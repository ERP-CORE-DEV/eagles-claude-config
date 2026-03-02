import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDriftDetectorServer } from "../src/server.js";

describe("drift-detector-mcp server", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createDriftDetectorServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(() => {});

  it("should list all 7 tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("drift_set_requirements");
    expect(toolNames).toContain("drift_checkpoint");
    expect(toolNames).toContain("drift_compare");
    expect(toolNames).toContain("drift_alert");
    expect(toolNames).toContain("drift_report");
    expect(toolNames).toContain("drift_history");
    expect(toolNames).toContain("drift_reset");
    expect(toolNames).toHaveLength(7);
  });

  it("should accept requirements via drift_set_requirements", async () => {
    const result = await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "test-session",
        title: "Test Feature",
        requirementsText: "- [ ] Add login page\n- [ ] Add logout button\n- [ ] Write tests",
        plannedFiles: ["src/login.ts", "src/logout.ts"],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.sessionId).toBe("test-session");
    expect(data.createdAt).toBeDefined();
  });

  it("should accept a checkpoint", async () => {
    const result = await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "test-session",
        waveNumber: 1,
        filesModified: ["src/login.ts"],
        testsTotal: 10,
        testsPassing: 8,
        requirementsAddressed: ["Add login page"],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.sessionId).toBe("test-session");
    expect(data.waveNumber).toBe(1);
  });

  it("should compare drift and return SYNCED for stub", async () => {
    const result = await client.callTool({
      name: "drift_compare",
      arguments: {
        sessionId: "test-session",
        waveNumber: 1,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.verdict).toBe("SYNCED");
    expect(data.driftScore).toBe(1.0);
  });

  it("should refuse reset without confirm=true", async () => {
    const result = await client.callTool({
      name: "drift_reset",
      arguments: {
        sessionId: "test-session",
        confirm: false,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.error).toContain("confirm must be true");
  });

  it("should return report with health status", async () => {
    const result = await client.callTool({
      name: "drift_report",
      arguments: {
        sessionId: "test-session",
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.overallHealth).toBe("HEALTHY");
    expect(data.trend).toBe("STABLE");
  });
});
