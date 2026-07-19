import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { findAutoScoringSelection } from '../core/scoringEngine.js';
import { shouldAiContinue } from '../core/aiPlayer.js';
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
    const match = startMatch(difficulty, startingPlayer);
    this._activeState.set(match);
    if (match.activePlayer === 'ai') {
      void this.playAiTurn();
    }
  }

  resetGame(): void {
    this._activeState.set(null);
  }

  async rollDice(): Promise<void> {
    const match = this._activeState();
    if (!match || this._isInputLocked() || match.activePlayer !== 'human') return;
    const turnState = match.turnState;
    if (turnState.phase !== 'ready') return;

    await this.performRoll(match, turnState);
  }

  // Selecting dice and deciding what to do next is one player action, not two:
  // validate the selection and immediately continue into the next roll in a
  // single staged transition, rather than stopping at an intermediate 'ready'
  // screen the player would have to click through.
  async rollAgain(selectedIndices: number[]): Promise<boolean> {
    const match = this._activeState();
    if (!match || this._isInputLocked() || match.activePlayer !== 'human') return false;
    const turnState = match.turnState;
    if (turnState.phase !== 'awaitingSelection') return false;

    return this.performSelectionAndRoll(match, turnState, selectedIndices);
  }

  // Same idea as rollAgain, but banks the accumulated turn score instead of
  // continuing to roll.
  async pass(selectedIndices: number[]): Promise<boolean> {
    const match = this._activeState();
    if (!match || this._isInputLocked() || match.activePlayer !== 'human') return false;
    const turnState = match.turnState;
    if (turnState.phase !== 'awaitingSelection') return false;

    return this.performSelectionAndBank(match, turnState, selectedIndices);
  }

  // The turn's own result (rolled dice, "Farkle!", "Banked 550") is staged and
  // promoted first via stageTurnState, so the player sees it. Only a separate
  // explicit finishTurn() call folds a busted/banked turn into the next player's
  // turn via advanceTurn - keeping the two visually distinct staged transitions.
  async finishTurn(): Promise<void> {
    const match = this._activeState();
    if (!match || this._isInputLocked()) return;
    if (match.turnState.phase !== 'busted' && match.turnState.phase !== 'banked') return;

    await this.performFinishTurn(match);
  }

  // Drives a full AI turn autonomously: roll, take every scoring die, decide
  // bank-vs-continue via the personality heuristic, repeat until it busts or
  // banks, then fold the result into the next turn exactly like a human's
  // finishTurn() would. Each step still goes through the same staging gate
  // (stageTurnState/performFinishTurn), so the AI's turn paces itself
  // identically to a human one instead of resolving instantly.
  private async playAiTurn(): Promise<void> {
    let match = this._activeState();
    if (!match || match.winner || match.activePlayer !== 'ai') return;

    if (match.turnState.phase === 'ready') {
      await this.performRoll(match, match.turnState);
      match = this._activeState()!;
    }

    while (match.turnState.phase === 'awaitingSelection') {
      const turnState = match.turnState;
      const { indices, score } = findAutoScoringSelection(turnState.rolledDice);
      const leftover = turnState.rolledDice.length - indices.length;
      const diceToRollIfContinuing = leftover === 0 ? 6 : leftover;

      const continueRolling = shouldAiContinue({
        turnScore: turnState.turnScore + score,
        diceToRoll: diceToRollIfContinuing,
        aiTotalScore: match.aiTotalScore,
        opponentTotalScore: match.playerTotalScore,
        targetScore: match.targetScore,
        difficulty: match.difficulty,
      });

      if (continueRolling) {
        await this.performSelectionAndRoll(match, turnState, indices);
      } else {
        await this.performSelectionAndBank(match, turnState, indices);
      }
      match = this._activeState()!;
    }

    await this.performFinishTurn(match);
  }

  private async performRoll(match: MatchState, turnState: Extract<TurnState, { phase: 'ready' }>): Promise<void> {
    const rolledValues = rollDice(turnState.diceToRoll, this.random);
    await this.stageTurnState(match, roll(turnState, rolledValues));
  }

  private async performSelectionAndRoll(
    match: MatchState,
    turnState: Extract<TurnState, { phase: 'awaitingSelection' }>,
    selectedIndices: number[],
  ): Promise<boolean> {
    const afterSelection = selectDice(turnState, selectedIndices);
    if (afterSelection === null) return false;

    const rolledValues = rollDice(afterSelection.diceToRoll, this.random);
    await this.stageTurnState(match, roll(afterSelection, rolledValues));
    return true;
  }

  private async performSelectionAndBank(
    match: MatchState,
    turnState: Extract<TurnState, { phase: 'awaitingSelection' }>,
    selectedIndices: number[],
  ): Promise<boolean> {
    const afterSelection = selectDice(turnState, selectedIndices);
    if (afterSelection === null) return false;

    await this.stageTurnState(match, bank(afterSelection));
    return true;
  }

  private async performFinishTurn(match: MatchState): Promise<void> {
    this._isInputLocked.set(true);
    await this.wait(STAGING_DELAY_MS);
    const next = advanceTurn(match, match.turnState);
    this._activeState.set(next);
    this._isInputLocked.set(false);

    if (next.activePlayer === 'ai' && !next.winner) {
      await this.playAiTurn();
    }
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
