// config — resolves data paths for SQLite and HNSW index files.
// Respects EAGLES_DATA_ROOT environment variable; defaults to .data in cwd.

import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function resolveDataPath(relativePath: string): string {
  const dataRoot = process.env["EAGLES_DATA_ROOT"] ?? join(process.cwd(), ".data");
  const fullPath = join(dataRoot, relativePath);
  const isFile = relativePath.includes(".");
  const dir = isFile ? join(fullPath, "..") : fullPath;
  mkdirSync(dir, { recursive: true });
  return fullPath;
}
