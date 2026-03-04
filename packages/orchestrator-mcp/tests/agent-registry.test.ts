import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { AgentRegistryStore } from "@eagles-ai-platform/data-layer";

describe("AgentRegistry (SQLite)", () => {
  let registry: AgentRegistryStore;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "agent-registry-orch-test-"));
    registry = new AgentRegistryStore(join(testDir, "agents.sqlite"));
  });

  afterEach(() => {
    registry.close();
  });

  it("register_andGet_returnsRegisteredAgent", () => {
    const agent = registry.register({
      agentId: "agent-1",
      name: "Worker Agent",
      capabilities: ["analysis", "coding"],
      tags: ["backend"],
      metadata: {},
    });

    const found = registry.get("agent-1");

    expect(found).not.toBeNull();
    expect(found?.agentId).toBe("agent-1");
    expect(found?.name).toBe("Worker Agent");
    expect(found?.status).toBe("idle");
    expect(found?.registeredAt).toBe(agent.registeredAt);
  });

  it("get_unknownId_returnsNull", () => {
    const result = registry.get("nonexistent");
    expect(result).toBeNull();
  });

  it("findByCapability_returnsMatchingAgents", () => {
    registry.register({
      agentId: "agent-a",
      name: "Agent A",
      capabilities: ["analysis"],
    });
    registry.register({
      agentId: "agent-b",
      name: "Agent B",
      capabilities: ["coding", "analysis"],
    });
    registry.register({
      agentId: "agent-c",
      name: "Agent C",
      capabilities: ["testing"],
    });

    const result = registry.findByCapability("analysis");

    expect(result).toHaveLength(2);
    const ids = result.map((a) => a.agentId);
    expect(ids).toContain("agent-a");
    expect(ids).toContain("agent-b");
  });

  it("findByCapability_noneMatch_returnsEmptyArray", () => {
    registry.register({
      agentId: "agent-a",
      name: "Agent A",
      capabilities: ["coding"],
    });

    const result = registry.findByCapability("deployment");

    expect(result).toHaveLength(0);
  });

  it("findByTag_returnsMatchingAgents", () => {
    registry.register({
      agentId: "agent-1",
      name: "Frontend Agent",
      tags: ["frontend", "react"],
    });
    registry.register({
      agentId: "agent-2",
      name: "Backend Agent",
      tags: ["backend"],
    });

    const result = registry.findByTag("frontend");

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("agent-1");
  });

  it("findByStatus_filtersCorrectly", () => {
    registry.register({
      agentId: "agent-idle",
      name: "Idle Agent",
    });
    registry.register({
      agentId: "agent-busy",
      name: "Busy Agent",
    });

    registry.updateStatus("agent-busy", "busy");

    const idleAgents = registry.findByStatus("idle");
    const busyAgents = registry.findByStatus("busy");

    expect(idleAgents).toHaveLength(1);
    expect(idleAgents[0].agentId).toBe("agent-idle");
    expect(busyAgents).toHaveLength(1);
    expect(busyAgents[0].agentId).toBe("agent-busy");
  });

  it("updateStatus_changesAgentStatus", () => {
    registry.register({
      agentId: "agent-1",
      name: "Agent",
    });

    registry.updateStatus("agent-1", "offline");

    const agent = registry.get("agent-1");
    expect(agent?.status).toBe("offline");
  });

  it("recordHeartbeat_updatesLastHeartbeat", async () => {
    registry.register({
      agentId: "agent-hb",
      name: "Heartbeat Agent",
    });

    const before = registry.get("agent-hb")!.lastHeartbeat;

    await new Promise((resolve) => setTimeout(resolve, 5));
    registry.recordHeartbeat("agent-hb");

    const after = registry.get("agent-hb")!.lastHeartbeat;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });

  it("unregister_removesAgent", () => {
    registry.register({
      agentId: "agent-remove",
      name: "Agent To Remove",
      capabilities: ["coding"],
    });

    const removed = registry.unregister("agent-remove");

    expect(removed).toBe(true);
    expect(registry.get("agent-remove")).toBeNull();
    expect(registry.findByCapability("coding")).toHaveLength(0);
  });

  it("unregister_unknownId_returnsFalse", () => {
    const result = registry.unregister("nonexistent");
    expect(result).toBe(false);
  });

  it("list_returnsAllAgents", () => {
    registry.register({ agentId: "agent-x", name: "X" });
    registry.register({ agentId: "agent-y", name: "Y" });

    const all = registry.list();

    expect(all).toHaveLength(2);
  });

  it("count_returnsNumberOfRegisteredAgents", () => {
    expect(registry.count()).toBe(0);

    registry.register({ agentId: "a1", name: "A1" });
    registry.register({ agentId: "a2", name: "A2" });

    expect(registry.count()).toBe(2);
  });
});
