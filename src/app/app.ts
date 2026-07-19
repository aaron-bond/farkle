import { Component, computed, inject, signal } from '@angular/core';
import type { Difficulty } from '../core/match.js';
import { GameService } from './game.service.js';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly game = inject(GameService);

  readonly activeState = this.game.activeState;
  readonly isInputLocked = this.game.isInputLocked;

  readonly turnState = computed(() => this.activeState()?.turnState ?? null);
  readonly phase = computed(() => this.turnState()?.phase ?? null);
  readonly turnScore = computed(() => this.turnState()?.turnScore ?? 0);
  readonly diceToRoll = computed(() => {
    const t = this.turnState();
    return t?.phase === 'ready' ? t.diceToRoll : 0;
  });
  readonly rolledDice = computed(() => {
    const t = this.turnState();
    return t?.phase === 'awaitingSelection' ? t.rolledDice : [];
  });

  readonly selectedIndices = signal<number[]>([]);
  readonly selectionError = signal<string | null>(null);

  startGame(difficulty: Difficulty): void {
    this.game.startGame(difficulty);
  }

  resetGame(): void {
    this.selectedIndices.set([]);
    this.selectionError.set(null);
    this.game.resetGame();
  }

  toggleDieSelection(index: number): void {
    const current = this.selectedIndices();
    this.selectedIndices.set(current.includes(index) ? current.filter((i) => i !== index) : [...current, index]);
  }

  async rollDice(): Promise<void> {
    await this.game.rollDice();
  }

  async rollAgain(): Promise<void> {
    this.selectionError.set(null);
    const accepted = await this.game.rollAgain(this.selectedIndices());
    if (!accepted) {
      this.selectionError.set('That selection does not score - choose a different combination.');
      return;
    }
    this.selectedIndices.set([]);
  }

  async pass(): Promise<void> {
    this.selectionError.set(null);
    const accepted = await this.game.pass(this.selectedIndices());
    if (!accepted) {
      this.selectionError.set('That selection does not score - choose a different combination.');
      return;
    }
    this.selectedIndices.set([]);
  }

  async finishTurn(): Promise<void> {
    await this.game.finishTurn();
  }
}
