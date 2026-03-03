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
    expect(toolNames).toContain("get_session_cost");
    expect(toolNames).toContain("get_agent_costs");
    expect(toolNames).toContain("get_wave_costs");
    expect(toolNames).toContain("get_cost_report");
    expect(toolNames).toContain("get_model_pricing");
    expect(toolNames).toContain("get_cost_advisory");
    expect(toolNames).toContain("record_tool_metric");
    expect(toolNames).toContain("get_tool_metrics");
    expect(toolNames).toHaveLength(11);
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

  it("get_session_cost: should return zero cost for a session with no records", async () => {
    const result = await client.callTool({
      name: "get_session_cost",
      arguments: { sessionId: "nonexistent" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.totalCost).toBe(0);
    expect(data.records).toBe(0);
    expect(data.byModel).toEqual({});
  });

  it("get_session_cost: should return correct breakdown after recording tokens", async () => {
    await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "session-cost-test",
        modelName: "claude-sonnet-4-6",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      },
    });

    const result = await client.callTool({
      name: "get_session_cost",
      arguments: { sessionId: "session-cost-test" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.records).toBe(1);
    expect(data.totalCost).toBeGreaterThan(0);
    expect(data.byModel).toHaveProperty("claude-sonnet-4-6");
  });

  it("get_agent_costs: should return empty array for session without agent records", async () => {
    const result = await client.callTool({
      name: "get_agent_costs",
      arguments: { sessionId: "no-agents-session" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("get_agent_costs: should group costs by agent name", async () => {
    await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "agent-cost-session",
        modelName: "claude-sonnet-4-6",
        promptTokens: 100_000,
        completionTokens: 100_000,
        agentName: "orchestrator",
      },
    });
    await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "agent-cost-session",
        modelName: "claude-haiku-4-5",
        promptTokens: 50_000,
        completionTokens: 50_000,
        agentName: "helper",
      },
    });

    const result = await client.callTool({
      name: "get_agent_costs",
      arguments: { sessionId: "agent-cost-session" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text) as Array<{ agentName: string; totalCost: number; totalTokens: number }>;

    expect(data.length).toBe(2);
    const agentNames = data.map((d) => d.agentName);
    expect(agentNames).toContain("orchestrator");
    expect(agentNames).toContain("helper");
  });

  it("get_wave_costs: should return empty array for session without wave records", async () => {
    const result = await client.callTool({
      name: "get_wave_costs",
      arguments: { sessionId: "no-waves-session" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("get_wave_costs: should group costs by wave number ascending", async () => {
    await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "wave-cost-session",
        modelName: "claude-sonnet-4-6",
        promptTokens: 200_000,
        completionTokens: 200_000,
        waveNumber: 2,
      },
    });
    await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "wave-cost-session",
        modelName: "claude-haiku-4-5",
        promptTokens: 100_000,
        completionTokens: 100_000,
        waveNumber: 1,
      },
    });

    const result = await client.callTool({
      name: "get_wave_costs",
      arguments: { sessionId: "wave-cost-session" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text) as Array<{ waveNumber: number; totalCost: number; totalTokens: number }>;

    expect(data.length).toBe(2);
    expect(data[0].waveNumber).toBe(1);
    expect(data[1].waveNumber).toBe(2);
  });

  it("get_cost_report: should return zero totals for empty ledger", async () => {
    const result = await client.callTool({
      name: "get_cost_report",
      arguments: { windowDays: 30 },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.totalCost).toBe(0);
    expect(data.recordCount).toBe(0);
    expect(data.byModel).toEqual({});
    expect(data.byDay).toEqual([]);
  });

  it("get_cost_report: should include records after recording token usage", async () => {
    await client.callTool({
      name: "record_token_usage",
      arguments: {
        sessionId: "report-session",
        modelName: "claude-sonnet-4-6",
        promptTokens: 500_000,
        completionTokens: 500_000,
      },
    });

    const result = await client.callTool({
      name: "get_cost_report",
      arguments: { windowDays: 30 },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data.recordCount).toBeGreaterThanOrEqual(1);
    expect(data.totalCost).toBeGreaterThan(0);
    expect(data.byModel).toHaveProperty("claude-sonnet-4-6");
    expect(data.byDay.length).toBeGreaterThanOrEqual(1);
  });

  it("get_model_pricing: should return the full pricing table without a DB query", async () => {
    const result = await client.callTool({
      name: "get_model_pricing",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);

    expect(data).toHaveProperty("claude-opus-4-6");
    expect(data).toHaveProperty("claude-sonnet-4-6");
    expect(data).toHaveProperty("claude-haiku-4-5");
    expect(data["claude-sonnet-4-6"]).toEqual({ inputPer1M: 3.0, outputPer1M: 15.0 });
  });
});
