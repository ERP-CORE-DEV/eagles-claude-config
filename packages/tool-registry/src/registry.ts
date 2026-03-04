import { ToolRegistryStore } from "@eagles-ai-platform/data-layer";
import type { StoredTool } from "@eagles-ai-platform/data-layer";
import type { ToolDefinition, ToolMetadata, RegisteredTool } from "./types.js";
import { validateToolName } from "./validation.js";

function toRegisteredTool(stored: StoredTool): RegisteredTool {
  const definition: ToolDefinition = {
    name: stored.name,
    description: stored.description,
    category: stored.category,
    tags: stored.tags,
    serverName: stored.serverName,
    inputSchema: stored.inputSchema,
    registeredAt: stored.registeredAt,
  };

  const metadata: ToolMetadata = {
    callCount: stored.callCount,
    avgLatencyMs: stored.avgLatencyMs,
    lastCalledAt: stored.lastCalledAt,
  };

  return { definition, metadata };
}

export class ToolRegistry {
  private readonly store: ToolRegistryStore;

  constructor(dbPath: string) {
    this.store = new ToolRegistryStore(dbPath);
  }

  register(definition: Omit<ToolDefinition, "registeredAt">): RegisteredTool {
    const validation = validateToolName(definition.name);
    if (!validation.valid) {
      throw new Error(`Invalid tool name "${definition.name}": ${validation.error}`);
    }

    const stored = this.store.register({
      name: definition.name,
      description: definition.description,
      category: definition.category,
      tags: definition.tags,
      serverName: definition.serverName,
      inputSchema: definition.inputSchema,
    });

    return toRegisteredTool(stored);
  }

  get(name: string): RegisteredTool | null {
    const stored = this.store.get(name);
    if (stored === null) return null;
    return toRegisteredTool(stored);
  }

  findByCategory(category: string): RegisteredTool[] {
    return this.store.findByCategory(category).map(toRegisteredTool);
  }

  findByTag(tag: string): RegisteredTool[] {
    return this.store.findByTag(tag).map(toRegisteredTool);
  }

  recordCall(name: string, latencyMs: number): void {
    this.store.recordCall(name, latencyMs);
  }

  list(): RegisteredTool[] {
    return this.store.list().map(toRegisteredTool);
  }

  unregister(name: string): boolean {
    return this.store.unregister(name);
  }

  count(): number {
    return this.store.count();
  }

  close(): void {
    this.store.close();
  }
}
