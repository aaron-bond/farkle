import { describe, expect, it } from 'vitest';
import { advanceTurn, startMatch } from './match.js';
import { startTurn, type TurnState } from './turnEngine.js';

describe('startMatch', () => {
  it('maps difficulty to the correct target score and starts with zeroed totals', () => {
    expect(startMatch('easy')).toEqual({
      turnState: startTurn(),
      playerTotalScore: 0,
      aiTotalScore: 0,
      activePlayer: 'human',
      targetScore: 1500,
      winner: null,
    });
    expect(startMatch('medium').targetScore).toBe(3000);
    expect(startMatch('hard').targetScore).toBe(5000);
  });

  it('supports starting with the AI as the active player', () => {
    expect(startMatch('easy', 'ai').activePlayer).toBe('ai');
  });
});

describe('advanceTurn', () => {
  it('passes through non-terminal turn phases without touching totals or active player', () => {
    const match = startMatch('medium');
    const inProgress: TurnState = {
      phase: 'awaitingSelection',
      turnScore: 0,
      rolledDice: [1, 2, 3, 4, 5, 6],
    };
    const next = advanceTurn(match, inProgress);
    expect(next).toEqual({ ...match, turnState: inProgress });
  });

  it('adds the banked score to the human total and passes the turn to the AI', () => {
    const match = startMatch('medium');
    const next = advanceTurn(match, { phase: 'banked', turnScore: 550 });
    expect(next).toEqual({
      turnState: startTurn(),
      playerTotalScore: 550,
      aiTotalScore: 0,
      activePlayer: 'ai',
      targetScore: 3000,
      winner: null,
    });
  });

  it('adds the banked score to the AI total and passes the turn to the human', () => {
    const match = startMatch('medium', 'ai');
    const next = advanceTurn(match, { phase: 'banked', turnScore: 400 });
    expect(next).toEqual({
      turnState: startTurn(),
      playerTotalScore: 0,
      aiTotalScore: 400,
      activePlayer: 'human',
      targetScore: 3000,
      winner: null,
    });
  });

  it('wipes nothing extra on a bust beyond resetting the turn and switching players', () => {
    const match = { ...startMatch('medium'), playerTotalScore: 800 };
    const next = advanceTurn(match, { phase: 'busted', turnScore: 0 });
    expect(next).toEqual({
      turnState: startTurn(),
      playerTotalScore: 800,
      aiTotalScore: 0,
      activePlayer: 'ai',
      targetScore: 3000,
      winner: null,
    });
  });

  it('declares the human the winner immediately on crossing the target, without a final round', () => {
    const match = { ...startMatch('easy'), playerTotalScore: 1400 };
    const bankedState = { phase: 'banked' as const, turnScore: 200 };
    const next = advanceTurn(match, bankedState);
    expect(next.winner).toBe('human');
    expect(next.playerTotalScore).toBe(1600);
    expect(next.turnState).toEqual(bankedState);
  });

  it('declares the AI the winner immediately on crossing the target', () => {
    const match = { ...startMatch('easy', 'ai'), aiTotalScore: 1450 };
    const next = advanceTurn(match, { phase: 'banked', turnScore: 100 });
    expect(next.winner).toBe('ai');
    expect(next.aiTotalScore).toBe(1550);
  });

  it('ignores further turn updates once the match has a winner', () => {
    const wonMatch = { ...startMatch('easy'), playerTotalScore: 1600, winner: 'human' as const };
    const next = advanceTurn(wonMatch, { phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false });
    expect(next).toBe(wonMatch);
  });
});
