import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DATA_ROOT = process.env["EAGLES_DATA_ROOT"]
  ?? join(process.cwd(), ".data");

export function resolveDataPath(relativePath: string): string {
  const fullPath = join(DATA_ROOT, relativePath);
  const dir = fullPath.includes(".") ? join(fullPath, "..") : fullPath;
  mkdirSync(dir, { recursive: true });
  return fullPath;
}
