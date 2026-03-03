import { randomUUID } from "node:crypto";
import type { LearningPattern } from "./types.js";

const EMA_ALPHA = 0.3;
const PRUNE_THRESHOLD = 0.2;
const MIN_ATTEMPTS_FOR_PRUNE = 5;

export class SonaStore {
  private readonly patterns = new Map<string, LearningPattern>();

  store(params: {
    name: string;
    description: string;
    tags?: string[];
  }): LearningPattern {
    const now = new Date().toISOString();
    const pattern: LearningPattern = {
      patternId: randomUUID(),
      name: params.name,
      description: params.description,
      successRate: 0.5,
      totalAttempts: 0,
      tags: params.tags ?? [],
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    this.patterns.set(pattern.patternId, pattern);
    return pattern;
  }

  recordOutcome(patternId: string, success: boolean): LearningPattern | null {
    const pattern = this.patterns.get(patternId);
    if (pattern === undefined) {
      return null;
    }

    const outcome = success ? 1 : 0;
    const newSuccessRate =
      EMA_ALPHA * outcome + (1 - EMA_ALPHA) * pattern.successRate;
    const newAttempts = pattern.totalAttempts + 1;

    const shouldArchive =
      newSuccessRate < PRUNE_THRESHOLD &&
      newAttempts >= MIN_ATTEMPTS_FOR_PRUNE;

    const updated: LearningPattern = {
      ...pattern,
      successRate: newSuccessRate,
      totalAttempts: newAttempts,
      archived: shouldArchive,
      updatedAt: new Date().toISOString(),
    };

    this.patterns.set(patternId, updated);
    return updated;
  }

  suggest(tags?: string[], limit?: number): LearningPattern[] {
    let results = Array.from(this.patterns.values()).filter(
      (pattern) => !pattern.archived,
    );

    if (tags !== undefined && tags.length > 0) {
      results = results.filter((pattern) =>
        tags.some((tag) => pattern.tags.includes(tag)),
      );
    }

    results.sort((a, b) => b.successRate - a.successRate);

    if (limit !== undefined) {
      return results.slice(0, limit);
    }

    return results;
  }

  get(patternId: string): LearningPattern | null {
    return this.patterns.get(patternId) ?? null;
  }

  list(includeArchived?: boolean): LearningPattern[] {
    const all = Array.from(this.patterns.values());
    if (includeArchived === true) {
      return all;
    }
    return all.filter((pattern) => !pattern.archived);
  }

  prune(): number {
    let count = 0;

    for (const [id, pattern] of this.patterns) {
      if (
        !pattern.archived &&
        pattern.successRate < PRUNE_THRESHOLD &&
        pattern.totalAttempts >= MIN_ATTEMPTS_FOR_PRUNE
      ) {
        this.patterns.set(id, {
          ...pattern,
          archived: true,
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    }

    return count;
  }

  count(): number {
    return this.patterns.size;
  }
}
