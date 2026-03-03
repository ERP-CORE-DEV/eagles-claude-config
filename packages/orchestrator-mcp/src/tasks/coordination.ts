import type { AgentInfo } from "../agents/types.js";
import type { TaskDefinition } from "./types.js";

export function findBestAgent(
  task: TaskDefinition,
  agents: AgentInfo[],
): AgentInfo | null {
  const idleAgents = agents.filter((agent) => agent.status === "idle");

  const capable = idleAgents.filter((agent) =>
    task.requiredCapabilities.every((cap) => agent.capabilities.includes(cap)),
  );

  if (capable.length === 0) {
    return null;
  }

  capable.sort((a, b) => a.capabilities.length - b.capabilities.length);

  return capable[0] ?? null;
}
