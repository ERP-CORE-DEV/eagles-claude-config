import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../src/agents/agent-registry.js";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
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
      tags: [],
      metadata: {},
    });
    registry.register({
      agentId: "agent-b",
      name: "Agent B",
      capabilities: ["coding", "analysis"],
      tags: [],
      metadata: {},
    });
    registry.register({
      agentId: "agent-c",
      name: "Agent C",
      capabilities: ["testing"],
      tags: [],
      metadata: {},
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
      tags: [],
      metadata: {},
    });

    const result = registry.findByCapability("deployment");

    expect(result).toHaveLength(0);
  });

  it("findByTag_returnsMatchingAgents", () => {
    registry.register({
      agentId: "agent-1",
      name: "Frontend Agent",
      capabilities: [],
      tags: ["frontend", "react"],
      metadata: {},
    });
    registry.register({
      agentId: "agent-2",
      name: "Backend Agent",
      capabilities: [],
      tags: ["backend"],
      metadata: {},
    });

    const result = registry.findByTag("frontend");

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("agent-1");
  });

  it("findByStatus_filtersCorrectly", () => {
    registry.register({
      agentId: "agent-idle",
      name: "Idle Agent",
      capabilities: [],
      tags: [],
      metadata: {},
    });
    registry.register({
      agentId: "agent-busy",
      name: "Busy Agent",
      capabilities: [],
      tags: [],
      metadata: {},
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
      capabilities: [],
      tags: [],
      metadata: {},
    });

    registry.updateStatus("agent-1", "offline");

    const agent = registry.get("agent-1");
    expect(agent?.status).toBe("offline");
  });

  it("recordHeartbeat_updatesLastHeartbeat", async () => {
    registry.register({
      agentId: "agent-hb",
      name: "Heartbeat Agent",
      capabilities: [],
      tags: [],
      metadata: {},
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
      tags: [],
      metadata: {},
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
    registry.register({
      agentId: "agent-x",
      name: "X",
      capabilities: [],
      tags: [],
      metadata: {},
    });
    registry.register({
      agentId: "agent-y",
      name: "Y",
      capabilities: [],
      tags: [],
      metadata: {},
    });

    const all = registry.list();

    expect(all).toHaveLength(2);
  });

  it("count_returnsNumberOfRegisteredAgents", () => {
    expect(registry.count()).toBe(0);

    registry.register({
      agentId: "a1",
      name: "A1",
      capabilities: [],
      tags: [],
      metadata: {},
    });
    registry.register({
      agentId: "a2",
      name: "A2",
      capabilities: [],
      tags: [],
      metadata: {},
    });

    expect(registry.count()).toBe(2);
  });
});
