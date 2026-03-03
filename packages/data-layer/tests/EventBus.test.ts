import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { EventBus } from "../src/EventBus.js";

describe("EventBus", () => {
  let bus: EventBus;
  let busPath: string;

  beforeEach(() => {
    const testDir = mkdtempSync(join(tmpdir(), "eventbus-test-"));
    busPath = join(testDir, "test-bus.sqlite");
    bus = new EventBus(busPath);
  });

  afterEach(() => {
    bus.close();
  });

  it("should create SQLite database on init", () => {
    expect(existsSync(busPath)).toBe(true);
  });

  it("should publish and consume events", () => {
    const eventId = bus.publish("token.recorded", { cost: 0.05 });
    expect(typeof eventId).toBe("string");
    expect(eventId.length).toBeGreaterThan(0);

    const events = bus.consume<{ cost: number }>("token.recorded", null);
    expect(events).toHaveLength(1);
    expect(events[0].topic).toBe("token.recorded");
    expect(events[0].payload.cost).toBe(0.05);
    expect(events[0].id).toBe(eventId);
  });

  it("should consume events after a specific ID", () => {
    const id1 = bus.publish("token.recorded", { seq: 1 });
    bus.publish("token.recorded", { seq: 2 });
    bus.publish("token.recorded", { seq: 3 });

    const events = bus.consume<{ seq: number }>("token.recorded", id1);
    expect(events).toHaveLength(2);
    expect(events[0].payload.seq).toBe(2);
    expect(events[1].payload.seq).toBe(3);
  });

  it("should filter by topic", () => {
    bus.publish("token.recorded", { type: "token" });
    bus.publish("drift.detected", { type: "drift" });
    bus.publish("token.recorded", { type: "token2" });

    const tokenEvents = bus.consume("token.recorded", null);
    expect(tokenEvents).toHaveLength(2);

    const driftEvents = bus.consume("drift.detected", null);
    expect(driftEvents).toHaveLength(1);
  });

  it("should respect limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      bus.publish("token.recorded", { i });
    }

    const events = bus.consume("token.recorded", null, 3);
    expect(events).toHaveLength(3);
  });

  it("should return empty array for unknown topic", () => {
    const events = bus.consume("budget.alert", null);
    expect(events).toHaveLength(0);
  });

  it("should set publishedAt to ISO string", () => {
    bus.publish("token.recorded", {});
    const events = bus.consume("token.recorded", null);
    expect(events[0].publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  describe("waitFor", () => {
    it("should resolve when event is published before timeout", async () => {
      bus.publish("drift.detected", { score: 0.42 });
      const event = await bus.waitFor<{ score: number }>("drift.detected", 1000);
      expect(event.payload.score).toBe(0.42);
    });

    it("should throw on timeout when no event", async () => {
      await expect(
        bus.waitFor("budget.alert", 100, 20),
      ).rejects.toThrow("Timeout waiting for event on topic: budget.alert");
    });
  });

  describe("consumeFiltered", () => {
    it("should filter events by predicate", () => {
      bus.publish("token.recorded", { cost: 0.01 });
      bus.publish("token.recorded", { cost: 0.50 });
      bus.publish("token.recorded", { cost: 0.02 });
      bus.publish("token.recorded", { cost: 1.00 });

      const expensive = bus.consumeFiltered<{ cost: number }>(
        "token.recorded",
        null,
        (p) => p.cost > 0.1,
      );
      expect(expensive).toHaveLength(2);
      expect(expensive[0].payload.cost).toBe(0.50);
      expect(expensive[1].payload.cost).toBe(1.00);
    });

    it("should respect limit after filtering", () => {
      for (let i = 0; i < 10; i++) {
        bus.publish("token.recorded", { i, even: i % 2 === 0 });
      }
      const result = bus.consumeFiltered<{ i: number; even: boolean }>(
        "token.recorded",
        null,
        (p) => p.even,
        3,
      );
      expect(result).toHaveLength(3);
      expect(result.every((e) => e.payload.even)).toBe(true);
    });
  });

  describe("cleanOlderThan", () => {
    it("should not delete recent events", () => {
      bus.publish("token.recorded", { recent: true });
      const deleted = bus.cleanOlderThan(1);
      expect(deleted).toBe(0);

      const events = bus.consume("token.recorded", null);
      expect(events).toHaveLength(1);
    });

    it("should delete all events when cutoff is in the future", () => {
      bus.publish("token.recorded", { a: 1 });
      bus.publish("token.recorded", { a: 2 });

      const deleted = bus.cleanOlderThan(-1);
      expect(deleted).toBe(2);

      const events = bus.consume("token.recorded", null);
      expect(events).toHaveLength(0);
    });
  });

  describe("maxEvents", () => {
    it("should enforce max events cap when triggered manually", () => {
      const testDir = mkdtempSync(join(tmpdir(), "eventbus-max-test-"));
      const cappedBus = new EventBus(join(testDir, "capped-bus.sqlite"), 5);

      for (let i = 0; i < 10; i++) {
        cappedBus.publish("token.recorded", { i });
      }

      // Manually trigger enforcement since lazy cleanup fires every 100 publishes
      cappedBus.enforceMaxEvents();

      const events = cappedBus.consume("token.recorded", null, 100);
      expect(events).toHaveLength(5);
      // Should keep the most recent events (highest indices)
      expect(events[0].payload).toEqual({ i: 5 });
      expect(events[4].payload).toEqual({ i: 9 });

      cappedBus.close();
    });

    it("should not enforce when maxEvents is not set", () => {
      // Default bus (no maxEvents) should keep all events
      for (let i = 0; i < 10; i++) {
        bus.publish("token.recorded", { i });
      }

      const events = bus.consume("token.recorded", null, 100);
      expect(events).toHaveLength(10);
    });
  });
});
