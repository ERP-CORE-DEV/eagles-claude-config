import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function resolveDataPath(relativePath: string): string {
  const dataRoot = process.env["EAGLES_DATA_ROOT"]
    ?? join(process.cwd(), ".data");
  const fullPath = join(dataRoot, relativePath);
  const dir = fullPath.includes(".") ? join(fullPath, "..") : fullPath;
  mkdirSync(dir, { recursive: true });
  return fullPath;
}
