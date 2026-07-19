import type { MatchResult, ScoringRule } from './types.js';

function buildMatch(diceValues: number[], usedIndices: number[], score: number): MatchResult {
  const usedSet = new Set(usedIndices);
  const remainingDice = diceValues.filter((_, i) => !usedSet.has(i));
  return { isValid: true, score, usedIndices, remainingDice };
}

function findIndicesForEach(diceValues: number[], requiredValues: number[]): number[] | null {
  const usedIndices: number[] = [];
  const usedSet = new Set<number>();
  for (const required of requiredValues) {
    const foundIndex = diceValues.findIndex((v, i) => v === required && !usedSet.has(i));
    if (foundIndex === -1) return null;
    usedIndices.push(foundIndex);
    usedSet.add(foundIndex);
  }
  return usedIndices;
}

function straightRule(name: string, priority: number, requiredValues: number[], score: number): ScoringRule {
  return {
    name,
    priority,
    evaluate: (diceValues) => {
      const indices = findIndicesForEach(diceValues, requiredValues);
      if (!indices) return null;
      return buildMatch(diceValues, indices, score);
    },
  };
}

const fullStraight = straightRule('Full Straight', 100, [1, 2, 3, 4, 5, 6], 1500);
const highStraight = straightRule('High Straight', 91, [2, 3, 4, 5, 6], 750);
const lowStraight = straightRule('Low Straight', 90, [1, 2, 3, 4, 5], 500);

function tripleBaseValue(value: number): number {
  return value === 1 ? 1000 : value * 100;
}

const ofAKind: ScoringRule = {
  name: 'N of a Kind',
  priority: 80,
  evaluate: (diceValues) => {
    for (let value = 1; value <= 6; value++) {
      const indices = diceValues.reduce<number[]>((acc, v, i) => {
        if (v === value) acc.push(i);
        return acc;
      }, []);
      if (indices.length >= 3) {
        const score = tripleBaseValue(value) * 2 ** (indices.length - 3);
        return buildMatch(diceValues, indices, score);
      }
    }
    return null;
  },
};

function singleValueRule(name: string, priority: number, value: number, pointsPerDie: number): ScoringRule {
  return {
    name,
    priority,
    evaluate: (diceValues) => {
      const indices = diceValues.reduce<number[]>((acc, v, i) => {
        if (v === value) acc.push(i);
        return acc;
      }, []);
      if (indices.length === 0) return null;
      return buildMatch(diceValues, indices, indices.length * pointsPerDie);
    },
  };
}

const singleOne = singleValueRule('Single 1', 10, 1, 100);
const singleFive = singleValueRule('Single 5', 5, 5, 50);

export const scoringRules: ScoringRule[] = [
  fullStraight,
  highStraight,
  lowStraight,
  ofAKind,
  singleOne,
  singleFive,
];
