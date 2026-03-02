export interface McpToolResult<T = unknown> {
  readonly success: boolean;
  readonly data: T;
  readonly error?: string;
  readonly processingMs?: number;
}
