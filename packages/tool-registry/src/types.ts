export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly serverName: string;
  readonly inputSchema: Record<string, unknown>;
  readonly registeredAt: string;
}

export interface ToolMetadata {
  readonly callCount: number;
  readonly avgLatencyMs: number;
  readonly lastCalledAt: string | null;
}

export interface RegisteredTool {
  readonly definition: ToolDefinition;
  readonly metadata: ToolMetadata;
}
