import { describe, it, expect } from "vitest";
import { findBestAgent } from "../src/tasks/coordination.js";
import type { AgentInfo } from "../src/agents/types.js";
import type { TaskDefinition } from "../src/tasks/types.js";

function makeAgent(overrides: Partial<AgentInfo> & Pick<AgentInfo, "agentId" | "capabilities">): AgentInfo {
  return {
    name: overrides.agentId,
    tags: [],
    status: "idle",
    lastHeartbeat: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    taskId: "task-1",
    name: "Test Task",
    description: "A test task",
    dependsOn: [],
    requiredCapabilities: [],
    priority: "normal",
    status: "pending",
    assignedAgent: null,
    result: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

describe("findBestAgent", () => {
  it("findBestAgent_picksIdleAgentWithMatchingCapabilities", () => {
    const task = makeTask({ requiredCapabilities: ["analysis"] });
    const agents: AgentInfo[] = [
      makeAgent({ agentId: "capable", capabilities: ["analysis"] }),
    ];

    const result = findBestAgent(task, agents);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("capable");
  });

  it("findBestAgent_returnsNullWhenNoCapableAgent", () => {
    const task = makeTask({ requiredCapabilities: ["deployment"] });
    const agents: AgentInfo[] = [
      makeAgent({ agentId: "wrong-agent", capabilities: ["analysis"] }),
    ];

    const result = findBestAgent(task, agents);

    expect(result).toBeNull();
  });

  it("findBestAgent_returnsNullWhenNoIdleAgent", () => {
    const task = makeTask({ requiredCapabilities: ["analysis"] });
    const agents: AgentInfo[] = [
      makeAgent({ agentId: "busy-agent", capabilities: ["analysis"], status: "busy" }),
    ];

    const result = findBestAgent(task, agents);

    expect(result).toBeNull();
  });

  it("findBestAgent_skipsBusyAgents", () => {
    const task = makeTask({ requiredCapabilities: ["coding"] });
    const agents: AgentInfo[] = [
      makeAgent({ agentId: "busy", capabilities: ["coding"], status: "busy" }),
      makeAgent({ agentId: "idle", capabilities: ["coding"], status: "idle" }),
    ];

    const result = findBestAgent(task, agents);

    expect(result?.agentId).toBe("idle");
  });

  it("findBestAgent_prefersMoreSpecializedAgent", () => {
    const task = makeTask({ requiredCapabilities: ["analysis"] });
    const agents: AgentInfo[] = [
      makeAgent({
        agentId: "generalist",
        capabilities: ["analysis", "coding", "testing", "deployment"],
      }),
      makeAgent({
        agentId: "specialist",
        capabilities: ["analysis"],
      }),
    ];

    const result = findBestAgent(task, agents);

    expect(result?.agentId).toBe("specialist");
  });

  it("findBestAgent_returnsNullForEmptyAgentList", () => {
    const task = makeTask({ requiredCapabilities: ["analysis"] });

    const result = findBestAgent(task, []);

    expect(result).toBeNull();
  });

  it("findBestAgent_handlesTaskWithNoRequiredCapabilities", () => {
    const task = makeTask({ requiredCapabilities: [] });
    const agents: AgentInfo[] = [
      makeAgent({ agentId: "any-agent", capabilities: ["coding"] }),
    ];

    const result = findBestAgent(task, agents);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("any-agent");
  });
});
