import { describe, expect, it } from 'vitest';
import { computeBustProbability, pickAiSelection, shouldAiContinue } from './aiPlayer.js';

describe('computeBustProbability', () => {
  it('matches known exact values for 1, 2, and 3 dice remaining', () => {
    // 1 die: busts unless it's a 1 or 5 -> 4/6.
    expect(computeBustProbability(1)).toBeCloseTo(4 / 6, 10);
    // 2 dice: busts unless either die is a 1 or 5 (no triple possible with 2 dice) -> (4/6)^2.
    expect(computeBustProbability(2)).toBeCloseTo(16 / 36, 10);
    // 3 dice: busts unless a 1/5 is present or all three match -> (64 - 4) / 216.
    expect(computeBustProbability(3)).toBeCloseTo(60 / 216, 10);
  });

  it('gets safer as more dice are available to roll', () => {
    expect(computeBustProbability(6)).toBeLessThan(computeBustProbability(3));
    expect(computeBustProbability(3)).toBeLessThan(computeBustProbability(1));
  });
});

describe('pickAiSelection', () => {
  it('delegates to the scoring engine to find every scoring die', () => {
    expect(pickAiSelection([2, 3, 1, 4, 6])).toEqual([2]);
    expect(pickAiSelection([1, 1, 1, 2, 5, 6]).sort()).toEqual([0, 1, 2, 4]);
  });
});

describe('shouldAiContinue', () => {
  it('never risks a win already in hand', () => {
    expect(
      shouldAiContinue({
        turnScore: 200,
        diceToRoll: 1,
        aiTotalScore: 1400,
        opponentTotalScore: 0,
        targetScore: 1500,
        difficulty: 'hard',
      }),
    ).toBe(false);
  });

  it('declines a risky final die regardless of difficulty when nothing else is at play', () => {
    const base = { turnScore: 0, diceToRoll: 1, aiTotalScore: 0, opponentTotalScore: 0, targetScore: 3000 } as const;
    expect(shouldAiContinue({ ...base, difficulty: 'easy' })).toBe(false);
    expect(shouldAiContinue({ ...base, difficulty: 'medium' })).toBe(false);
    expect(shouldAiContinue({ ...base, difficulty: 'hard' })).toBe(false);
  });

  it('takes a safe bet with 3 dice remaining regardless of difficulty', () => {
    const base = { turnScore: 0, diceToRoll: 3, aiTotalScore: 0, opponentTotalScore: 0, targetScore: 3000 } as const;
    expect(shouldAiContinue({ ...base, difficulty: 'easy' })).toBe(true);
    expect(shouldAiContinue({ ...base, difficulty: 'medium' })).toBe(true);
    expect(shouldAiContinue({ ...base, difficulty: 'hard' })).toBe(true);
  });

  it('banks earlier on easy than on hard once a lot of turn score is at stake', () => {
    const input = {
      turnScore: 750, // half of target - a lot at risk
      diceToRoll: 3,
      aiTotalScore: 0,
      opponentTotalScore: 0,
      targetScore: 1500,
    } as const;
    expect(shouldAiContinue({ ...input, difficulty: 'easy' })).toBe(false);
    expect(shouldAiContinue({ ...input, difficulty: 'hard' })).toBe(true);
  });

  it('takes more risk when significantly behind (catch-up urgency)', () => {
    const base = {
      turnScore: 0,
      diceToRoll: 2,
      aiTotalScore: 0,
      targetScore: 1500,
      difficulty: 'easy',
    } as const;
    expect(shouldAiContinue({ ...base, opponentTotalScore: 0 })).toBe(false);
    expect(shouldAiContinue({ ...base, opponentTotalScore: 1500 })).toBe(true);
  });
});
