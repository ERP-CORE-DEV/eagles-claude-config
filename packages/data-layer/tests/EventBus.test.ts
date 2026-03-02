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
});
