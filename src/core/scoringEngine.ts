import { scoringRules } from './scoringRules.js';
import type { ScoringRule } from './types.js';

export interface SelectionEvaluation {
  isValid: boolean;
  score: number;
}

export function hasAnyScore(diceValues: number[]): boolean {
  const counts = new Map<number, number>();
  for (const value of diceValues) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return diceValues.includes(1) || diceValues.includes(5) || [...counts.values()].some((count) => count >= 3);
}

export interface AutoScoringSelection {
  indices: number[];
  score: number;
}

// Greedily identifies every die in a raw roll that can be folded into some
// scoring group, using the same priority-ordered rule consumption as
// evaluateSelection - but reports back which original indices were used,
// rather than requiring the caller to already know the subset. This is what
// lets an AI player look at a fresh roll and take "everything that scores"
// without the human-facing checkbox-selection step.
export function findAutoScoringSelection(
  diceValues: number[],
  rules: ScoringRule[] = scoringRules,
): AutoScoringSelection {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  let pool = diceValues.map((value, originalIndex) => ({ value, originalIndex }));
  let score = 0;
  const indices: number[] = [];

  while (pool.length > 0) {
    const poolValues = pool.map((die) => die.value);
    const match = sortedRules.map((rule) => rule.evaluate(poolValues)).find((m) => m !== null);
    if (!match) break;

    score += match.score;
    const usedSet = new Set(match.usedIndices);
    for (let i = 0; i < pool.length; i++) {
      if (usedSet.has(i)) indices.push(pool[i]!.originalIndex);
    }
    pool = pool.filter((_, i) => !usedSet.has(i));
  }

  return { indices, score };
}

export function evaluateSelection(
  diceValues: number[],
  rules: ScoringRule[] = scoringRules,
): SelectionEvaluation {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  let pool = diceValues;
  let score = 0;

  while (pool.length > 0) {
    const match = sortedRules.map((rule) => rule.evaluate(pool)).find((m) => m !== null);
    if (!match) break;
    score += match.score;
    pool = match.remainingDice;
  }

  const isValid = pool.length === 0 && score > 0;
  return { isValid, score: isValid ? score : 0 };
}
