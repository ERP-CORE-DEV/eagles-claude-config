import { describe, it, expect } from "vitest";
import { buildAdjacencyList, detectCycles, getTopologicalOrder } from "../src/graph.js";
import type { GraphNode } from "../src/graph.js";

describe("buildAdjacencyList", () => {
  it("should build adjacency list from nodes", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["B", "C"] },
      { name: "B", dependencies: ["C"] },
      { name: "C", dependencies: [] },
    ];

    const adj = buildAdjacencyList(nodes);

    expect([...adj.get("A")!]).toEqual(["B", "C"]);
    expect([...adj.get("B")!]).toEqual(["C"]);
    expect([...adj.get("C")!]).toEqual([]);
  });

  it("should include dependency-only nodes with empty adjacency", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["X"] },
    ];

    const adj = buildAdjacencyList(nodes);

    expect(adj.has("X")).toBe(true);
    expect([...adj.get("X")!]).toEqual([]);
  });
});

describe("detectCycles", () => {
  it("should detect no cycle in a DAG", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["B"] },
      { name: "B", dependencies: ["C"] },
      { name: "C", dependencies: [] },
    ];

    const result = detectCycles(nodes);

    expect(result.hasCycle).toBe(false);
    expect(result.cycle).toEqual([]);
  });

  it("should detect a direct cycle", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["B"] },
      { name: "B", dependencies: ["A"] },
    ];

    const result = detectCycles(nodes);

    expect(result.hasCycle).toBe(true);
    expect(result.cycle.length).toBeGreaterThanOrEqual(2);
  });

  it("should detect an indirect cycle", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["B"] },
      { name: "B", dependencies: ["C"] },
      { name: "C", dependencies: ["A"] },
    ];

    const result = detectCycles(nodes);

    expect(result.hasCycle).toBe(true);
  });

  it("should handle self-referencing node", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["A"] },
    ];

    const result = detectCycles(nodes);

    expect(result.hasCycle).toBe(true);
  });

  it("should handle disconnected graph without cycles", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: [] },
      { name: "B", dependencies: [] },
      { name: "C", dependencies: [] },
    ];

    const result = detectCycles(nodes);

    expect(result.hasCycle).toBe(false);
  });

  it("should handle empty graph", () => {
    const result = detectCycles([]);
    expect(result.hasCycle).toBe(false);
  });
});

describe("getTopologicalOrder", () => {
  it("should return correct topological order for a DAG", () => {
    const nodes: GraphNode[] = [
      { name: "deploy", dependencies: ["build", "test"] },
      { name: "test", dependencies: ["build"] },
      { name: "build", dependencies: [] },
    ];

    const order = getTopologicalOrder(nodes);

    expect(order.indexOf("build")).toBeLessThan(order.indexOf("test"));
    expect(order.indexOf("test")).toBeLessThan(order.indexOf("deploy"));
    expect(order).toHaveLength(3);
  });

  it("should throw when graph has a cycle", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["B"] },
      { name: "B", dependencies: ["A"] },
    ];

    expect(() => getTopologicalOrder(nodes)).toThrow(/cycle/i);
  });

  it("should handle graph with multiple roots", () => {
    const nodes: GraphNode[] = [
      { name: "X", dependencies: [] },
      { name: "Y", dependencies: [] },
      { name: "Z", dependencies: ["X", "Y"] },
    ];

    const order = getTopologicalOrder(nodes);

    expect(order.indexOf("X")).toBeLessThan(order.indexOf("Z"));
    expect(order.indexOf("Y")).toBeLessThan(order.indexOf("Z"));
    expect(order).toHaveLength(3);
  });

  it("should return single node for singleton graph", () => {
    const order = getTopologicalOrder([{ name: "solo", dependencies: [] }]);
    expect(order).toEqual(["solo"]);
  });

  it("should handle dependency-only nodes", () => {
    const nodes: GraphNode[] = [
      { name: "A", dependencies: ["B"] },
    ];

    const order = getTopologicalOrder(nodes);

    expect(order.indexOf("B")).toBeLessThan(order.indexOf("A"));
    expect(order).toHaveLength(2);
  });
});
