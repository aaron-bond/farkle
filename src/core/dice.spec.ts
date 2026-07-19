import { describe, expect, it } from 'vitest';
import { rollDice } from './dice.js';

describe('rollDice', () => {
  it('returns the requested number of dice', () => {
    expect(rollDice(6)).toHaveLength(6);
    expect(rollDice(0)).toHaveLength(0);
  });

  it('produces values between 1 and 6 inclusive', () => {
    const values = rollDice(200);
    expect(values.every((v) => v >= 1 && v <= 6)).toBe(true);
  });

  it('is deterministic given an injected random source', () => {
    const values = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
    let i = 0;
    const fakeRandom = () => values[i++]!;
    expect(rollDice(6, fakeRandom)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
