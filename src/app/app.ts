import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import type { Difficulty } from '../core/match.js';
import { evaluateSelection } from '../core/scoringEngine.js';
import { Die } from './die/die.js';
import { GameService } from './game.service.js';
import { Landing } from './landing/landing.js';
import { RulesSheet } from './rules-sheet/rules-sheet.js';
import { Scoreboard } from './scoreboard/scoreboard.js';
import { ScoringGuide } from './scoring-guide/scoring-guide.js';

@Component({
  selector: 'app-root',
  imports: [DecimalPipe, Die, Landing, RulesSheet, Scoreboard, ScoringGuide],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    // The wood texture now only dresses the table's rim (see .table in
    // app.css), handed over as a custom property. Bound from the component
    // rather than a static CSS url() for the same reason as before: a
    // relative url() in a component stylesheet gets resolved by the build as
    // a source-relative file import and fails, while an absolute one
    // ("/Wood_...") would ignore <base href> and break under GitHub Pages'
    // /farkle/ subpath. A url() set inline resolves against the document's
    // base instead, and the custom property carries it down unchanged.
    '[style.--wood-texture]': 'woodTextureUrl',
  },
})
export class App {
  private readonly game = inject(GameService);

  readonly woodTextureUrl = "url('Wood_Surface-base.png')";

  readonly activeState = this.game.activeState;
  readonly isInputLocked = this.game.isInputLocked;
  readonly selectedIndices = this.game.selectedIndices;
  readonly pendingResume = this.game.pendingResume;
  readonly rollGeneration = this.game.rollGeneration;

  readonly turnState = computed(() => this.activeState()?.turnState ?? null);
  readonly phase = computed(() => this.turnState()?.phase ?? null);
  readonly turnScore = computed(() => this.turnState()?.turnScore ?? 0);
  readonly diceToRoll = computed(() => {
    const t = this.turnState();
    return t?.phase === 'ready' ? t.diceToRoll : 0;
  });
  // Covers both the interactive selection screen and the busted display below -
  // a bust still carries the dice that caused it, so the player can see why.
  readonly rolledDice = computed(() => {
    const t = this.turnState();
    if (t?.phase === 'awaitingSelection' || t?.phase === 'busted') return t.rolledDice;
    return [];
  });
  // Dimmed stand-in dice shown before the first roll of a turn, so the board
  // never sits on the old dice-less "Roll 6 dice" button-only screen.
  readonly placeholderDice = computed(() => new Array(this.diceToRoll()).fill(6));
  // The AI drives its own turn automatically - no action buttons apply to it.
  readonly isHumanTurn = computed(() => this.activeState()?.activePlayer === 'human');

  // Live preview of the current selection, evaluated with the same engine
  // call selectDice() will use on submit - so "+400" / "Doesn't score" is
  // shown while picking instead of only as an error after pressing a button.
  // Also drives the AI's turn, since its picks go through selectedIndices too.
  readonly selection = computed(() => {
    const indices = this.selectedIndices();
    if (this.phase() !== 'awaitingSelection' || indices.length === 0) return null;
    const dice = this.rolledDice();
    return evaluateSelection(indices.map((i) => dice[i]!));
  });
  readonly selectionInvalid = computed(() => this.selection()?.isValid === false);
  // Everything that a Farkle on the next roll would wipe out.
  readonly atRisk = computed(() => this.turnScore() + (this.selection()?.score ?? 0));

  readonly diceAfterSelection = computed(() => {
    const leftover = this.rolledDice().length - this.selectedIndices().length;
    return leftover === 0 ? 6 : leftover;
  });
  readonly isHotDiceSelection = computed(
    () => this.selection()?.isValid === true && this.selectedIndices().length === this.rolledDice().length,
  );
  readonly canRollAgain = computed(() => this.selection()?.isValid === true);
  readonly canBank = computed(() => !this.selectionInvalid());

  // A bust resets turnScore to 0, so by the time the 'busted' state arrives
  // the amount that was lost is gone from the match state. Remember the last
  // at-risk total seen while selecting, purely so the Farkle screen can say
  // what it cost.
  readonly lostScore = signal(0);

  readonly selectionError = signal<string | null>(null);
  readonly showRules = signal(false);

  constructor() {
    effect(() => {
      const phase = this.phase();
      if (phase === 'awaitingSelection') this.lostScore.set(this.atRisk());
      else if (phase === 'ready') this.lostScore.set(this.turnScore());
    });
  }

  diceLabel(count: number): string {
    return count === 1 ? '1 die' : `${count} dice`;
  }

  openRules(): void {
    this.showRules.set(true);
  }

  closeRules(): void {
    this.showRules.set(false);
  }

  // The start screen offers a saved game inline rather than in a blocking
  // prompt, so picking a new table instead is what declines it.
  startGame(difficulty: Difficulty): void {
    if (this.pendingResume()) this.game.discardSavedGame();
    this.game.startGame(difficulty);
  }

  resumeSavedGame(): void {
    this.game.resumeSavedGame();
  }

  discardSavedGame(): void {
    this.game.discardSavedGame();
  }

  resetGame(): void {
    this.selectionError.set(null);
    this.game.resetGame();
  }

  leaveTable(): void {
    this.selectionError.set(null);
    this.game.leaveTable();
  }

  toggleDieSelection(index: number): void {
    this.selectionError.set(null);
    this.game.toggleDieSelection(index);
  }

  async rollDice(): Promise<void> {
    await this.game.rollDice();
  }

  async rollAgain(): Promise<void> {
    this.selectionError.set(null);
    const accepted = await this.game.rollAgain();
    if (!accepted) {
      this.selectionError.set('That selection does not score - choose a different combination.');
    }
  }

  async pass(): Promise<void> {
    this.selectionError.set(null);
    const accepted = await this.game.pass();
    if (!accepted) {
      this.selectionError.set('That selection does not score - choose a different combination.');
    }
  }
}
