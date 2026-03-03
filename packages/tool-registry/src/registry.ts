import type { ToolDefinition, ToolMetadata, RegisteredTool } from "./types.js";
import { validateToolName } from "./validation.js";

export class ToolRegistry {
  private readonly _tools: Map<string, RegisteredTool> = new Map();
  private readonly _byCategory: Map<string, Set<string>> = new Map();
  private readonly _byTag: Map<string, Set<string>> = new Map();

  register(definition: Omit<ToolDefinition, "registeredAt">): RegisteredTool {
    const validation = validateToolName(definition.name);
    if (!validation.valid) {
      throw new Error(`Invalid tool name "${definition.name}": ${validation.error}`);
    }

    const fullDefinition: ToolDefinition = {
      ...definition,
      registeredAt: new Date().toISOString(),
    };

    const metadata: ToolMetadata = {
      callCount: 0,
      avgLatencyMs: 0,
      lastCalledAt: null,
    };

    const registered: RegisteredTool = { definition: fullDefinition, metadata };
    this._tools.set(definition.name, registered);
    this._indexByCategory(definition.name, definition.category);
    for (const tag of definition.tags) {
      this._indexByTag(definition.name, tag);
    }

    return registered;
  }

  get(name: string): RegisteredTool | null {
    return this._tools.get(name) ?? null;
  }

  findByCategory(category: string): RegisteredTool[] {
    const names = this._byCategory.get(category);
    if (names === undefined) return [];
    return this._resolveNames(names);
  }

  findByTag(tag: string): RegisteredTool[] {
    const names = this._byTag.get(tag);
    if (names === undefined) return [];
    return this._resolveNames(names);
  }

  recordCall(name: string, latencyMs: number): void {
    const existing = this._tools.get(name);
    if (existing === undefined) return;

    const { callCount, avgLatencyMs } = existing.metadata;
    const newCallCount = callCount + 1;
    const newAvgLatencyMs = avgLatencyMs + (latencyMs - avgLatencyMs) / newCallCount;

    const updatedMetadata: ToolMetadata = {
      callCount: newCallCount,
      avgLatencyMs: newAvgLatencyMs,
      lastCalledAt: new Date().toISOString(),
    };

    this._tools.set(name, { definition: existing.definition, metadata: updatedMetadata });
  }

  list(): RegisteredTool[] {
    return Array.from(this._tools.values());
  }

  unregister(name: string): boolean {
    const existing = this._tools.get(name);
    if (existing === undefined) return false;

    this._tools.delete(name);
    this._removeFromCategoryIndex(name, existing.definition.category);
    for (const tag of existing.definition.tags) {
      this._removeFromTagIndex(name, tag);
    }

    return true;
  }

  count(): number {
    return this._tools.size;
  }

  private _indexByCategory(name: string, category: string): void {
    const existing = this._byCategory.get(category);
    if (existing === undefined) {
      this._byCategory.set(category, new Set([name]));
    } else {
      existing.add(name);
    }
  }

  private _indexByTag(name: string, tag: string): void {
    const existing = this._byTag.get(tag);
    if (existing === undefined) {
      this._byTag.set(tag, new Set([name]));
    } else {
      existing.add(name);
    }
  }

  private _removeFromCategoryIndex(name: string, category: string): void {
    const names = this._byCategory.get(category);
    if (names === undefined) return;
    names.delete(name);
    if (names.size === 0) {
      this._byCategory.delete(category);
    }
  }

  private _removeFromTagIndex(name: string, tag: string): void {
    const names = this._byTag.get(tag);
    if (names === undefined) return;
    names.delete(name);
    if (names.size === 0) {
      this._byTag.delete(tag);
    }
  }

  private _resolveNames(names: Set<string>): RegisteredTool[] {
    const result: RegisteredTool[] = [];
    for (const name of names) {
      const tool = this._tools.get(name);
      if (tool !== undefined) result.push(tool);
    }
    return result;
  }
}
