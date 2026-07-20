import type { MatchState } from './match.js';

export interface StorageAccessProvider {
  saveGameState(state: MatchState): Promise<void>;
  loadGameState(): Promise<MatchState | null>;
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
        return JSON.parse(raw) as MatchState;
      } catch {
        return null;
      }
    },

    async clearSession() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}
