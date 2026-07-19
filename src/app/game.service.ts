import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { rollDice } from '../core/dice.js';
import { advanceTurn, startMatch, type Difficulty, type MatchState, type PlayerId } from '../core/match.js';
import { bank, roll, selectDice, type TurnState } from '../core/turnEngine.js';

export const RANDOM_SOURCE = new InjectionToken<() => number>('RANDOM_SOURCE', {
  factory: () => Math.random,
});

// Placeholder for the Staging Gate's animation-driven delay (Section 2.2).
// Milestone 4 replaces this with real `animationend` event gating.
const STAGING_DELAY_MS = 400;

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly random = inject(RANDOM_SOURCE);

  private readonly _activeState = signal<MatchState | null>(null);
  private readonly _isInputLocked = signal(false);

  readonly activeState = this._activeState.asReadonly();
  readonly isInputLocked = this._isInputLocked.asReadonly();

  startGame(difficulty: Difficulty, startingPlayer: PlayerId = 'human'): void {
    this._activeState.set(startMatch(difficulty, startingPlayer));
  }

  resetGame(): void {
    this._activeState.set(null);
  }

  async rollDice(): Promise<void> {
    const match = this._activeState();
    if (!match || this._isInputLocked()) return;
    const turnState = match.turnState;
    if (turnState.phase !== 'ready') return;

    const rolledValues = rollDice(turnState.diceToRoll, this.random);
    await this.stageTurnState(match, roll(turnState, rolledValues));
  }

  // Selecting dice and deciding what to do next is one player action, not two:
  // validate the selection and immediately continue into the next roll in a
  // single staged transition, rather than stopping at an intermediate 'ready'
  // screen the player would have to click through.
  async rollAgain(selectedIndices: number[]): Promise<boolean> {
    const match = this._activeState();
    if (!match || this._isInputLocked()) return false;
    const turnState = match.turnState;
    if (turnState.phase !== 'awaitingSelection') return false;

    const afterSelection = selectDice(turnState, selectedIndices);
    if (afterSelection === null) return false;

    const rolledValues = rollDice(afterSelection.diceToRoll, this.random);
    await this.stageTurnState(match, roll(afterSelection, rolledValues));
    return true;
  }

  // Same idea as rollAgain, but banks the accumulated turn score instead of
  // continuing to roll.
  async pass(selectedIndices: number[]): Promise<boolean> {
    const match = this._activeState();
    if (!match || this._isInputLocked()) return false;
    const turnState = match.turnState;
    if (turnState.phase !== 'awaitingSelection') return false;

    const afterSelection = selectDice(turnState, selectedIndices);
    if (afterSelection === null) return false;

    await this.stageTurnState(match, bank(afterSelection));
    return true;
  }

  // The turn's own result (rolled dice, "Farkle!", "Banked 550") is staged and
  // promoted first via stageTurnState, so the player sees it. Only a separate
  // explicit finishTurn() call folds a busted/banked turn into the next player's
  // turn via advanceTurn - keeping the two visually distinct staged transitions.
  async finishTurn(): Promise<void> {
    const match = this._activeState();
    if (!match || this._isInputLocked()) return;
    if (match.turnState.phase !== 'busted' && match.turnState.phase !== 'banked') return;

    this._isInputLocked.set(true);
    await this.wait(STAGING_DELAY_MS);
    this._activeState.set(advanceTurn(match, match.turnState));
    this._isInputLocked.set(false);
  }

  private async stageTurnState(match: MatchState, nextTurnState: TurnState): Promise<void> {
    this._isInputLocked.set(true);
    await this.wait(STAGING_DELAY_MS);
    this._activeState.set({ ...match, turnState: nextTurnState });
    this._isInputLocked.set(false);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
