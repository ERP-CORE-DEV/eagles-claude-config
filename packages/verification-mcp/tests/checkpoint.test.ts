import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VerificationStore } from "../src/store/VerificationStore.js";
import { CheckpointManager } from "../src/checkpoints/checkpoint-manager.js";

function makeTempStore(): { store: VerificationStore; manager: CheckpointManager; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "verify-cp-test-"));
  const dbPath = join(dir, "test.sqlite");
  const store = new VerificationStore(dbPath);
  const manager = new CheckpointManager(store);
  return {
    store,
    manager,
    // Skip rmSync on Windows — SQLite WAL/SHM files stay locked; OS cleans temp on reboot
    cleanup: () => {},
  };
}

describe("CheckpointManager", () => {
  let manager: CheckpointManager;
  let cleanup: () => void;

  beforeEach(() => {
    const temp = makeTempStore();
    manager = temp.manager;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("create_andRestore_roundtripsCheckpointData", () => {
    const checkpoint = manager.create({
      sessionId: "session-1",
      name: "wave-1",
      stateJson: '{"step": 1}',
      agentScore: 0.9,
    });

    const restored = manager.restore(checkpoint.checkpointId);

    expect(restored).not.toBeNull();
    expect(restored?.checkpointId).toBe(checkpoint.checkpointId);
    expect(restored?.sessionId).toBe("session-1");
    expect(restored?.name).toBe("wave-1");
    expect(restored?.stateJson).toBe('{"step": 1}');
    expect(restored?.agentScore).toBe(0.9);
    expect(restored?.verified).toBe(false);
  });

  it("listForSession_returnsChronologicalOrder", () => {
    manager.create({ sessionId: "session-list", name: "first", stateJson: "{}" });
    manager.create({ sessionId: "session-list", name: "second", stateJson: "{}" });
    manager.create({ sessionId: "session-list", name: "third", stateJson: "{}" });

    const list = manager.listForSession("session-list");

    expect(list).toHaveLength(3);
    expect(list[0].name).toBe("first");
    expect(list[1].name).toBe("second");
    expect(list[2].name).toBe("third");
  });

  it("getLastGood_returnsMostRecentVerifiedCheckpoint", () => {
    const first = manager.create({ sessionId: "session-good", name: "first", stateJson: "{}" });
    const second = manager.create({ sessionId: "session-good", name: "second", stateJson: "{}" });

    manager.verify(first.checkpointId);
    manager.verify(second.checkpointId);

    const lastGood = manager.getLastGood("session-good");

    expect(lastGood).not.toBeNull();
    expect(lastGood?.checkpointId).toBe(second.checkpointId);
  });

  it("getLastGood_returnsNullWhenNoneVerified", () => {
    manager.create({ sessionId: "session-unverified", name: "first", stateJson: "{}" });

    const lastGood = manager.getLastGood("session-unverified");

    expect(lastGood).toBeNull();
  });

  it("verify_marksCheckpointAsVerified", () => {
    const checkpoint = manager.create({
      sessionId: "session-verify",
      name: "to-verify",
      stateJson: "{}",
    });

    expect(checkpoint.verified).toBe(false);

    manager.verify(checkpoint.checkpointId);

    const restored = manager.restore(checkpoint.checkpointId);
    expect(restored?.verified).toBe(true);
  });

  it("restore_returnsNullForUnknownCheckpointId", () => {
    const result = manager.restore("non-existent-checkpoint-id");
    expect(result).toBeNull();
  });
});
