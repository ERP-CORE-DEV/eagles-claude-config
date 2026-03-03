export interface LearningPattern {
  readonly patternId: string;
  readonly name: string;
  readonly description: string;
  readonly successRate: number;
  readonly totalAttempts: number;
  readonly tags: readonly string[];
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
