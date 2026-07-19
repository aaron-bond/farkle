import type { TurnState } from './turnEngine.js';

export interface SerializableGameState {
  turnState: TurnState;
  playerTotalScore: number;
  aiTotalScore: number;
  activePlayer: 'human' | 'ai';
  targetScore: number;
}

export interface StorageAccessProvider {
  saveGameState(state: SerializableGameState): Promise<void>;
  loadGameState(): Promise<SerializableGameState | null>;
  clearSession(): Promise<void>;
}

export const STORAGE_KEY = 'farkle.gameState';

export function createLocalStorageProvider(storage: Storage = localStorage): StorageAccessProvider {
  return {
    async saveGameState(state) {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    },

    async loadGameState() {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as SerializableGameState;
      } catch {
        return null;
      }
    },

    async clearSession() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}
