import { Component, computed, inject, signal } from '@angular/core';
import type { Difficulty } from '../core/match.js';
import { Die } from './die/die.js';
import { GameService } from './game.service.js';

@Component({
  selector: 'app-root',
  imports: [Die],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly game = inject(GameService);

  readonly activeState = this.game.activeState;
  readonly isInputLocked = this.game.isInputLocked;
  readonly selectedIndices = this.game.selectedIndices;

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

  readonly selectionError = signal<string | null>(null);
  readonly rollGeneration = signal(0);

  startGame(difficulty: Difficulty): void {
    this.game.startGame(difficulty);
  }

  resetGame(): void {
    this.selectionError.set(null);
    this.game.resetGame();
  }

  toggleDieSelection(index: number): void {
    this.game.toggleDieSelection(index);
  }

  async rollDice(): Promise<void> {
    await this.game.rollDice();
    this.rollGeneration.update((n) => n + 1);
  }

  async rollAgain(): Promise<void> {
    this.selectionError.set(null);
    const accepted = await this.game.rollAgain();
    if (!accepted) {
      this.selectionError.set('That selection does not score - choose a different combination.');
      return;
    }
    this.rollGeneration.update((n) => n + 1);
  }

  async pass(): Promise<void> {
    this.selectionError.set(null);
    const accepted = await this.game.pass();
    if (!accepted) {
      this.selectionError.set('That selection does not score - choose a different combination.');
    }
  }

  async finishTurn(): Promise<void> {
    await this.game.finishTurn();
  }
}
