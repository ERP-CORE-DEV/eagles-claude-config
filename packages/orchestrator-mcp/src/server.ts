import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentRegistryStore } from "@eagles-ai-platform/data-layer";
import { TaskStore } from "@eagles-ai-platform/data-layer";
import { SonaLearningStore } from "@eagles-ai-platform/data-layer";
import { computeHealth } from "./agents/lifecycle.js";
import { findBestAgent } from "./tasks/coordination.js";
import type { AgentInfo } from "./agents/types.js";
import type { TaskDefinition } from "./tasks/types.js";

export function createOrchestratorServer(dbDir?: string): McpServer {
  const dir = dbDir ?? process.env["EAGLES_DATA_ROOT"] ?? join(process.cwd(), ".eagles-data");
  const registry = new AgentRegistryStore(join(dir, "agents.sqlite"));
  const engine = new TaskStore(join(dir, "tasks.sqlite"));
  const sona = new SonaLearningStore(join(dir, "learning.sqlite"));
  const server = new McpServer({ name: "orchestrator-mcp", version: "0.1.0" });

  // -------------------------------------------------------------------------
  // agent_register
  // -------------------------------------------------------------------------
  server.tool(
    "agent_register",
    {
      agentId: z.string(),
      name: z.string(),
      capabilities: z.array(z.string()),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params) => {
      const agent = registry.register({
        agentId: params.agentId,
        name: params.name,
        capabilities: params.capabilities,
        tags: params.tags ?? [],
        metadata: params.metadata ?? {},
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            agentId: agent.agentId,
            name: agent.name,
            capabilities: agent.capabilities,
            tags: agent.tags,
            status: agent.status,
            registeredAt: agent.registeredAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // agent_discover
  // -------------------------------------------------------------------------
  server.tool(
    "agent_discover",
    {
      capability: z.string().optional(),
      tag: z.string().optional(),
      status: z.enum(["idle", "busy", "offline"]).optional(),
    },
    async (params) => {
      let agents = registry.list();

      if (params.capability !== undefined) {
        agents = registry.findByCapability(params.capability);
      } else if (params.tag !== undefined) {
        agents = registry.findByTag(params.tag);
      }

      if (params.status !== undefined) {
        agents = agents.filter((a) => a.status === params.status);
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            agents: agents.map((a) => ({
              agentId: a.agentId,
              name: a.name,
              capabilities: a.capabilities,
              tags: a.tags,
              status: a.status,
              lastHeartbeat: a.lastHeartbeat,
            })),
            total: agents.length,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // agent_status
  // -------------------------------------------------------------------------
  server.tool(
    "agent_status",
    {
      agentId: z.string(),
    },
    async (params) => {
      const agent = registry.get(params.agentId);

      if (agent === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Agent not found: ${params.agentId}` }),
          }],
        };
      }

      const health = computeHealth(agent as AgentInfo);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            agentId: health.agentId,
            status: health.status,
            isStale: health.isStale,
            lastHeartbeat: health.lastHeartbeat,
            uptime: health.uptime,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // agent_heartbeat
  // -------------------------------------------------------------------------
  server.tool(
    "agent_heartbeat",
    {
      agentId: z.string(),
    },
    async (params) => {
      registry.recordHeartbeat(params.agentId);

      const agent = registry.get(params.agentId);
      if (agent === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Agent not found: ${params.agentId}` }),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            agentId: agent.agentId,
            lastHeartbeat: agent.lastHeartbeat,
            acknowledged: true,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // task_create
  // -------------------------------------------------------------------------
  server.tool(
    "task_create",
    {
      name: z.string(),
      description: z.string(),
      dependsOn: z.array(z.string()).optional(),
      requiredCapabilities: z.array(z.string()).optional(),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
    },
    async (params) => {
      const task = engine.create({
        name: params.name,
        description: params.description,
        dependsOn: params.dependsOn,
        requiredCapabilities: params.requiredCapabilities,
        priority: params.priority,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            taskId: task.taskId,
            name: task.name,
            status: task.status,
            priority: task.priority,
            dependsOn: task.dependsOn,
            requiredCapabilities: task.requiredCapabilities,
            createdAt: task.createdAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // task_assign
  // -------------------------------------------------------------------------
  server.tool(
    "task_assign",
    {
      taskId: z.string(),
    },
    async (params) => {
      const task = engine.get(params.taskId);

      if (task === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Task not found: ${params.taskId}` }),
          }],
        };
      }

      const bestAgent = findBestAgent(task as TaskDefinition, registry.list() as unknown as AgentInfo[]);

      if (bestAgent === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "No suitable idle agent found for task",
              taskId: params.taskId,
              requiredCapabilities: task.requiredCapabilities,
            }),
          }],
        };
      }

      const assigned = engine.assign(params.taskId, bestAgent.agentId);
      registry.updateStatus(bestAgent.agentId, "busy");

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            taskId: assigned.taskId,
            status: assigned.status,
            assignedAgent: assigned.assignedAgent,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // task_status
  // -------------------------------------------------------------------------
  server.tool(
    "task_status",
    {
      taskId: z.string(),
    },
    async (params) => {
      const task = engine.get(params.taskId);

      if (task === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Task not found: ${params.taskId}` }),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            taskId: task.taskId,
            name: task.name,
            status: task.status,
            priority: task.priority,
            assignedAgent: task.assignedAgent,
            createdAt: task.createdAt,
            completedAt: task.completedAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // task_results
  // -------------------------------------------------------------------------
  server.tool(
    "task_results",
    {
      taskId: z.string(),
    },
    async (params) => {
      const task = engine.get(params.taskId);

      if (task === null) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Task not found: ${params.taskId}` }),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            taskId: task.taskId,
            status: task.status,
            result: task.result,
            completedAt: task.completedAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // learn_pattern
  // -------------------------------------------------------------------------
  server.tool(
    "learn_pattern",
    {
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()).optional(),
    },
    async (params) => {
      const pattern = sona.store({
        name: params.name,
        description: params.description,
        tags: params.tags,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            patternId: pattern.patternId,
            name: pattern.name,
            successRate: pattern.successRate,
            totalAttempts: pattern.totalAttempts,
            tags: pattern.tags,
            archived: pattern.archived,
            createdAt: pattern.createdAt,
          }),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // learn_suggest
  // -------------------------------------------------------------------------
  server.tool(
    "learn_suggest",
    {
      tags: z.array(z.string()).optional(),
      limit: z.number().int().positive().optional(),
    },
    async (params) => {
      const patterns = sona.suggest(params.tags, params.limit);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            patterns: patterns.map((p) => ({
              patternId: p.patternId,
              name: p.name,
              description: p.description,
              successRate: p.successRate,
              totalAttempts: p.totalAttempts,
              tags: p.tags,
            })),
            total: patterns.length,
          }),
        }],
      };
    },
  );

  return server;
}
