/**
 * Dependency graph for skill/tool ordering.
 * Supports cycle detection via DFS and topological sort.
 */

export interface GraphNode {
  readonly name: string;
  readonly dependencies: readonly string[];
}

export interface CycleResult {
  readonly hasCycle: boolean;
  readonly cycle: readonly string[];
}

export function buildAdjacencyList(
  nodes: readonly GraphNode[],
): ReadonlyMap<string, readonly string[]> {
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    if (!adjacency.has(node.name)) {
      adjacency.set(node.name, []);
    }
    for (const dep of node.dependencies) {
      if (!adjacency.has(dep)) {
        adjacency.set(dep, []);
      }
    }
  }

  for (const node of nodes) {
    adjacency.set(node.name, [...node.dependencies]);
  }

  return adjacency;
}

export function detectCycles(nodes: readonly GraphNode[]): CycleResult {
  const adjacency = buildAdjacencyList(nodes);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const name of adjacency.keys()) {
    color.set(name, WHITE);
    parent.set(name, null);
  }

  for (const startNode of adjacency.keys()) {
    if (color.get(startNode) !== WHITE) continue;

    const stack: string[] = [startNode];

    while (stack.length > 0) {
      const node = stack[stack.length - 1];
      const nodeColor = color.get(node)!;

      if (nodeColor === WHITE) {
        color.set(node, GRAY);
        const deps = adjacency.get(node) ?? [];

        for (const dep of deps) {
          const depColor = color.get(dep);

          if (depColor === GRAY) {
            // Found a cycle — reconstruct it
            const cycle: string[] = [dep, node];
            let current = node;
            while (parent.get(current) !== null && parent.get(current) !== dep) {
              current = parent.get(current)!;
              cycle.push(current);
            }
            cycle.reverse();
            return { hasCycle: true, cycle };
          }

          if (depColor === WHITE) {
            parent.set(dep, node);
            stack.push(dep);
          }
        }
      } else {
        stack.pop();
        color.set(node, BLACK);
      }
    }
  }

  return { hasCycle: false, cycle: [] };
}

export function getTopologicalOrder(nodes: readonly GraphNode[]): readonly string[] {
  const cycleResult = detectCycles(nodes);
  if (cycleResult.hasCycle) {
    throw new Error(`Cannot topologically sort graph with cycle: ${cycleResult.cycle.join(" → ")}`);
  }

  const adjacency = buildAdjacencyList(nodes);
  const visited = new Set<string>();
  const order: string[] = [];

  function dfs(node: string): void {
    if (visited.has(node)) return;
    visited.add(node);

    const deps = adjacency.get(node) ?? [];
    for (const dep of deps) {
      dfs(dep);
    }

    order.push(node);
  }

  for (const name of adjacency.keys()) {
    dfs(name);
  }

  return order;
}
