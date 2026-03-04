import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { ToolRegistry } from "../src/registry.js";
import {
  SKILL_CATALOG,
  CLASSIC_SKILL_COUNT,
  LANGUAGE_SKILL_COUNT,
  CLOUD_SKILL_COUNT,
  DATABASE_SKILL_COUNT,
  TOTAL_SKILL_COUNT,
} from "../src/skill-catalog.js";
import { validatePrerequisites } from "../src/prerequisites.js";
import { detectCycles } from "../src/graph.js";
import type { GraphNode } from "../src/graph.js";

describe("Skill Catalog", () => {
  it("should have correct total count (62 skills)", () => {
    expect(TOTAL_SKILL_COUNT).toBe(62);
    expect(SKILL_CATALOG).toHaveLength(62);
  });

  it("should have correct breakdown: 26 Classic + 14 Language + 10 Cloud + 12 Database = 62", () => {
    expect(CLASSIC_SKILL_COUNT).toBe(26);
    expect(LANGUAGE_SKILL_COUNT).toBe(14);
    expect(CLOUD_SKILL_COUNT).toBe(10);
    expect(DATABASE_SKILL_COUNT).toBe(12);
    expect(CLASSIC_SKILL_COUNT + LANGUAGE_SKILL_COUNT + CLOUD_SKILL_COUNT + DATABASE_SKILL_COUNT).toBe(62);
  });

  it("should have unique names across all skills", () => {
    const names = SKILL_CATALOG.map((s) => s.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have valid categories for all skills", () => {
    const validCategories = new Set([
      "quality", "security", "devops", "codegen", "testing", "deploy",
      "compliance", "database", "planning", "architecture", "docs",
      "language", "iac",
    ]);

    for (const skill of SKILL_CATALOG) {
      expect(validCategories.has(skill.category), `Invalid category "${skill.category}" for skill "${skill.name}"`).toBe(true);
    }
  });

  it("should have non-empty tags for all skills", () => {
    for (const skill of SKILL_CATALOG) {
      expect(skill.tags.length, `Skill "${skill.name}" has no tags`).toBeGreaterThan(0);
    }
  });

  it("should have positive estimated minutes for all skills", () => {
    for (const skill of SKILL_CATALOG) {
      expect(skill.estimatedMinutes, `Skill "${skill.name}" has non-positive minutes`).toBeGreaterThan(0);
    }
  });

  it("should reference only valid prerequisites (all prereqs exist in catalog)", () => {
    const allNames = new Set(SKILL_CATALOG.map((s) => s.name));

    for (const skill of SKILL_CATALOG) {
      for (const prereq of skill.prerequisites) {
        expect(allNames.has(prereq), `Skill "${skill.name}" references unknown prerequisite "${prereq}"`).toBe(true);
      }
    }
  });

  it("should have no cycles in the prerequisite graph", () => {
    const nodes: GraphNode[] = SKILL_CATALOG.map((s) => ({
      name: s.name,
      dependencies: [...s.prerequisites],
    }));

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(false);
  });
});

describe("Skill Catalog — Registration", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "skill-catalog-test-"));
    registry = new ToolRegistry(join(testDir, "skills.sqlite"));
  });

  afterEach(() => {
    registry.close();
  });

  it("should register all 62 skills into the registry", () => {
    for (const skill of SKILL_CATALOG) {
      registry.register({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        serverName: skill.serverName,
        inputSchema: {},
      });
    }

    expect(registry.count()).toBe(SKILL_CATALOG.length);
  });

  it("should find skills by category after registration", () => {
    for (const skill of SKILL_CATALOG) {
      registry.register({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        serverName: skill.serverName,
        inputSchema: {},
      });
    }

    const dbSkills = registry.findByCategory("database");
    expect(dbSkills.length).toBeGreaterThanOrEqual(10);

    const testingSkills = registry.findByCategory("testing");
    expect(testingSkills.length).toBeGreaterThanOrEqual(5);
  });

  it("should validate prerequisite chain for helm_deploy", () => {
    const helmDeploy = SKILL_CATALOG.find((s) => s.name === "helm_deploy")!;
    expect(helmDeploy.prerequisites).toContain("azure_pipeline");

    // Without azure_pipeline completed
    const result1 = validatePrerequisites(
      { prerequisites: [...helmDeploy.prerequisites], mode: helmDeploy.prerequisiteMode },
      new Set(),
    );
    expect(result1.valid).toBe(false);
    expect(result1.missing).toContain("azure_pipeline");

    // With azure_pipeline completed
    const result2 = validatePrerequisites(
      { prerequisites: [...helmDeploy.prerequisites], mode: helmDeploy.prerequisiteMode },
      new Set(["azure_pipeline"]),
    );
    expect(result2.valid).toBe(true);
  });

  it("should validate OR prerequisite for aws_deploy (needs terraform OR direct)", () => {
    const awsDeploy = SKILL_CATALOG.find((s) => s.name === "aws_deploy")!;
    expect(awsDeploy.prerequisiteMode).toBe("or");

    const result = validatePrerequisites(
      { prerequisites: [...awsDeploy.prerequisites], mode: awsDeploy.prerequisiteMode },
      new Set(["terraform_validate"]),
    );
    expect(result.valid).toBe(true);
  });
});
