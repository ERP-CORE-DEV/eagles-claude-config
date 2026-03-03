import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { MemoryRepository } from "../src/MemoryRepository.js";

describe("MemoryRepository", () => {
  let repo: MemoryRepository;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "memory-repo-test-"));
    repo = new MemoryRepository(join(testDir, "test-memories.sqlite"));
  });

  afterEach(() => {
    repo.close();
  });

  describe("insert", () => {
    it("should insert a memory and return it with all fields", () => {
      const entry = repo.insert({
        text: "Always use strict mode",
        project: "eagles",
        tags: ["pattern"],
        confidence: 0.9,
        source: "manual",
      });

      expect(entry.id).toBeDefined();
      expect(entry.text).toBe("Always use strict mode");
      expect(entry.project).toBe("eagles");
      expect(entry.tags).toEqual(["pattern"]);
      expect(entry.confidence).toBe(0.9);
      expect(entry.source).toBe("manual");
      expect(entry.accessCount).toBe(0);
      expect(entry.expiresAt).toBeNull();
      expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should set expiresAt when ttlSeconds is provided", () => {
      const before = Date.now();
      const entry = repo.insert({
        text: "Ephemeral memory",
        project: "test",
        tags: [],
        confidence: 1,
        source: "auto",
        ttlSeconds: 3600,
      });

      expect(entry.expiresAt).not.toBeNull();
      const expiresMs = new Date(entry.expiresAt!).getTime();
      // Should expire roughly 1 hour from now
      expect(expiresMs).toBeGreaterThanOrEqual(before + 3500000);
      expect(expiresMs).toBeLessThanOrEqual(before + 3700000);
    });

    it("should leave expiresAt null when no ttlSeconds", () => {
      const entry = repo.insert({
        text: "Permanent memory",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      expect(entry.expiresAt).toBeNull();
    });
  });

  describe("getById", () => {
    it("should return null for non-existent id", () => {
      expect(repo.getById("nonexistent")).toBeNull();
    });

    it("should return the entry for existing id", () => {
      const inserted = repo.insert({
        text: "Test memory",
        project: "test",
        tags: ["lesson"],
        confidence: 0.8,
        source: "manual",
      });

      const found = repo.getById(inserted.id);
      expect(found).not.toBeNull();
      expect(found!.text).toBe("Test memory");
      expect(found!.expiresAt).toBeNull();
    });
  });

  describe("searchByKeyword", () => {
    it("should find entries matching keyword", () => {
      repo.insert({
        text: "SQLite WAL mode for concurrent access",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });
      repo.insert({
        text: "PostgreSQL for large datasets",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const results = repo.searchByKeyword("SQLite");
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain("SQLite");
    });

    it("should return empty array for no matches", () => {
      repo.insert({
        text: "Some text",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const results = repo.searchByKeyword("nonexistent-keyword");
      expect(results).toHaveLength(0);
    });

    it("should filter by project when specified", () => {
      repo.insert({
        text: "SQLite in project A",
        project: "project-a",
        tags: [],
        confidence: 1,
        source: "manual",
      });
      repo.insert({
        text: "SQLite in project B",
        project: "project-b",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const results = repo.searchByKeyword("SQLite", { project: "project-a" });
      expect(results).toHaveLength(1);
      expect(results[0].project).toBe("project-a");
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        repo.insert({
          text: `Memory about TypeScript ${i}`,
          project: "test",
          tags: [],
          confidence: 1,
          source: "manual",
        });
      }

      const results = repo.searchByKeyword("TypeScript", { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it("should exclude expired entries", () => {
      // Insert with a TTL that has already expired (1 second TTL)
      repo.insert({
        text: "Expired SQLite memory",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
        ttlSeconds: -1, // Negative = already expired
      });
      repo.insert({
        text: "Active SQLite memory",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const results = repo.searchByKeyword("SQLite");
      expect(results).toHaveLength(1);
      expect(results[0].text).toBe("Active SQLite memory");
    });
  });

  describe("cleanExpired", () => {
    it("should return 0 when no expired entries exist", () => {
      repo.insert({
        text: "Not expired",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const deleted = repo.cleanExpired();
      expect(deleted).toBe(0);
    });

    it("should delete expired entries and return count", () => {
      // Insert entry with negative TTL (already expired)
      repo.insert({
        text: "Already expired 1",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
        ttlSeconds: -10,
      });
      repo.insert({
        text: "Already expired 2",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
        ttlSeconds: -10,
      });
      repo.insert({
        text: "Still valid",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
        ttlSeconds: 3600,
      });

      const deleted = repo.cleanExpired();
      expect(deleted).toBe(2);

      // Verify the valid one remains
      expect(repo.count()).toBe(1);
    });

    it("should not delete entries without expiresAt", () => {
      repo.insert({
        text: "Permanent entry",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const deleted = repo.cleanExpired();
      expect(deleted).toBe(0);
      expect(repo.count()).toBe(1);
    });
  });

  describe("list", () => {
    it("should exclude expired entries from list results", () => {
      repo.insert({
        text: "Expired entry",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
        ttlSeconds: -10,
      });
      repo.insert({
        text: "Active entry",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      const entries = repo.list({});
      expect(entries).toHaveLength(1);
      expect(entries[0].text).toBe("Active entry");
    });
  });

  describe("updateAccess", () => {
    it("should increment access count", () => {
      const entry = repo.insert({
        text: "Accessed memory",
        project: "test",
        tags: [],
        confidence: 1,
        source: "manual",
      });

      repo.updateAccess(entry.id);
      repo.updateAccess(entry.id);

      const updated = repo.getById(entry.id);
      expect(updated!.accessCount).toBe(2);
    });
  });

  describe("getStats", () => {
    it("should return correct counts by project and tag", () => {
      repo.insert({
        text: "Memory 1",
        project: "proj-a",
        tags: ["pattern", "lesson"],
        confidence: 1,
        source: "manual",
      });
      repo.insert({
        text: "Memory 2",
        project: "proj-a",
        tags: ["bug"],
        confidence: 1,
        source: "manual",
      });
      repo.insert({
        text: "Memory 3",
        project: "proj-b",
        tags: ["pattern"],
        confidence: 1,
        source: "manual",
      });

      const stats = repo.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byProject["proj-a"]).toBe(2);
      expect(stats.byProject["proj-b"]).toBe(1);
      expect(stats.byTag["pattern"]).toBe(2);
      expect(stats.byTag["lesson"]).toBe(1);
      expect(stats.byTag["bug"]).toBe(1);
    });
  });
});
