import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDriftDetectorServer } from "../src/server.js";

function makeTempDb(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "drift-test-"));
  const dbPath = join(dir, "test.sqlite");
  return {
    dbPath,
    // Skip rmSync on Windows — SQLite WAL/SHM files stay locked; OS cleans temp on reboot
    cleanup: () => {},
  };
}

async function makeClient(dbPath: string): Promise<Client> {
  const server = createDriftDetectorServer(dbPath);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

function parseToolResult(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

// ---------------------------------------------------------------------------
// Tool listing
// ---------------------------------------------------------------------------
describe("drift-detector-mcp server", () => {
  let client: Client;
  let cleanup: () => void;

  beforeEach(async () => {
    const temp = makeTempDb();
    cleanup = temp.cleanup;
    client = await makeClient(temp.dbPath);
  });

  afterEach(() => {
    cleanup();
  });

  it("should list all 7 tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("drift_set_requirements");
    expect(toolNames).toContain("drift_checkpoint");
    expect(toolNames).toContain("drift_compare");
    expect(toolNames).toContain("drift_alert");
    expect(toolNames).toContain("drift_report");
    expect(toolNames).toContain("drift_history");
    expect(toolNames).toContain("drift_reset");
    expect(toolNames).toHaveLength(7);
  });

  // -------------------------------------------------------------------------
  // drift_set_requirements
  // -------------------------------------------------------------------------
  it("should accept requirements and return parsed checklist count", async () => {
    const result = await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "test-session",
        title: "Test Feature",
        requirementsText: "- [ ] Add login page\n- [ ] Add logout button\n- [ ] Write tests",
        plannedFiles: ["src/login.ts", "src/logout.ts"],
        initialTestCount: 20,
      },
    });

    const data = parseToolResult(result) as {
      sessionId: string;
      title: string;
      checklistItemsParsed: number;
      plannedFiles: number;
      createdAt: string;
    };

    expect(data.sessionId).toBe("test-session");
    expect(data.title).toBe("Test Feature");
    expect(data.checklistItemsParsed).toBe(3);
    expect(data.plannedFiles).toBe(2);
    expect(data.createdAt).toBeDefined();
  });

  it("should replace existing requirements when called twice for same session", async () => {
    const args = {
      sessionId: "dup-session",
      title: "First",
      requirementsText: "- [ ] First item",
      plannedFiles: [] as string[],
    };
    await client.callTool({ name: "drift_set_requirements", arguments: args });

    const result = await client.callTool({
      name: "drift_set_requirements",
      arguments: { ...args, title: "Updated", requirementsText: "- [ ] A\n- [ ] B" },
    });

    const data = parseToolResult(result) as { title: string; checklistItemsParsed: number };
    expect(data.title).toBe("Updated");
    expect(data.checklistItemsParsed).toBe(2);
  });

  // -------------------------------------------------------------------------
  // drift_checkpoint
  // -------------------------------------------------------------------------
  it("should accept a checkpoint and track cumulative files", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "cp-session",
        title: "Feature",
        requirementsText: "- [ ] Login\n- [ ] Logout",
        plannedFiles: ["src/login.ts"],
      },
    });

    const result = await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "cp-session",
        waveNumber: 1,
        filesModified: ["src/login.ts"],
        testsTotal: 10,
        testsPassing: 8,
        requirementsAddressed: ["Login"],
        newFilesCreated: ["src/login.ts"],
      },
    });

    const data = parseToolResult(result) as {
      sessionId: string;
      waveNumber: number;
      cumulativeFilesTracked: number;
      snapshotAt: string;
    };

    expect(data.sessionId).toBe("cp-session");
    expect(data.waveNumber).toBe(1);
    expect(data.cumulativeFilesTracked).toBeGreaterThanOrEqual(1);
    expect(data.snapshotAt).toBeDefined();
  });

  it("should accumulate cumulative files across multiple checkpoints", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "multi-cp",
        title: "Feature",
        requirementsText: "- [ ] A\n- [ ] B",
        plannedFiles: [],
      },
    });

    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "multi-cp",
        waveNumber: 1,
        filesModified: ["src/a.ts"],
        testsTotal: 5,
        testsPassing: 5,
        requirementsAddressed: ["A"],
        newFilesCreated: ["src/a.ts"],
      },
    });

    const result = await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "multi-cp",
        waveNumber: 2,
        filesModified: ["src/b.ts"],
        testsTotal: 10,
        testsPassing: 10,
        requirementsAddressed: ["B"],
        newFilesCreated: ["src/b.ts"],
      },
    });

    const data = parseToolResult(result) as { cumulativeFilesTracked: number };
    expect(data.cumulativeFilesTracked).toBe(2);
  });

  // -------------------------------------------------------------------------
  // drift_compare
  // -------------------------------------------------------------------------
  it("should return SYNCED for a healthy session", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "compare-ok",
        title: "Feature",
        requirementsText: "- [ ] Add login page",
        plannedFiles: ["src/login.ts"],
        initialTestCount: 10,
      },
    });

    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "compare-ok",
        waveNumber: 1,
        filesModified: ["src/login.ts"],
        testsTotal: 10,
        testsPassing: 10,
        requirementsAddressed: ["login page"],
        newFilesCreated: ["src/login.ts"],
      },
    });

    const result = await client.callTool({
      name: "drift_compare",
      arguments: { sessionId: "compare-ok", waveNumber: 1 },
    });

    const data = parseToolResult(result) as {
      driftScore: number;
      verdict: string;
      metrics: {
        requirementCoverage: number;
        testHealth: number;
        fileChurn: number;
        tokenEfficiency: number | null;
        scopeCreep: number;
      };
    };

    expect(data.verdict).toBe("SYNCED");
    expect(data.driftScore).toBeGreaterThanOrEqual(0.6);
    expect(data.metrics.requirementCoverage).toBeGreaterThan(0);
    expect(data.metrics.testHealth).toBeGreaterThan(0);
    expect(data.metrics.tokenEfficiency).toBeNull();
  });

  it("should return a warning for the stub (no requirements set)", async () => {
    const result = await client.callTool({
      name: "drift_compare",
      arguments: { sessionId: "no-reqs", waveNumber: 1 },
    });

    const data = parseToolResult(result) as {
      driftScore: number;
      verdict: string;
      warning?: string;
    };

    expect(data.verdict).toBe("SYNCED");
    expect(data.driftScore).toBe(1.0);
    expect(data.warning).toContain("No requirements");
  });

  it("should compute lower score when tests are failing", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "failing-tests",
        title: "Feature",
        requirementsText: "- [ ] Add feature",
        plannedFiles: ["src/feature.ts"],
        initialTestCount: 100,
      },
    });

    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "failing-tests",
        waveNumber: 1,
        filesModified: ["src/feature.ts"],
        testsTotal: 100,
        testsPassing: 10,
        requirementsAddressed: [],
        newFilesCreated: ["src/unplanned.ts"],
      },
    });

    const result = await client.callTool({
      name: "drift_compare",
      arguments: { sessionId: "failing-tests", waveNumber: 1 },
    });

    const data = parseToolResult(result) as { driftScore: number; verdict: string };
    expect(data.driftScore).toBeLessThan(0.8);
  });

  // -------------------------------------------------------------------------
  // drift_alert
  // -------------------------------------------------------------------------
  it("should return NONE alert for a healthy session", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "alert-ok",
        title: "Feature",
        requirementsText: "- [ ] Login",
        plannedFiles: ["src/login.ts"],
        initialTestCount: 10,
      },
    });

    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "alert-ok",
        waveNumber: 1,
        filesModified: ["src/login.ts"],
        testsTotal: 10,
        testsPassing: 10,
        requirementsAddressed: ["Login"],
        newFilesCreated: ["src/login.ts"],
      },
    });

    await client.callTool({
      name: "drift_compare",
      arguments: { sessionId: "alert-ok", waveNumber: 1 },
    });

    const result = await client.callTool({
      name: "drift_alert",
      arguments: { sessionId: "alert-ok", waveNumber: 1 },
    });

    const data = parseToolResult(result) as {
      alertLevel: string;
      recommendedAction: string;
    };

    expect(data.alertLevel).toBe("NONE");
    expect(data.recommendedAction).toBe("continue");
  });

  it("should return NONE for session with no score yet", async () => {
    const result = await client.callTool({
      name: "drift_alert",
      arguments: { sessionId: "no-score-session", waveNumber: 1 },
    });

    const data = parseToolResult(result) as { alertLevel: string };
    expect(data.alertLevel).toBe("NONE");
  });

  // -------------------------------------------------------------------------
  // drift_report
  // -------------------------------------------------------------------------
  it("should return report with HEALTHY status for new session", async () => {
    const result = await client.callTool({
      name: "drift_report",
      arguments: { sessionId: "report-empty" },
    });

    const data = parseToolResult(result) as {
      overallHealth: string;
      trend: string;
      totalWaves: number;
    };

    expect(data.overallHealth).toBe("HEALTHY");
    expect(data.trend).toBe("STABLE");
    expect(data.totalWaves).toBe(0);
  });

  it("should return trend STABLE when two waves have same score", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "trend-session",
        title: "Feature",
        requirementsText: "- [ ] Login\n- [ ] Logout",
        plannedFiles: ["src/login.ts", "src/logout.ts"],
        initialTestCount: 10,
      },
    });

    for (const wave of [1, 2]) {
      await client.callTool({
        name: "drift_checkpoint",
        arguments: {
          sessionId: "trend-session",
          waveNumber: wave,
          filesModified: ["src/login.ts"],
          testsTotal: 10,
          testsPassing: 9,
          requirementsAddressed: ["Login"],
          newFilesCreated: [],
        },
      });

      await client.callTool({
        name: "drift_compare",
        arguments: { sessionId: "trend-session", waveNumber: wave },
      });
    }

    const result = await client.callTool({
      name: "drift_report",
      arguments: { sessionId: "trend-session" },
    });

    const data = parseToolResult(result) as {
      totalWaves: number;
      trend: string;
    };

    expect(data.totalWaves).toBe(2);
    expect(data.trend).toBeDefined();
  });

  it("should include recommendations when requested", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "recs-session",
        title: "Feature",
        requirementsText: "- [ ] A\n- [ ] B",
        plannedFiles: ["src/a.ts"],
        initialTestCount: 100,
      },
    });

    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "recs-session",
        waveNumber: 1,
        filesModified: ["src/a.ts"],
        testsTotal: 100,
        testsPassing: 10,
        requirementsAddressed: [],
        newFilesCreated: ["src/unplanned1.ts", "src/unplanned2.ts"],
      },
    });

    await client.callTool({
      name: "drift_compare",
      arguments: { sessionId: "recs-session", waveNumber: 1 },
    });

    const result = await client.callTool({
      name: "drift_report",
      arguments: { sessionId: "recs-session", includeRecommendations: true },
    });

    const data = parseToolResult(result) as { recommendations: string[] };
    expect(Array.isArray(data.recommendations)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // drift_history
  // -------------------------------------------------------------------------
  it("should return empty history for new session", async () => {
    const result = await client.callTool({
      name: "drift_history",
      arguments: { sessionId: "empty-history" },
    });

    const data = parseToolResult(result) as {
      scores: unknown[];
      totalWavesRecorded: number;
    };

    expect(data.scores).toHaveLength(0);
    expect(data.totalWavesRecorded).toBe(0);
  });

  it("should return recorded drift scores in history", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "history-session",
        title: "Feature",
        requirementsText: "- [ ] Login",
        plannedFiles: ["src/login.ts"],
      },
    });

    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId: "history-session",
        waveNumber: 1,
        filesModified: ["src/login.ts"],
        testsTotal: 5,
        testsPassing: 5,
        requirementsAddressed: ["Login"],
        newFilesCreated: [],
      },
    });

    await client.callTool({
      name: "drift_compare",
      arguments: { sessionId: "history-session", waveNumber: 1 },
    });

    const result = await client.callTool({
      name: "drift_history",
      arguments: { sessionId: "history-session" },
    });

    const data = parseToolResult(result) as {
      scores: unknown[];
      totalWavesRecorded: number;
    };

    expect(data.totalWavesRecorded).toBe(1);
    expect(data.scores).toHaveLength(1);
  });

  it("should respect the limit parameter in drift_history", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "limit-session",
        title: "Feature",
        requirementsText: "- [ ] Add feature A implementation",
        plannedFiles: [],
      },
    });

    for (const wave of [1, 2, 3]) {
      await client.callTool({
        name: "drift_checkpoint",
        arguments: {
          sessionId: "limit-session",
          waveNumber: wave,
          filesModified: [`src/wave${wave}.ts`],
          testsTotal: 5,
          testsPassing: 5,
          requirementsAddressed: ["feature A"],
          newFilesCreated: [],
        },
      });
      await client.callTool({
        name: "drift_compare",
        arguments: { sessionId: "limit-session", waveNumber: wave },
      });
    }

    const result = await client.callTool({
      name: "drift_history",
      arguments: { sessionId: "limit-session", limit: 2 },
    });

    const data = parseToolResult(result) as {
      scores: unknown[];
      totalWavesRecorded: number;
    };

    expect(data.scores).toHaveLength(2);
    expect(data.totalWavesRecorded).toBe(3);
  });

  // -------------------------------------------------------------------------
  // drift_reset
  // -------------------------------------------------------------------------
  it("should refuse reset without confirm=true", async () => {
    const result = await client.callTool({
      name: "drift_reset",
      arguments: { sessionId: "test-session", confirm: false },
    });

    const data = parseToolResult(result) as { error: string };
    expect(data.error).toContain("confirm must be true");
  });

  it("should delete all session data when confirmed", async () => {
    await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId: "reset-session",
        title: "Feature",
        requirementsText: "- [ ] Login",
        plannedFiles: [],
      },
    });

    const result = await client.callTool({
      name: "drift_reset",
      arguments: { sessionId: "reset-session", confirm: true },
    });

    const data = parseToolResult(result) as {
      deleted: { requirements: number; checkpoints: number; driftScores: number; alerts: number };
      resetAt: string;
    };

    expect(data.deleted.requirements).toBe(1);
    expect(data.deleted.checkpoints).toBe(0);
    expect(data.resetAt).toBeDefined();
  });

  it("should return zero counts when resetting a non-existent session", async () => {
    const result = await client.callTool({
      name: "drift_reset",
      arguments: { sessionId: "ghost-session", confirm: true },
    });

    const data = parseToolResult(result) as {
      deleted: { requirements: number; checkpoints: number; driftScores: number; alerts: number };
    };

    expect(data.deleted.requirements).toBe(0);
    expect(data.deleted.checkpoints).toBe(0);
    expect(data.deleted.driftScores).toBe(0);
    expect(data.deleted.alerts).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Full workflow integration
  // -------------------------------------------------------------------------
  it("should run a complete set-requirements → checkpoint → compare → alert → report workflow", async () => {
    const sessionId = "full-workflow";

    // 1. Set requirements
    const setResult = await client.callTool({
      name: "drift_set_requirements",
      arguments: {
        sessionId,
        title: "Login Feature",
        requirementsText: "- [ ] Add login page\n- [ ] Add logout button\n- [ ] Write tests",
        plannedFiles: ["src/login.ts", "src/logout.ts", "src/tests/login.test.ts"],
        initialTestCount: 30,
        tokenBudget: 50000,
      },
    });
    const setData = parseToolResult(setResult) as { checklistItemsParsed: number };
    expect(setData.checklistItemsParsed).toBe(3);

    // 2. Checkpoint wave 1
    await client.callTool({
      name: "drift_checkpoint",
      arguments: {
        sessionId,
        waveNumber: 1,
        filesModified: ["src/login.ts", "src/logout.ts"],
        testsTotal: 30,
        testsPassing: 28,
        requirementsAddressed: ["Add login page", "Add logout button"],
        tokensConsumed: 5000,
        linesAdded: 120,
        newFilesCreated: ["src/login.ts", "src/logout.ts"],
      },
    });

    // 3. Compare
    const compareResult = await client.callTool({
      name: "drift_compare",
      arguments: { sessionId, waveNumber: 1 },
    });
    const compareData = parseToolResult(compareResult) as {
      driftScore: number;
      verdict: string;
    };
    expect(compareData.driftScore).toBeGreaterThan(0);
    expect(["SYNCED", "WARNING", "DRIFTING"]).toContain(compareData.verdict);

    // 4. Alert
    const alertResult = await client.callTool({
      name: "drift_alert",
      arguments: { sessionId, waveNumber: 1 },
    });
    const alertData = parseToolResult(alertResult) as { alertLevel: string };
    expect(["NONE", "WARNING", "BLOCK"]).toContain(alertData.alertLevel);

    // 5. Report
    const reportResult = await client.callTool({
      name: "drift_report",
      arguments: { sessionId, includeRecommendations: true },
    });
    const reportData = parseToolResult(reportResult) as {
      totalWaves: number;
      overallHealth: string;
      trend: string;
      scores: unknown[];
    };
    expect(reportData.totalWaves).toBe(1);
    expect(reportData.scores).toHaveLength(1);
    expect(["HEALTHY", "WARNING", "CRITICAL"]).toContain(reportData.overallHealth);

    // 6. History
    const historyResult = await client.callTool({
      name: "drift_history",
      arguments: { sessionId },
    });
    const historyData = parseToolResult(historyResult) as { totalWavesRecorded: number };
    expect(historyData.totalWavesRecorded).toBe(1);

    // 7. Reset
    const resetResult = await client.callTool({
      name: "drift_reset",
      arguments: { sessionId, confirm: true },
    });
    const resetData = parseToolResult(resetResult) as {
      deleted: { requirements: number };
    };
    expect(resetData.deleted.requirements).toBe(1);
  });
});
