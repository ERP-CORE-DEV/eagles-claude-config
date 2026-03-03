import { describe, it, expect } from "vitest";
import { validateToolName, validateInputSchema } from "../src/validation.js";

describe("validateToolName", () => {
  describe("valid names", () => {
    it("should accept a simple alphabetic name", () => {
      const result = validateToolName("memory");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept a name with underscores and digits", () => {
      const result = validateToolName("memory_search2");
      expect(result.valid).toBe(true);
    });

    it("should accept a namespaced tool name with slashes and colons", () => {
      const result = validateToolName("vector-memory/search:fast");
      expect(result.valid).toBe(true);
    });

    it("should accept a single-character alphabetic name", () => {
      const result = validateToolName("x");
      expect(result.valid).toBe(true);
    });

    it("should accept mixed-case names with hyphens", () => {
      const result = validateToolName("TokenTracker-recordUsage");
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid names", () => {
    it("should reject a name that starts with a digit", () => {
      const result = validateToolName("1invalid");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject a name containing spaces", () => {
      const result = validateToolName("invalid name");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject an empty string", () => {
      const result = validateToolName("");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject a name that starts with an underscore", () => {
      const result = validateToolName("_private_tool");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject a name containing special characters like @", () => {
      const result = validateToolName("tool@server");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe("validateInputSchema", () => {
  it("should accept a valid non-null object", () => {
    const result = validateInputSchema({ type: "object", properties: {} });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should accept an empty object", () => {
    const result = validateInputSchema({});
    expect(result.valid).toBe(true);
  });

  it("should reject null cast as Record", () => {
    const result = validateInputSchema(null as unknown as Record<string, unknown>);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Schema must be a non-null object");
  });

  it("should reject a string cast as Record", () => {
    const result = validateInputSchema("not an object" as unknown as Record<string, unknown>);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Schema must be a non-null object");
  });

  it("should reject a number cast as Record", () => {
    const result = validateInputSchema(42 as unknown as Record<string, unknown>);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Schema must be a non-null object");
  });
});
