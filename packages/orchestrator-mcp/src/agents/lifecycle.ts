import type { AgentInfo, AgentHealth } from "./types.js";

const STALE_THRESHOLD_MS = 60_000;

export function isStale(lastHeartbeat: string): boolean {
  const elapsed = Date.now() - new Date(lastHeartbeat).getTime();
  return elapsed > STALE_THRESHOLD_MS;
}

export function computeHealth(agent: AgentInfo): AgentHealth {
  const registeredMs = new Date(agent.registeredAt).getTime();
  const uptimeSeconds = Math.floor((Date.now() - registeredMs) / 1_000);

  return {
    agentId: agent.agentId,
    status: agent.status,
    isStale: isStale(agent.lastHeartbeat),
    lastHeartbeat: agent.lastHeartbeat,
    uptime: uptimeSeconds,
  };
}

export function getStaleAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents.filter((agent) => isStale(agent.lastHeartbeat));
}
