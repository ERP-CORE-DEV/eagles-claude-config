import { randomUUID } from "node:crypto";
import type { TaskDefinition, TaskPriority, TaskStatus } from "./types.js";

export class TaskEngine {
  private readonly tasks = new Map<string, TaskDefinition>();

  create(params: {
    name: string;
    description: string;
    dependsOn?: string[];
    requiredCapabilities?: string[];
    priority?: TaskPriority;
  }): TaskDefinition {
    const task: TaskDefinition = {
      taskId: randomUUID(),
      name: params.name,
      description: params.description,
      dependsOn: params.dependsOn ?? [],
      requiredCapabilities: params.requiredCapabilities ?? [],
      priority: params.priority ?? "normal",
      status: "pending",
      assignedAgent: null,
      result: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    this.tasks.set(task.taskId, task);
    return task;
  }

  get(taskId: string): TaskDefinition | null {
    return this.tasks.get(taskId) ?? null;
  }

  getReady(): TaskDefinition[] {
    return Array.from(this.tasks.values()).filter((task) => {
      if (task.status !== "pending") {
        return false;
      }
      return task.dependsOn.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep !== undefined && dep.status === "completed";
      });
    });
  }

  assign(taskId: string, agentId: string): TaskDefinition {
    const task = this.tasks.get(taskId);
    if (task === undefined) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const updated: TaskDefinition = {
      ...task,
      status: "assigned",
      assignedAgent: agentId,
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  start(taskId: string): TaskDefinition {
    const task = this.tasks.get(taskId);
    if (task === undefined) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const updated: TaskDefinition = { ...task, status: "running" };
    this.tasks.set(taskId, updated);
    return updated;
  }

  complete(taskId: string, result: string): TaskDefinition {
    const task = this.tasks.get(taskId);
    if (task === undefined) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const updated: TaskDefinition = {
      ...task,
      status: "completed",
      result,
      completedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  fail(taskId: string, reason: string): TaskDefinition {
    const task = this.tasks.get(taskId);
    if (task === undefined) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const updated: TaskDefinition = {
      ...task,
      status: "failed",
      result: reason,
      completedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  list(): TaskDefinition[] {
    return Array.from(this.tasks.values());
  }

  getByStatus(status: TaskStatus): TaskDefinition[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status === status,
    );
  }

  validateDag(): { valid: boolean; cycles?: string[] } {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const cycleNodes: string[] = [];

    const dfs = (taskId: string): boolean => {
      visited.add(taskId);
      inStack.add(taskId);

      const task = this.tasks.get(taskId);
      if (task !== undefined) {
        for (const depId of task.dependsOn) {
          if (!visited.has(depId)) {
            if (dfs(depId)) {
              cycleNodes.push(depId);
              return true;
            }
          } else if (inStack.has(depId)) {
            cycleNodes.push(depId);
            return true;
          }
        }
      }

      inStack.delete(taskId);
      return false;
    };

    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        if (dfs(taskId)) {
          return { valid: false, cycles: Array.from(new Set(cycleNodes)) };
        }
      }
    }

    return { valid: true };
  }
}
