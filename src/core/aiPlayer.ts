import { findAutoScoringSelection, hasAnyScore } from './scoringEngine.js';
import type { Difficulty } from './match.js';

export interface AiPersonality {
  // How much bust-probability the AI is willing to accept before preferring
  // to bank, before any adjustment for stakes or being behind.
  riskTolerance: number;
  // Softens how much a growing turn score lowers that risk ceiling - higher
  // greed means the AI stays aggressive even with a lot already banked-in-progress.
  greedIndex: number;
}

export const AI_PERSONALITIES: Record<Difficulty, AiPersonality> = {
  easy: { riskTolerance: 0.35, greedIndex: 0.3 },
  medium: { riskTolerance: 0.45, greedIndex: 0.5 },
  hard: { riskTolerance: 0.55, greedIndex: 0.7 },
};

// Exact bust probability for a given number of dice, derived by brute-force
// enumeration against this game's actual scoring rules (via hasAnyScore)
// rather than hardcoded approximations - so it never drifts out of sync if
// the rules ever change. Memoized since the same dice counts (1-6) recur
// constantly across a game.
const bustProbabilityCache = new Map<number, number>();

export function computeBustProbability(diceCount: number): number {
  if (diceCount <= 0) return 0;
  const cached = bustProbabilityCache.get(diceCount);
  if (cached !== undefined) return cached;

  let totalRolls = 0;
  let bustedRolls = 0;

  const countRolls = (remaining: number, dice: number[]): void => {
    if (remaining === 0) {
      totalRolls++;
      if (!hasAnyScore(dice)) bustedRolls++;
      return;
    }
    for (let face = 1; face <= 6; face++) {
      countRolls(remaining - 1, [...dice, face]);
    }
  };
  countRolls(diceCount, []);

  const probability = bustedRolls / totalRolls;
  bustProbabilityCache.set(diceCount, probability);
  return probability;
}

export function pickAiSelection(rolledDice: number[]): number[] {
  return findAutoScoringSelection(rolledDice).indices;
}

export interface AiContinueDecisionInput {
  turnScore: number;
  diceToRoll: number;
  aiTotalScore: number;
  opponentTotalScore: number;
  targetScore: number;
  difficulty: Difficulty;
}

export function shouldAiContinue(input: AiContinueDecisionInput): boolean {
  // Never risk a win already in hand.
  if (input.aiTotalScore + input.turnScore >= input.targetScore) return false;

  const personality = AI_PERSONALITIES[input.difficulty];
  const bustProbability = computeBustProbability(input.diceToRoll);

  const stakesPenalty = (input.turnScore / input.targetScore) * (1 - personality.greedIndex);
  const deficit = input.opponentTotalScore - input.aiTotalScore;
  const urgencyBonus = deficit > 0 ? Math.min(0.15, deficit / input.targetScore) : 0;

  const adjustedCeiling = personality.riskTolerance - stakesPenalty + urgencyBonus;

  return bustProbability <= adjustedCeiling;
}
