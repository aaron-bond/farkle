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

function selectDice(service: GameService, indices: number[]): void {
  for (const index of indices) service.toggleDieSelection(index);
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
    selectDice(service, [1]); // die value 2, doesn't score
    const accepted = await service.rollAgain();
    expect(accepted).toBe(false);
    expect(service.isInputLocked()).toBe(false);
    expect(service.activeState()).toEqual(stateBefore);
  });

  it('rollAgain scores the selection and immediately continues into the next roll', async () => {
    const service = configureWithDice([1, 2, 3, 4, 4, 4, 6, 5]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);

    selectDice(service, [0, 3, 4, 5]);
    const [accepted] = await Promise.all([service.rollAgain(), vi.runAllTimersAsync()]);
    expect(accepted).toBe(true);
    expect(service.activeState()?.turnState).toEqual({
      phase: 'awaitingSelection',
      turnScore: 500,
      rolledDice: [6, 5],
    });
  });

  it('pass with nothing selected banks the turn score already accumulated, ignoring the current roll', async () => {
    const service = configureWithDice([1, 2, 3, 4, 4, 4, 6, 5]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
    selectDice(service, [0, 3, 4, 5]);
    await Promise.all([service.rollAgain(), vi.runAllTimersAsync()]);

    // Now sitting on a second roll [6, 5] with 500 already banked-in-progress.
    // Passing with an empty selection should bank exactly that 500, not
    // require engaging with the new roll (which does have a scoring 5 in it).
    const [accepted] = await Promise.all([service.pass(), vi.runAllTimersAsync()]);
    expect(accepted).toBe(true);
    expect(service.activeState()?.turnState).toEqual({ phase: 'banked', turnScore: 500 });
  });

  it('finishTurn folds a bust into the next player turn, then the AI plays automatically', async () => {
    const service = configureWithDice([2, 3, 4, 6, 6, 3]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
    await Promise.all([service.finishTurn(), vi.runAllTimersAsync()]);

    // Control passes to the AI, which immediately plays its own turn - with
    // this repeating fake dice sequence it also busts right away, handing
    // control straight back to the human.
    const match = service.activeState()!;
    expect(match.turnState).toEqual({ phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false });
    expect(match.activePlayer).toBe('human');
    expect(match.playerTotalScore).toBe(0);
    expect(match.aiTotalScore).toBe(0);
  });

  it('banking a full straight on easy difficulty reaches the target and declares the winner', async () => {
    const service = configureWithDice([1, 2, 3, 4, 5, 6]);
    service.startGame('easy');

    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);

    selectDice(service, [0, 1, 2, 3, 4, 5]);
    const [accepted] = await Promise.all([service.pass(), vi.runAllTimersAsync()]);
    expect(accepted).toBe(true);
    expect(service.activeState()?.turnState).toEqual({ phase: 'banked', turnScore: 1500 });

    await Promise.all([service.finishTurn(), vi.runAllTimersAsync()]);
    const match = service.activeState()!;
    expect(match.winner).toBe('human');
    expect(match.playerTotalScore).toBe(1500);
  });

  it('plays a full AI turn automatically: takes every scoring die and banks a winning roll', async () => {
    const service = configureWithDice([1, 2, 3, 4, 5, 6]);
    service.startGame('easy', 'ai');

    await vi.runAllTimersAsync();

    const match = service.activeState()!;
    expect(match.winner).toBe('ai');
    expect(match.aiTotalScore).toBe(1500);
    expect(match.turnState).toEqual({ phase: 'banked', turnScore: 1500 });
  });

  it('reveals the AI selection one die at a time, pausing before, between, and after, before submitting', async () => {
    const service = configureWithDice([1, 5, 2, 3, 4, 6]); // indices 0 and 1 score individually
    service.startGame('easy', 'ai');

    await vi.advanceTimersByTimeAsync(400); // the roll stages
    expect(service.activeState()?.turnState).toEqual({
      phase: 'awaitingSelection',
      turnScore: 0,
      rolledDice: [1, 5, 2, 3, 4, 6],
    });
    expect(service.selectedIndices()).toEqual([]); // pause before touching anything

    await vi.advanceTimersByTimeAsync(1000); // first die (the 1) revealed
    expect(service.selectedIndices()).toEqual([0]);
    expect(service.activeState()?.turnState.phase).toBe('awaitingSelection');

    await vi.advanceTimersByTimeAsync(1000); // second die (the 5) revealed
    expect(service.selectedIndices()).toEqual([0, 1]);
    // Still just sitting on the finished selection, not yet submitted.
    expect(service.activeState()?.turnState.phase).toBe('awaitingSelection');

    await vi.runAllTimersAsync(); // final observe pause, then submit and play out the rest of the turn
    expect(service.selectedIndices()).toEqual([]); // cleared once submitted
  });
});
