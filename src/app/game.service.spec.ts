import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameService, RANDOM_SOURCE } from './game.service.js';

function fakeRandomForDiceSequence(values: number[]): () => number {
  const floats = values.map((v) => (v - 1) / 6 + 1 / 12);
  let i = 0;
  return () => floats[i++ % floats.length]!;
}

function configureWithDice(values: number[]): GameService {
  TestBed.configureTestingModule({
    providers: [{ provide: RANDOM_SOURCE, useValue: fakeRandomForDiceSequence(values) }],
  });
  return TestBed.inject(GameService);
}

describe('GameService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a game with the correct target score', () => {
    const service = configureWithDice([1, 1, 1, 1, 1, 1]);
    service.startGame('medium');
    expect(service.activeState()?.targetScore).toBe(3000);
    expect(service.isInputLocked()).toBe(false);
  });

  it('locks input during the staging delay and unlocks after promotion', async () => {
    const service = configureWithDice([1, 2, 3, 4, 4, 4]);
    service.startGame('medium');

    const rollPromise = service.rollDice();
    expect(service.isInputLocked()).toBe(true);
    await vi.runAllTimersAsync();
    await rollPromise;
    expect(service.isInputLocked()).toBe(false);
  });

  it('rolling produces an awaitingSelection turn with the exact rolled dice', async () => {
    const service = configureWithDice([1, 2, 3, 4, 4, 4]);
    service.startGame('medium');

    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
    expect(service.activeState()?.turnState).toEqual({
      phase: 'awaitingSelection',
      turnScore: 0,
      rolledDice: [1, 2, 3, 4, 4, 4],
    });
  });

  it('busts on a roll with no scoring dice at all, without touching totals yet', async () => {
    const service = configureWithDice([2, 3, 4, 6, 6, 3]);
    service.startGame('medium');

    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
    const match = service.activeState()!;
    expect(match.turnState).toEqual({ phase: 'busted', turnScore: 0 });
    expect(match.activePlayer).toBe('human');
    expect(match.playerTotalScore).toBe(0);
  });

  it('rejects an invalid selection without locking input or changing state', async () => {
    const service = configureWithDice([1, 2, 3, 4, 4, 4]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);

    const stateBefore = service.activeState();
    const accepted = await service.rollAgain([1]); // die value 2, doesn't score
    expect(accepted).toBe(false);
    expect(service.isInputLocked()).toBe(false);
    expect(service.activeState()).toEqual(stateBefore);
  });

  it('rollAgain scores the selection and immediately continues into the next roll', async () => {
    const service = configureWithDice([1, 2, 3, 4, 4, 4, 6, 5]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);

    const [accepted] = await Promise.all([service.rollAgain([0, 3, 4, 5]), vi.runAllTimersAsync()]);
    expect(accepted).toBe(true);
    expect(service.activeState()?.turnState).toEqual({
      phase: 'awaitingSelection',
      turnScore: 500,
      rolledDice: [6, 5],
    });
  });

  it('finishTurn folds a bust into the next player turn and switches players', async () => {
    const service = configureWithDice([2, 3, 4, 6, 6, 3]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
    await Promise.all([service.finishTurn(), vi.runAllTimersAsync()]);

    const match = service.activeState()!;
    expect(match.turnState).toEqual({ phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false });
    expect(match.activePlayer).toBe('ai');
    expect(match.playerTotalScore).toBe(0);
  });

  it('banking a full straight on easy difficulty reaches the target and declares the winner', async () => {
    const service = configureWithDice([1, 2, 3, 4, 5, 6]);
    service.startGame('easy');

    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);

    const [accepted] = await Promise.all([service.pass([0, 1, 2, 3, 4, 5]), vi.runAllTimersAsync()]);
    expect(accepted).toBe(true);
    expect(service.activeState()?.turnState).toEqual({ phase: 'banked', turnScore: 1500 });

    await Promise.all([service.finishTurn(), vi.runAllTimersAsync()]);
    const match = service.activeState()!;
    expect(match.winner).toBe('human');
    expect(match.playerTotalScore).toBe(1500);
  });
});
