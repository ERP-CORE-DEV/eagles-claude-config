/**
 * Prerequisite validation for tools/skills.
 *
 * Supports AND/OR logic:
 * - prerequisites: ["a", "b"] → all must be completed (AND)
 * - prerequisiteMode: "and" | "or" (default "and")
 * - "or" mode: at least one must be completed
 */

export type PrerequisiteMode = "and" | "or";

export interface PrerequisiteConfig {
  readonly prerequisites: readonly string[];
  readonly mode: PrerequisiteMode;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly missing: readonly string[];
}

export function validatePrerequisites(
  config: PrerequisiteConfig,
  completedTools: ReadonlySet<string>,
): ValidationResult {
  if (config.prerequisites.length === 0) {
    return { valid: true, missing: [] };
  }

  const missing = config.prerequisites.filter((p) => !completedTools.has(p));

  if (config.mode === "or") {
    // At least one prerequisite must be completed
    const valid = missing.length < config.prerequisites.length;
    return { valid, missing: valid ? [] : missing };
  }

  // AND mode: all prerequisites must be completed
  return { valid: missing.length === 0, missing };
}
