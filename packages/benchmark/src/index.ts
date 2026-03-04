// EAGLES Classic vs Advanced Benchmark Runner
// Usage: pnpm benchmark

import { BenchmarkOrchestrator } from "./runner/BenchmarkOrchestrator.js";

const OUTPUT_ROOT = process.env["EAGLES_ADVANCED_ROOT"]
  ?? "C:/RH-OptimERP/eagles-ai-platform";

async function main(): Promise<void> {
  const orchestrator = new BenchmarkOrchestrator(OUTPUT_ROOT);
  await orchestrator.runAll();
}

main().catch((err: unknown) => {
  process.stderr.write(`[benchmark] Fatal: ${String(err)}\n`);
  process.exit(1);
});
