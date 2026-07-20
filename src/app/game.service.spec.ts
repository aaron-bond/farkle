import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchState } from '../core/match.js';
import type { StorageAccessProvider } from '../core/storage.js';
import { GameService, RANDOM_SOURCE, STORAGE_PROVIDER } from './game.service.js';

function fakeRandomForDiceSequence(values: number[]): () => number {
  const floats = values.map((v) => (v - 1) / 6 + 1 / 12);
  let i = 0;
  return () => floats[i++ % floats.length]!;
}

class FakeGameStorage implements StorageAccessProvider {
  saved: MatchState | null;

  constructor(initial: MatchState | null = null) {
    this.saved = initial;
  }

  async saveGameState(state: MatchState): Promise<void> {
    this.saved = state;
  }

  async loadGameState(): Promise<MatchState | null> {
    return this.saved;
  }

  async clearSession(): Promise<void> {
    this.saved = null;
  }
}

function configureWithDice(values: number[], storage: StorageAccessProvider = new FakeGameStorage()): GameService {
  TestBed.configureTestingModule({
    providers: [
      { provide: RANDOM_SOURCE, useValue: fakeRandomForDiceSequence(values) },
      { provide: STORAGE_PROVIDER, useValue: storage },
    ],
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

    const rollPromise = service.rollDice();
    await vi.advanceTimersByTimeAsync(400); // just the roll itself staging
    expect(service.activeState()?.turnState).toEqual({ phase: 'busted', turnScore: 0 });
    expect(service.activeState()?.activePlayer).toBe('human'); // not yet folded/switched

    await vi.runAllTimersAsync();
    await rollPromise;
    expect(service.activeState()?.playerTotalScore).toBe(0);
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
    const passPromise = service.pass();
    await vi.advanceTimersByTimeAsync(400); // just the bank itself staging
    expect(service.activeState()?.turnState).toEqual({ phase: 'banked', turnScore: 500 });

    await vi.runAllTimersAsync();
    const accepted = await passPromise;
    expect(accepted).toBe(true);
    expect(service.activeState()?.playerTotalScore).toBe(500);
  });

  it('busting auto-settles into the next player turn, then the AI plays automatically', async () => {
    const service = configureWithDice([2, 3, 4, 6, 6, 3]);
    service.startGame('medium');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);

    // rollDice() already settles the bust automatically (no Continue button
    // anymore) and control passes to the AI, which immediately plays its own
    // turn - with this repeating fake dice sequence it also busts right
    // away, handing control straight back to the human.
    const match = service.activeState()!;
    expect(match.turnState).toEqual({ phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false });
    expect(match.activePlayer).toBe('human');
    expect(match.playerTotalScore).toBe(0);
    expect(match.aiTotalScore).toBe(0);
  });

  it('a turn-ending result holds on screen for a beat before auto-settling, without needing a Continue click', async () => {
    const service = configureWithDice([1, 2, 3, 4, 5, 6]);
    service.startGame('easy');
    await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
    selectDice(service, [0, 1, 2, 3, 4, 5]);

    const passPromise = service.pass();
    await vi.advanceTimersByTimeAsync(400); // just the bank itself staging
    expect(service.activeState()?.turnState).toEqual({ phase: 'banked', turnScore: 1500 });
    expect(service.activeState()?.winner).toBeNull(); // not yet folded into the match

    await vi.runAllTimersAsync();
    const accepted = await passPromise;

    expect(accepted).toBe(true);
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

  describe('persistence', () => {
    it('persists the game state after starting a game and after each committed turn transition', async () => {
      const storage = new FakeGameStorage();
      const service = configureWithDice([1, 2, 3, 4, 4, 4], storage);

      service.startGame('medium');
      expect(storage.saved).toEqual(service.activeState());

      await Promise.all([service.rollDice(), vi.runAllTimersAsync()]);
      expect(storage.saved).toEqual(service.activeState());
    });

    it('offers a saved game as a pending resume on construction, without applying it yet', async () => {
      const saved: MatchState = {
        turnState: { phase: 'ready', turnScore: 300, diceToRoll: 4, isHotDice: false },
        playerTotalScore: 800,
        aiTotalScore: 200,
        activePlayer: 'human',
        targetScore: 3000,
        difficulty: 'medium',
        winner: null,
      };
      const service = configureWithDice([1, 1, 1, 1, 1, 1], new FakeGameStorage(saved));

      await vi.advanceTimersByTimeAsync(0); // flush the constructor's fire-and-forget restore

      expect(service.pendingResume()).toEqual(saved);
      expect(service.activeState()).toBeNull();
    });

    it('does not offer anything to resume when no game was saved', async () => {
      const service = configureWithDice([1, 1, 1, 1, 1, 1], new FakeGameStorage(null));
      await vi.advanceTimersByTimeAsync(0);
      expect(service.pendingResume()).toBeNull();
      expect(service.activeState()).toBeNull();
    });

    it('discards a saved match that already has a winner rather than offering to resume it', async () => {
      const finished: MatchState = {
        turnState: { phase: 'banked', turnScore: 200 },
        playerTotalScore: 1600,
        aiTotalScore: 900,
        activePlayer: 'human',
        targetScore: 1500,
        difficulty: 'easy',
        winner: 'human',
      };
      const storage = new FakeGameStorage(finished);
      const service = configureWithDice([1, 1, 1, 1, 1, 1], storage);

      await vi.advanceTimersByTimeAsync(0);

      expect(service.pendingResume()).toBeNull();
      expect(storage.saved).toBeNull();
    });

    it('resumeSavedGame applies the pending state and resumes an AI turn if that was mid-flight', async () => {
      const saved: MatchState = {
        turnState: { phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false },
        playerTotalScore: 0,
        aiTotalScore: 0,
        activePlayer: 'ai',
        targetScore: 1500,
        difficulty: 'easy',
        winner: null,
      };
      const service = configureWithDice([1, 2, 3, 4, 5, 6], new FakeGameStorage(saved));
      await vi.advanceTimersByTimeAsync(0);

      service.resumeSavedGame();
      expect(service.pendingResume()).toBeNull();

      await vi.runAllTimersAsync();

      const match = service.activeState()!;
      expect(match.winner).toBe('ai');
      expect(match.aiTotalScore).toBe(1500);
    });

    it('discardSavedGame clears the pending offer and the persisted session, without touching activeState', async () => {
      const saved: MatchState = {
        turnState: { phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false },
        playerTotalScore: 400,
        aiTotalScore: 100,
        activePlayer: 'human',
        targetScore: 3000,
        difficulty: 'medium',
        winner: null,
      };
      const storage = new FakeGameStorage(saved);
      const service = configureWithDice([1, 1, 1, 1, 1, 1], storage);
      await vi.advanceTimersByTimeAsync(0);
      expect(service.pendingResume()).toEqual(saved);

      service.discardSavedGame();

      expect(service.pendingResume()).toBeNull();
      expect(service.activeState()).toBeNull();
      expect(storage.saved).toBeNull();
    });

    it('resetGame clears the persisted session', async () => {
      const storage = new FakeGameStorage();
      const service = configureWithDice([1, 1, 1, 1, 1, 1], storage);
      service.startGame('easy');
      expect(storage.saved).not.toBeNull();

      service.resetGame();
      await vi.advanceTimersByTimeAsync(0);
      expect(storage.saved).toBeNull();
    });
  });
});
