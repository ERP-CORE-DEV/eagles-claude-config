import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { TaskStore } from "@eagles-ai-platform/data-layer";

describe("TaskEngine (SQLite)", () => {
  let engine: TaskStore;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "task-engine-orch-test-"));
    engine = new TaskStore(join(testDir, "tasks.sqlite"));
  });

  afterEach(() => {
    engine.close();
  });

  it("create_withDefaults_setsExpectedFields", () => {
    const task = engine.create({
      name: "Deploy service",
      description: "Deploy the matching engine service",
    });

    expect(task.taskId).toBeDefined();
    expect(task.name).toBe("Deploy service");
    expect(task.description).toBe("Deploy the matching engine service");
    expect(task.status).toBe("pending");
    expect(task.priority).toBe("normal");
    expect(task.dependsOn).toEqual([]);
    expect(task.requiredCapabilities).toEqual([]);
    expect(task.assignedAgent).toBeNull();
    expect(task.result).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("create_withExplicitPriority_storesPriority", () => {
    const task = engine.create({
      name: "Urgent fix",
      description: "Fix critical bug",
      priority: "urgent",
    });

    expect(task.priority).toBe("urgent");
  });

  it("get_unknownId_returnsNull", () => {
    const result = engine.get("nonexistent-id");
    expect(result).toBeNull();
  });

  it("getReady_returnsOnlyPendingTasksWithSatisfiedDeps", () => {
    const taskA = engine.create({ name: "Task A", description: "First task" });
    engine.create({
      name: "Task B",
      description: "Depends on A",
      dependsOn: [taskA.taskId],
    });
    const taskC = engine.create({
      name: "Task C",
      description: "No deps",
    });

    const ready = engine.getReady();
    const readyIds = ready.map((t) => t.taskId);

    expect(readyIds).toContain(taskA.taskId);
    expect(readyIds).toContain(taskC.taskId);
  });

  it("getReady_unlocksTaskAfterDepCompletes", () => {
    const taskA = engine.create({ name: "Task A", description: "First" });
    const taskB = engine.create({
      name: "Task B",
      description: "Depends on A",
      dependsOn: [taskA.taskId],
    });

    engine.complete(taskA.taskId, "done");

    const ready = engine.getReady();
    const readyIds = ready.map((t) => t.taskId);

    expect(readyIds).toContain(taskB.taskId);
  });

  it("assign_setsAgentAndStatus", () => {
    const task = engine.create({ name: "Task", description: "Work" });

    const assigned = engine.assign(task.taskId, "agent-42");

    expect(assigned.status).toBe("assigned");
    expect(assigned.assignedAgent).toBe("agent-42");
  });

  it("start_setsStatusToRunning", () => {
    const task = engine.create({ name: "Task", description: "Work" });
    engine.assign(task.taskId, "agent-1");

    const running = engine.start(task.taskId);

    expect(running.status).toBe("running");
  });

  it("complete_recordsResultAndTimestamp", () => {
    const task = engine.create({ name: "Task", description: "Work" });

    const completed = engine.complete(task.taskId, "All done");

    expect(completed.status).toBe("completed");
    expect(completed.result).toBe("All done");
    expect(completed.completedAt).not.toBeNull();
    expect(completed.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("fail_recordsReasonAndTimestamp", () => {
    const task = engine.create({ name: "Task", description: "Work" });

    const failed = engine.fail(task.taskId, "Timeout exceeded");

    expect(failed.status).toBe("failed");
    expect(failed.result).toBe("Timeout exceeded");
    expect(failed.completedAt).not.toBeNull();
  });

  it("getByStatus_filtersCorrectly", () => {
    const t1 = engine.create({ name: "T1", description: "Pending" });
    const t2 = engine.create({ name: "T2", description: "Will complete" });
    engine.complete(t2.taskId, "done");

    const pending = engine.getByStatus("pending");
    const completed = engine.getByStatus("completed");

    expect(pending.map((t) => t.taskId)).toContain(t1.taskId);
    expect(completed.map((t) => t.taskId)).toContain(t2.taskId);
    expect(pending.map((t) => t.taskId)).not.toContain(t2.taskId);
  });

  it("list_returnsAllTasks", () => {
    engine.create({ name: "T1", description: "Task 1" });
    engine.create({ name: "T2", description: "Task 2" });
    engine.create({ name: "T3", description: "Task 3" });

    expect(engine.list()).toHaveLength(3);
  });
});
