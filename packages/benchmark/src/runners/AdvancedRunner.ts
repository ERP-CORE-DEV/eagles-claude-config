import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskRunner, TaskResult, DummyProjectInfo } from "./types.js";
import type { TaskSpec } from "../tasks/TaskRegistry.js";

type McpClient = Client;

interface ServerFactory {
  (dbPath?: string): { connect(transport: unknown): Promise<void> };
}

export class AdvancedRunner implements TaskRunner {
  readonly systemName = "advanced" as const;

  private tokenClient: McpClient | null = null;
  private memoryClient: McpClient | null = null;
  private driftClient: McpClient | null = null;
  private dataRoot = "";
  private readonly project: DummyProjectInfo;

  constructor(project: DummyProjectInfo) {
    this.project = project;
  }

  async init(): Promise<void> {
    this.dataRoot = mkdtempSync(join(tmpdir(), "eagles-adv-bench-"));
    process.env["EAGLES_DATA_ROOT"] = this.dataRoot;

    // Dynamic imports to avoid pulling MCP server code at parse time
    const { createTokenTrackerServer } = await import(
      "@eagles-ai-platform/token-tracker-mcp/server"
    ) as { createTokenTrackerServer: ServerFactory };
    const { createDriftDetectorServer } = await import(
      "@eagles-ai-platform/drift-detector-mcp/server"
    ) as { createDriftDetectorServer: ServerFactory };

    // Vector-memory requires mocked embedding + vector store
    // We import the factory and let it use the mocked data-layer
    const { createVectorMemoryServer } = await import(
      "@eagles-ai-platform/vector-memory-mcp/server"
    ) as { createVectorMemoryServer: ServerFactory };

    this.tokenClient = await this.connectClient(createTokenTrackerServer, "token-tracker");
    this.driftClient = await this.connectClient(createDriftDetectorServer, "drift-detector");
    this.memoryClient = await this.connectClient(createVectorMemoryServer, "vector-memory");
  }

  private async connectClient(
    factory: ServerFactory,
    name: string,
  ): Promise<McpClient> {
    const server = factory();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: `bench-${name}`, version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
  }

  async execute(task: TaskSpec): Promise<TaskResult> {
    const startMs = Date.now();
    const results: unknown[] = [];
    let toolCallCount = 0;
    let lastError: string | null = null;

    for (const step of task.steps) {
      const client = this.resolveClient(step.tool);
      if (!client) {
        lastError = `No client for tool: ${step.tool}`;
        break;
      }

      try {
        const result = await client.callTool({
          name: step.tool,
          arguments: step.arguments,
        });
        toolCallCount++;

        const content = result.content as Array<{ type: string; text: string }>;
        const parsed = content.length > 0 ? JSON.parse(content[0].text) : {};
        results.push(parsed);

        if (result.isError) {
          lastError = content[0]?.text ?? "Unknown MCP error";
        }
      } catch (err: unknown) {
        lastError = String(err);
        break;
      }
    }

    const latencyMs = Date.now() - startMs;
    const category = task.category;

    return {
      metrics: {
        taskId: task.id,
        system: "advanced",
        latencyMs,
        tokenCount: 0,
        costUsd: 0,
        toolCallCount,
        success: lastError === null,
        errorMessage: lastError,
        collectedAt: new Date().toISOString(),
      },
      featureSupported: true,
      dataGranularity: this.granularityFor(category),
      automationLevel: this.automationFor(category),
      detail: {
        method: "real-mcp-calls",
        toolResults: results,
        totalSteps: task.steps.length,
        completedSteps: toolCallCount,
      },
    };
  }

  async cleanup(): Promise<void> {
    delete process.env["EAGLES_DATA_ROOT"];
    this.tokenClient = null;
    this.memoryClient = null;
    this.driftClient = null;
  }

  private resolveClient(toolName: string): McpClient | null {
    if (toolName.startsWith("memory_")) return this.memoryClient;
    if (toolName.startsWith("drift_")) return this.driftClient;
    if (
      toolName.startsWith("record_") ||
      toolName.startsWith("get_") ||
      toolName.startsWith("route_")
    ) {
      return this.tokenClient;
    }
    return null;
  }

  private granularityFor(
    category: string,
  ): "none" | "session" | "per-wave" | "per-tool" {
    switch (category) {
      case "memory":
        return "per-tool";
      case "token-tracking":
        return "per-tool";
      case "budget-enforcement":
        return "per-wave";
      case "drift-detection":
        return "per-wave";
      case "e2e-orchestration":
        return "per-tool";
      case "composite":
        return "per-tool";
      default:
        return "none";
    }
  }

  private automationFor(
    category: string,
  ): "manual" | "advisory" | "enforced" {
    switch (category) {
      case "budget-enforcement":
        return "enforced";
      case "drift-detection":
        return "enforced";
      case "e2e-orchestration":
        return "enforced";
      default:
        return "advisory";
    }
  }
}
