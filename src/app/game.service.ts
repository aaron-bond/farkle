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

// Pause after each die the AI selects, so a human watching sees it build up
// its selection one die at a time - like a real player clicking through the
// dice - rather than the whole selection appearing at once and submitting
// before anyone can register what happened.
const AI_THINKING_DELAY_MS = 1000;

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly random = inject(RANDOM_SOURCE);

  private readonly _activeState = signal<MatchState | null>(null);
  private readonly _isInputLocked = signal(false);
  private readonly _selectedIndices = signal<number[]>([]);

  readonly activeState = this._activeState.asReadonly();
  readonly isInputLocked = this._isInputLocked.asReadonly();
  readonly selectedIndices = this._selectedIndices.asReadonly();

  startGame(difficulty: Difficulty, startingPlayer: PlayerId = 'human'): void {
    const match = startMatch(difficulty, startingPlayer);
    this._activeState.set(match);
    if (match.activePlayer === 'ai') {
      void this.playAiTurn();
    }
  }

  resetGame(): void {
    this._activeState.set(null);
    this._selectedIndices.set([]);
  }

  toggleDieSelection(index: number): void {
    const match = this._activeState();
    if (!match || this._isInputLocked() || match.activePlayer !== 'human') return;

    const current = this._selectedIndices();
    this._selectedIndices.set(current.includes(index) ? current.filter((i) => i !== index) : [...current, index]);
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
  async rollAgain(): Promise<boolean> {
    const match = this._activeState();
    if (!match || this._isInputLocked() || match.activePlayer !== 'human') return false;
    const turnState = match.turnState;
    if (turnState.phase !== 'awaitingSelection') return false;

    const accepted = await this.performSelectionAndRoll(match, turnState, this._selectedIndices());
    if (accepted) this._selectedIndices.set([]);
    return accepted;
  }

  // Same idea as rollAgain, but banks the accumulated turn score instead of
  // continuing to roll. Passing with nothing selected is allowed - the
  // mandatory-set-aside rule only gates continuing to roll, not giving up
  // and banking whatever was already accumulated earlier this turn. This
  // matters as an escape hatch for a player who can't tell what's scoreable
  // in the current roll rather than trapping them into a forced guess.
  async pass(): Promise<boolean> {
    const match = this._activeState();
    if (!match || this._isInputLocked() || match.activePlayer !== 'human') return false;
    const turnState = match.turnState;
    if (turnState.phase !== 'awaitingSelection') return false;

    const selectedIndices = this._selectedIndices();
    if (selectedIndices.length === 0) {
      await this.stageTurnState(match, { phase: 'banked', turnScore: turnState.turnScore });
      this._selectedIndices.set([]);
      return true;
    }

    const accepted = await this.performSelectionAndBank(match, turnState, selectedIndices);
    if (accepted) this._selectedIndices.set([]);
    return accepted;
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

  // Drives a full AI turn autonomously: roll, take every scoring die (revealed
  // one at a time, pausing between each so the selection is visible), decide
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

      await this.revealAiSelection(indices);

      if (continueRolling) {
        await this.performSelectionAndRoll(match, turnState, indices);
      } else {
        await this.performSelectionAndBank(match, turnState, indices);
      }
      this._selectedIndices.set([]);
      match = this._activeState()!;
    }

    await this.performFinishTurn(match);
  }

  // Ticks the AI's selection up one die at a time, pausing before the first
  // pick (time to look at the roll) and after every pick including the last
  // (time to see the finished selection before it submits) - so a human
  // watching can actually follow it, rather than the whole selection
  // appearing at once right before it submits.
  private async revealAiSelection(indices: number[]): Promise<void> {
    this._isInputLocked.set(true);
    this._selectedIndices.set([]);
    await this.wait(AI_THINKING_DELAY_MS);
    for (const index of indices) {
      this._selectedIndices.update((current) => [...current, index]);
      await this.wait(AI_THINKING_DELAY_MS);
    }
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
