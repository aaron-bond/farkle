import { describe, expect, it } from 'vitest';
import { bank, roll, selectDice, startTurn } from './turnEngine.js';

describe('turnEngine', () => {
  it('starts a turn with zero score and six dice to roll', () => {
    expect(startTurn()).toEqual({ phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false });
  });

  it('busts a turn when a roll has no scoring dice at all', () => {
    const state = roll(startTurn(), [2, 3, 4, 6, 6, 3]);
    expect(state).toEqual({ phase: 'busted', turnScore: 0 });
  });

  it('moves to awaitingSelection when a roll has at least one scoring die', () => {
    const state = roll(startTurn(), [2, 3, 4, 6, 6, 1]);
    expect(state).toEqual({
      phase: 'awaitingSelection',
      turnScore: 0,
      rolledDice: [2, 3, 4, 6, 6, 1],
    });
  });

  it('accumulates turn score on a valid partial selection, leaving the rest to reroll', () => {
    const afterRoll = roll(startTurn(), [1, 1, 2, 3, 4, 6]);
    if (afterRoll.phase !== 'awaitingSelection') throw new Error('expected awaitingSelection');

    const afterSelection = selectDice(afterRoll, [0, 1]);
    expect(afterSelection).toEqual({ phase: 'ready', turnScore: 200, diceToRoll: 4, isHotDice: false });
  });

  it('triggers hot dice when every rolled die is used in the selection', () => {
    const afterRoll = roll(startTurn(), [1, 1, 1]);
    if (afterRoll.phase !== 'awaitingSelection') throw new Error('expected awaitingSelection');

    const afterSelection = selectDice(afterRoll, [0, 1, 2]);
    expect(afterSelection).toEqual({ phase: 'ready', turnScore: 1000, diceToRoll: 6, isHotDice: true });
  });

  it('carries an existing turn score into the next ready state', () => {
    const afterRoll = roll({ phase: 'ready', turnScore: 550, diceToRoll: 3, isHotDice: false }, [1, 2, 6]);
    if (afterRoll.phase !== 'awaitingSelection') throw new Error('expected awaitingSelection');

    const afterSelection = selectDice(afterRoll, [0]);
    expect(afterSelection).toEqual({ phase: 'ready', turnScore: 650, diceToRoll: 2, isHotDice: false });
  });

  it('rejects a selection that includes a non-scoring die', () => {
    const afterRoll = roll(startTurn(), [1, 2, 3, 4, 5, 6]);
    if (afterRoll.phase !== 'awaitingSelection') throw new Error('expected awaitingSelection');

    expect(selectDice(afterRoll, [0, 1])).toBeNull();
  });

  it('rejects an empty selection (mandatory set-aside)', () => {
    const afterRoll = roll(startTurn(), [1, 2, 3, 4, 5, 6]);
    if (afterRoll.phase !== 'awaitingSelection') throw new Error('expected awaitingSelection');

    expect(selectDice(afterRoll, [])).toBeNull();
  });

  it('rejects duplicate or out-of-range indices', () => {
    const afterRoll = roll(startTurn(), [1, 1, 2, 3, 4, 6]);
    if (afterRoll.phase !== 'awaitingSelection') throw new Error('expected awaitingSelection');

    expect(selectDice(afterRoll, [0, 0])).toBeNull();
    expect(selectDice(afterRoll, [0, 99])).toBeNull();
  });

  it('banks the accumulated turn score', () => {
    expect(bank({ phase: 'ready', turnScore: 2050, diceToRoll: 4, isHotDice: false })).toEqual({
      phase: 'banked',
      turnScore: 2050,
    });
  });
});
