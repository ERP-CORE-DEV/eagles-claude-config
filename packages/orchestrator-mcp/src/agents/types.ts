export type AgentStatus = "idle" | "busy" | "offline";

export interface AgentInfo {
  readonly agentId: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly tags: readonly string[];
  readonly status: AgentStatus;
  readonly lastHeartbeat: string;
  readonly registeredAt: string;
  readonly metadata: Record<string, unknown>;
}

export interface AgentHealth {
  readonly agentId: string;
  readonly status: AgentStatus;
  readonly isStale: boolean;
  readonly lastHeartbeat: string;
  readonly uptime: number;
}
