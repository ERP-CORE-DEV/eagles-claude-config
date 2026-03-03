import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DummyProjectInfo, WaveData } from "../runners/types.js";

const REQUIREMENTS = [
  "Create user CRUD endpoints (GET, POST, PUT, DELETE)",
  "Add input validation middleware",
  "Implement JWT authentication",
  "Add password hashing with bcrypt",
  "Write unit tests for user endpoints",
  "Write unit tests for auth endpoints",
  "Add rate limiting middleware",
  "Configure CORS headers",
] as const;

const PLANNED_FILES = [
  "src/server.ts",
  "src/routes/users.ts",
  "src/routes/auth.ts",
  "src/middleware/validate.ts",
  "src/utils/hash.ts",
  "tests/users.test.ts",
  "tests/auth.test.ts",
  "tests/validate.test.ts",
] as const;

function writeWave1Files(root: string): void {
  writeFileSync(
    join(root, "src/server.ts"),
    `import express from "express";
import { userRouter } from "./routes/users.js";

const app = express();
app.use(express.json());
app.use("/api/users", userRouter);

export default app;
`,
  );

  writeFileSync(
    join(root, "src/routes/users.ts"),
    `import { Router, type Request, type Response } from "express";

const userRouter = Router();
const users = new Map<string, { id: string; name: string; email: string }>();

userRouter.get("/", (_req: Request, res: Response) => {
  res.json(Array.from(users.values()));
});

userRouter.get("/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(user);
});

userRouter.post("/", (req: Request, res: Response) => {
  const { name, email } = req.body as { name: string; email: string };
  const id = crypto.randomUUID();
  const user = { id, name, email };
  users.set(id, user);
  return res.status(201).json(user);
});

userRouter.put("/:id", (req: Request, res: Response) => {
  const existing = users.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, email } = req.body as { name: string; email: string };
  const updated = { ...existing, name: name ?? existing.name, email: email ?? existing.email };
  users.set(req.params.id, updated);
  return res.json(updated);
});

userRouter.delete("/:id", (req: Request, res: Response) => {
  const deleted = users.delete(req.params.id);
  return res.status(deleted ? 204 : 404).end();
});

export { userRouter };
`,
  );

  writeFileSync(
    join(root, "tests/users.test.ts"),
    `import { describe, it, expect } from "vitest";

describe("User CRUD", () => {
  it("GET /api/users returns empty array", () => { expect([]).toEqual([]); });
  it("POST /api/users creates user", () => { expect(true).toBe(true); });
  it("GET /api/users/:id returns user", () => { expect(true).toBe(true); });
  it("PUT /api/users/:id updates user", () => { expect(true).toBe(true); });
  it("DELETE /api/users/:id removes user", () => { expect(true).toBe(true); });
  it("GET /api/users/:id returns 404 for missing", () => { expect(true).toBe(true); });
  it("DELETE /api/users/:id returns 404 for missing", () => { expect(true).toBe(true); });
  it("POST /api/users validates required fields", () => { expect(true).toBe(true); });
});
`,
  );
}

function writeWave2Files(root: string): void {
  // Overwrite server.ts to add auth routes
  writeFileSync(
    join(root, "src/server.ts"),
    `import express from "express";
import { userRouter } from "./routes/users.js";
import { authRouter } from "./routes/auth.js";
import { validateMiddleware } from "./middleware/validate.js";

const app = express();
app.use(express.json());
app.use(validateMiddleware);
app.use("/api/users", userRouter);
app.use("/api/auth", authRouter);

export default app;
`,
  );

  writeFileSync(
    join(root, "src/routes/auth.ts"),
    `import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";

const authRouter = Router();
const JWT_SECRET = process.env["JWT_SECRET"] ?? "dev-secret";

authRouter.post("/login", (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: "Missing credentials" });
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1h" });
  return res.json({ token });
});

authRouter.post("/register", (req: Request, res: Response) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });
  return res.status(201).json({ message: "User registered" });
});

authRouter.post("/refresh", (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    const newToken = jwt.sign({ email: decoded.email }, JWT_SECRET, { expiresIn: "1h" });
    return res.json({ token: newToken });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

export { authRouter };
`,
  );

  writeFileSync(
    join(root, "src/middleware/validate.ts"),
    `import type { Request, Response, NextFunction } from "express";

export function validateMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "POST" || req.method === "PUT") {
    const contentType = req.headers["content-type"];
    if (!contentType?.includes("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json" });
      return;
    }
  }
  next();
}
`,
  );

  writeFileSync(
    join(root, "tests/auth.test.ts"),
    `import { describe, it, expect } from "vitest";

describe("Auth endpoints", () => {
  it("POST /api/auth/login returns JWT token", () => { expect(true).toBe(true); });
  it("POST /api/auth/login rejects missing credentials", () => { expect(true).toBe(true); });
  it("POST /api/auth/register creates user", () => { expect(true).toBe(true); });
  it("POST /api/auth/register validates fields", () => { expect(true).toBe(true); });
  it("POST /api/auth/refresh returns new token", () => { expect(true).toBe(true); });
  it("POST /api/auth/refresh rejects invalid token", () => { expect(true).toBe(true); });
  it("Auth middleware rejects unauthenticated requests", () => { expect(true).toBe(true); });
});
`,
  );

  // Unplanned scope creep file
  writeFileSync(
    join(root, "src/middleware/logger.ts"),
    `import type { Request, Response, NextFunction } from "express";

export function loggerMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  process.stdout.write(\`[\${timestamp}] \${req.method} \${req.path}\\n\`);
  next();
}
`,
  );
}

function writeWave3Files(root: string): void {
  writeFileSync(
    join(root, "src/utils/hash.ts"),
    `import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
`,
  );

  writeFileSync(
    join(root, "tests/validate.test.ts"),
    `import { describe, it, expect } from "vitest";

describe("Validation middleware", () => {
  it("rejects non-JSON POST requests", () => { expect(true).toBe(true); });
  it("allows JSON POST requests", () => { expect(true).toBe(true); });
  it("allows GET requests without content-type", () => { expect(true).toBe(true); });
  it("validates email format", () => { expect(true).toBe(true); });
  it("REGRESSION: rejects empty body on PUT", () => { expect(false).toBe(true); });
});
`,
  );
}

export function createDummyProject(): DummyProjectInfo {
  const rootDir = mkdtempSync(join(tmpdir(), "eagles-bench-"));

  mkdirSync(join(rootDir, "src/routes"), { recursive: true });
  mkdirSync(join(rootDir, "src/middleware"), { recursive: true });
  mkdirSync(join(rootDir, "src/utils"), { recursive: true });
  mkdirSync(join(rootDir, "tests"), { recursive: true });

  writeFileSync(
    join(rootDir, "package.json"),
    JSON.stringify(
      { name: "benchmark-project", version: "1.0.0", type: "module" },
      null,
      2,
    ),
  );

  writeFileSync(
    join(rootDir, "REQUIREMENTS.md"),
    REQUIREMENTS.map((r) => `- [ ] ${r}`).join("\n") + "\n",
  );

  const waves: WaveData[] = [];

  // Wave 1: User CRUD
  writeWave1Files(rootDir);
  waves.push({
    waveNumber: 1,
    filesCreated: ["src/server.ts", "src/routes/users.ts", "tests/users.test.ts"],
    filesModified: [],
    testsTotal: 8,
    testsPassing: 8,
    testsFailing: 0,
    requirementsAddressed: [
      "Create user CRUD endpoints (GET, POST, PUT, DELETE)",
      "Write unit tests for user endpoints",
    ],
    linesAdded: 120,
    unplannedFiles: [],
  });

  // Wave 2: Auth + Validation + scope creep
  writeWave2Files(rootDir);
  waves.push({
    waveNumber: 2,
    filesCreated: [
      "src/routes/auth.ts",
      "src/middleware/validate.ts",
      "tests/auth.test.ts",
      "src/middleware/logger.ts",
    ],
    filesModified: ["src/server.ts"],
    testsTotal: 15,
    testsPassing: 15,
    testsFailing: 0,
    requirementsAddressed: [
      "Implement JWT authentication",
      "Add input validation middleware",
      "Write unit tests for auth endpoints",
    ],
    linesAdded: 180,
    unplannedFiles: ["src/middleware/logger.ts"],
  });

  // Wave 3: Security + regression + missing requirements
  writeWave3Files(rootDir);
  waves.push({
    waveNumber: 3,
    filesCreated: ["src/utils/hash.ts", "tests/validate.test.ts"],
    filesModified: [],
    testsTotal: 20,
    testsPassing: 19,
    testsFailing: 1,
    requirementsAddressed: ["Add password hashing with bcrypt"],
    linesAdded: 90,
    unplannedFiles: [],
  });

  return {
    rootDir,
    requirements: [...REQUIREMENTS],
    plannedFiles: [...PLANNED_FILES],
    waves,
  };
}
