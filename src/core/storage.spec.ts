import { describe, expect, it } from 'vitest';
import type { MatchState } from './match.js';
import { createLocalStorageProvider, STORAGE_KEY } from './storage.js';

class FakeStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const sampleState: MatchState = {
  turnState: { phase: 'ready', turnScore: 550, diceToRoll: 4, isHotDice: false },
  playerTotalScore: 1200,
  aiTotalScore: 800,
  activePlayer: 'human',
  targetScore: 3000,
  difficulty: 'medium',
  winner: null,
};

describe('createLocalStorageProvider', () => {
  it('returns null when nothing has been saved', async () => {
    const provider = createLocalStorageProvider(new FakeStorage());
    expect(await provider.loadGameState()).toBeNull();
  });

  it('round-trips a saved game state', async () => {
    const provider = createLocalStorageProvider(new FakeStorage());
    await provider.saveGameState(sampleState);
    expect(await provider.loadGameState()).toEqual(sampleState);
  });

  it('overwrites the previously saved state on each save', async () => {
    const storage = new FakeStorage();
    const provider = createLocalStorageProvider(storage);
    await provider.saveGameState(sampleState);
    await provider.saveGameState({ ...sampleState, playerTotalScore: 2000 });
    expect(await provider.loadGameState()).toEqual({ ...sampleState, playerTotalScore: 2000 });
  });

  it('returns null instead of throwing when stored data is corrupted', async () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEY, 'not valid json{');
    const provider = createLocalStorageProvider(storage);
    expect(await provider.loadGameState()).toBeNull();
  });

  it('clears the session so a subsequent load returns null', async () => {
    const provider = createLocalStorageProvider(new FakeStorage());
    await provider.saveGameState(sampleState);
    await provider.clearSession();
    expect(await provider.loadGameState()).toBeNull();
  });

  it('defaults to the global localStorage when no storage is supplied', async () => {
    const provider = createLocalStorageProvider();
    await provider.clearSession();
    expect(await provider.loadGameState()).toBeNull();
    await provider.saveGameState(sampleState);
    expect(await provider.loadGameState()).toEqual(sampleState);
    await provider.clearSession();
  });
});
