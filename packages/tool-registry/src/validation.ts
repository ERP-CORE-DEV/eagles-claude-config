import { z } from "zod";

const TOOL_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_/:-]*$/;

const toolNameSchema = z.string().regex(TOOL_NAME_REGEX);

export function validateToolName(name: string): { valid: boolean; error?: string } {
  const result = toolNameSchema.safeParse(name);
  return result.success ? { valid: true } : { valid: false, error: result.error.message };
}

export function validateInputSchema(schema: Record<string, unknown>): { valid: boolean; error?: string } {
  if (typeof schema !== "object" || schema === null) {
    return { valid: false, error: "Schema must be a non-null object" };
  }
  return { valid: true };
}
