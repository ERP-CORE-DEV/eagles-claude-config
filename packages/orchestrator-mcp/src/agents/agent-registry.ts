import type { AgentInfo, AgentStatus } from "./types.js";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentInfo>();
  private readonly byCapability = new Map<string, Set<string>>();

  register(
    params: Omit<AgentInfo, "registeredAt" | "lastHeartbeat" | "status">,
  ): AgentInfo {
    const now = new Date().toISOString();
    const agent: AgentInfo = {
      ...params,
      status: "idle",
      lastHeartbeat: now,
      registeredAt: now,
    };

    this.agents.set(agent.agentId, agent);

    for (const capability of agent.capabilities) {
      const existing = this.byCapability.get(capability) ?? new Set<string>();
      existing.add(agent.agentId);
      this.byCapability.set(capability, existing);
    }

    return agent;
  }

  get(agentId: string): AgentInfo | null {
    return this.agents.get(agentId) ?? null;
  }

  findByCapability(capability: string): AgentInfo[] {
    const ids = this.byCapability.get(capability);
    if (ids === undefined) {
      return [];
    }
    return Array.from(ids)
      .map((id) => this.agents.get(id))
      .filter((agent): agent is AgentInfo => agent !== undefined);
  }

  findByTag(tag: string): AgentInfo[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.tags.includes(tag),
    );
  }

  findByStatus(status: AgentStatus): AgentInfo[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.status === status,
    );
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent === undefined) {
      return false;
    }

    for (const capability of agent.capabilities) {
      const ids = this.byCapability.get(capability);
      if (ids !== undefined) {
        ids.delete(agentId);
        if (ids.size === 0) {
          this.byCapability.delete(capability);
        }
      }
    }

    this.agents.delete(agentId);
    return true;
  }

  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent === undefined) {
      return;
    }
    this.agents.set(agentId, { ...agent, status });
  }

  recordHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent === undefined) {
      return;
    }
    this.agents.set(agentId, {
      ...agent,
      lastHeartbeat: new Date().toISOString(),
    });
  }

  count(): number {
    return this.agents.size;
  }
}
