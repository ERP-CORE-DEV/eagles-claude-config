#!/usr/bin/env node

// EAGLES Classic vs Advanced Benchmark Runner
// Usage: pnpm benchmark

import { BenchmarkOrchestrator } from "./runner/BenchmarkOrchestrator.js";

const CLASSIC_ROOT = process.env["EAGLES_CLASSIC_ROOT"]
  ?? "C:/Users/hatim/.claude";

const ADVANCED_ROOT = process.env["EAGLES_ADVANCED_ROOT"]
  ?? "C:/RH-OptimERP/eagles-advanced";

async function main(): Promise<void> {
  const orchestrator = new BenchmarkOrchestrator(CLASSIC_ROOT, ADVANCED_ROOT);
  await orchestrator.runAll();
}

main().catch((err: unknown) => {
  process.stderr.write(`[benchmark] Fatal: ${String(err)}\n`);
  process.exit(1);
});
