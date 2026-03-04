import { describe, it, expect } from "vitest";
import { validatePrerequisites } from "../src/prerequisites.js";

describe("validatePrerequisites", () => {
  describe("AND mode", () => {
    it("should pass when all prerequisites are completed", () => {
      const result = validatePrerequisites(
        { prerequisites: ["build", "test"], mode: "and" },
        new Set(["build", "test", "lint"]),
      );

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("should fail when one prerequisite is missing", () => {
      const result = validatePrerequisites(
        { prerequisites: ["build", "test", "lint"], mode: "and" },
        new Set(["build", "test"]),
      );

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["lint"]);
    });

    it("should fail when all prerequisites are missing", () => {
      const result = validatePrerequisites(
        { prerequisites: ["build", "test"], mode: "and" },
        new Set(),
      );

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["build", "test"]);
    });

    it("should pass when prerequisites array is empty", () => {
      const result = validatePrerequisites(
        { prerequisites: [], mode: "and" },
        new Set(),
      );

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe("OR mode", () => {
    it("should pass when at least one prerequisite is completed", () => {
      const result = validatePrerequisites(
        { prerequisites: ["aws_deploy", "gcp_deploy", "azure_deploy"], mode: "or" },
        new Set(["gcp_deploy"]),
      );

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("should fail when no prerequisites are completed", () => {
      const result = validatePrerequisites(
        { prerequisites: ["aws_deploy", "gcp_deploy"], mode: "or" },
        new Set(["unrelated_skill"]),
      );

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["aws_deploy", "gcp_deploy"]);
    });

    it("should pass when all prerequisites are completed", () => {
      const result = validatePrerequisites(
        { prerequisites: ["a", "b"], mode: "or" },
        new Set(["a", "b"]),
      );

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("should pass when prerequisites array is empty", () => {
      const result = validatePrerequisites(
        { prerequisites: [], mode: "or" },
        new Set(),
      );

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });
});
