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
