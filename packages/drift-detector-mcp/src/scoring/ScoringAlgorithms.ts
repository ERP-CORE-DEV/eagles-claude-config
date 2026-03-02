// ScoringAlgorithms — five independent drift metrics, each returning 0.0–1.0.
// Higher score always means healthier / less drift.

// ---------------------------------------------------------------------------
// Metric 1 — Requirements Coverage (weight 0.30)
// coverage = matched_requirements / total_checklist_items
// A requirement is "matched" when any checklist item text contains
// the addressed string as a case-insensitive substring.
// ---------------------------------------------------------------------------
export function scoreRequirementCoverage(
  totalItems: number,
  addressedItems: string[],
  checklistItems: string[],
): number {
  if (totalItems === 0) {
    return 1.0;
  }

  let matched = 0;
  for (const checklist of checklistItems) {
    const lowerChecklist = checklist.toLowerCase();
    const isAddressed = addressedItems.some((addressed) =>
      lowerChecklist.includes(addressed.toLowerCase()),
    );
    if (isAddressed) {
      matched += 1;
    }
  }

  return Math.min(1.0, matched / totalItems);
}

// ---------------------------------------------------------------------------
// Metric 2 — Test Health (weight 0.25)
// pass_rate   = tests_passing / tests_total
// count_health = min(1.0, tests_total / baseline_test_count)
// score = 0.7 * pass_rate + 0.3 * count_health
// ---------------------------------------------------------------------------
export function scoreTestHealth(
  testsPassing: number,
  testsTotal: number,
  baselineTestCount: number,
): number {
  if (testsTotal === 0 && baselineTestCount === 0) {
    return 1.0;
  }

  const passRate = testsTotal === 0 ? 0 : testsPassing / testsTotal;
  const countHealth =
    baselineTestCount === 0
      ? 1.0
      : Math.min(1.0, testsTotal / baselineTestCount);

  return 0.7 * passRate + 0.3 * countHealth;
}

// ---------------------------------------------------------------------------
// Metric 3 — File Churn (weight 0.15)
// churn_ratio = unique_files_touched / total_edit_operations
// 1.0 = every edit touched a different file (ideal)
// 0.0 = all edits on the same file
// ---------------------------------------------------------------------------
export function scoreFileChurn(
  uniqueFiles: number,
  totalEdits: number,
): number {
  if (totalEdits === 0) {
    return 1.0;
  }
  const effective = Math.min(uniqueFiles, totalEdits);
  return effective / totalEdits;
}

// ---------------------------------------------------------------------------
// Metric 4 — Token Efficiency (weight 0.15, nullable)
// lines_per_1k = (lines_added / tokens_consumed) * 1000
// score = min(lines_per_1k / 10.0, 1.0)
// Returns null when tokens_consumed is 0 (data unavailable).
// ---------------------------------------------------------------------------
export function scoreTokenEfficiency(
  linesAdded: number,
  tokensConsumed: number,
): number | null {
  if (tokensConsumed === 0) {
    return null;
  }
  const linesPer1k = (linesAdded / tokensConsumed) * 1000;
  return Math.min(linesPer1k / 10.0, 1.0);
}

// ---------------------------------------------------------------------------
// Metric 5 — Scope Creep (weight 0.15)
// unplanned   = new_files NOT present in planned_files list
// creep_ratio = unplanned / total_new_files
// score = 1.0 - creep_ratio
// ---------------------------------------------------------------------------
export function scoreScopeCreep(
  newFiles: string[],
  plannedFiles: string[],
): number {
  if (newFiles.length === 0) {
    return 1.0;
  }
  const plannedSet = new Set(plannedFiles.map((f) => f.toLowerCase()));
  const unplanned = newFiles.filter(
    (f) => !plannedSet.has(f.toLowerCase()),
  ).length;
  const creepRatio = unplanned / newFiles.length;
  return 1.0 - creepRatio;
}
