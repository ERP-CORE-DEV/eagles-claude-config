import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVerificationServer } from "../src/server.js";

function makeTempDb(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "verify-server-test-"));
  const dbPath = join(dir, "test.sqlite");
  return {
    dbPath,
    // Skip rmSync on Windows — SQLite WAL/SHM files stay locked; OS cleans temp on reboot
    cleanup: () => {},
  };
}

async function makeClient(dbPath: string): Promise<Client> {
  const server = createVerificationServer(dbPath);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

function parseToolResult(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

describe("verification-mcp server", () => {
  let client: Client;
  let cleanup: () => void;

  beforeEach(async () => {
    const temp = makeTempDb();
    cleanup = temp.cleanup;
    client = await makeClient(temp.dbPath);
  });

  afterEach(() => {
    cleanup();
  });

  it("should list all 8 tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("verify_output");
    expect(toolNames).toContain("verify_score_agent");
    expect(toolNames).toContain("verify_checkpoint_create");
    expect(toolNames).toContain("verify_checkpoint_list");
    expect(toolNames).toContain("verify_checkpoint_restore");
    expect(toolNames).toContain("verify_rollback");
    expect(toolNames).toContain("verify_pipeline_run");
    expect(toolNames).toContain("verify_history");
    expect(toolNames).toHaveLength(8);
  });

  it("verify_output_returnsAssessmentWithConfidenceAndSuggestedAction", async () => {
    const result = await client.callTool({
      name: "verify_output",
      arguments: {
        sessionId: "test-session",
        output: "This is a well-formed output from the agent that exceeds minimum length.",
      },
    });

    const data = parseToolResult(result) as {
      sessionId: string;
      confidence: number;
      flags: string[];
      suggestedAction: string;
    };

    expect(data.sessionId).toBe("test-session");
    expect(data.confidence).toBeGreaterThanOrEqual(0);
    expect(data.confidence).toBeLessThanOrEqual(1);
    expect(["accept", "review", "reject"]).toContain(data.suggestedAction);
    expect(Array.isArray(data.flags)).toBe(true);
  });

  it("verify_checkpoint_create_andRestore_roundtripsState", async () => {
    const createResult = await client.callTool({
      name: "verify_checkpoint_create",
      arguments: {
        sessionId: "cp-session",
        name: "wave-1",
        stateJson: '{"files": ["a.ts", "b.ts"]}',
        agentScore: 0.88,
      },
    });

    const createData = parseToolResult(createResult) as {
      checkpointId: string;
      sessionId: string;
      name: string;
      verified: boolean;
    };

    expect(createData.sessionId).toBe("cp-session");
    expect(createData.name).toBe("wave-1");
    expect(createData.verified).toBe(false);
    expect(createData.checkpointId).toBeDefined();

    const restoreResult = await client.callTool({
      name: "verify_checkpoint_restore",
      arguments: { checkpointId: createData.checkpointId },
    });

    const restoreData = parseToolResult(restoreResult) as {
      checkpointId: string;
      stateJson: string;
      agentScore: number;
    };

    expect(restoreData.checkpointId).toBe(createData.checkpointId);
    expect(restoreData.stateJson).toBe('{"files": ["a.ts", "b.ts"]}');
    expect(restoreData.agentScore).toBe(0.88);
  });

  it("verify_score_agent_returnsAgentScoreWithRiskLevel", async () => {
    const now = new Date().toISOString();

    const result = await client.callTool({
      name: "verify_score_agent",
      arguments: {
        sessionId: "score-session",
        agentId: "agent-alpha",
        observations: [
          { dimension: "accuracy", value: 0.9, timestamp: now },
          { dimension: "reliability", value: 0.85, timestamp: now },
          { dimension: "consistency", value: 0.88, timestamp: now },
          { dimension: "efficiency", value: 0.82, timestamp: now },
          { dimension: "adaptability", value: 0.80, timestamp: now },
        ],
      },
    });

    const data = parseToolResult(result) as {
      sessionId: string;
      agentId: string;
      composite: number;
      riskLevel: string;
    };

    expect(data.sessionId).toBe("score-session");
    expect(data.agentId).toBe("agent-alpha");
    expect(data.composite).toBeGreaterThan(0);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(data.riskLevel);
  });

  it("verify_history_returnsVerificationRecords", async () => {
    await client.callTool({
      name: "verify_output",
      arguments: { sessionId: "history-session", output: "First output for the history test." },
    });

    await client.callTool({
      name: "verify_output",
      arguments: { sessionId: "history-session", output: "Second output for the history test." },
    });

    const result = await client.callTool({
      name: "verify_history",
      arguments: { sessionId: "history-session" },
    });

    const data = parseToolResult(result) as {
      sessionId: string;
      records: unknown[];
      total: number;
    };

    expect(data.sessionId).toBe("history-session");
    expect(data.total).toBe(2);
    expect(data.records).toHaveLength(2);
  });
});
