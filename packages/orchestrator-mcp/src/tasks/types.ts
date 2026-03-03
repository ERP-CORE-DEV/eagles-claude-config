export type TaskStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed";

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface TaskDefinition {
  readonly taskId: string;
  readonly name: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly assignedAgent: string | null;
  readonly result: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}
