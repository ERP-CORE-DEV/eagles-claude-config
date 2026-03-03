import { join } from "node:path";
import { tmpdir } from "node:os";

const EAGLES_DATA_ROOT = process.env["EAGLES_DATA_ROOT"];

export function resolveDataPath(filename: string): string {
  if (EAGLES_DATA_ROOT !== undefined && EAGLES_DATA_ROOT.length > 0) {
    return join(EAGLES_DATA_ROOT, filename);
  }
  return join(tmpdir(), filename);
}
