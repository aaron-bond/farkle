import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { Difficulty, PlayerId } from '../../core/match.js';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

@Component({
  selector: 'app-scoreboard',
  imports: [DecimalPipe],
  templateUrl: './scoreboard.html',
  styleUrl: './scoreboard.css',
})
export class Scoreboard {
  readonly playerScore = input.required<number>();
  readonly aiScore = input.required<number>();
  readonly targetScore = input.required<number>();
  readonly difficulty = input.required<Difficulty>();
  readonly activePlayer = input.required<PlayerId>();
  // The active player's unbanked turn score. Drawn as a striped "ghost"
  // extension of their progress bar, so the bank-or-push decision can be
  // read against the race to the target rather than as a bare number.
  readonly pendingScore = input(0);

  readonly difficultyLabel = computed(() => DIFFICULTY_LABELS[this.difficulty()]);

  readonly playerPct = computed(() => this.pct(this.playerScore()));
  readonly aiPct = computed(() => this.pct(this.aiScore()));
  readonly playerGhostPct = computed(() => this.ghostPct('human', this.playerScore()));
  readonly aiGhostPct = computed(() => this.ghostPct('ai', this.aiScore()));

  private ghostPct(player: PlayerId, banked: number): number {
    if (this.activePlayer() !== player || this.pendingScore() <= 0) return 0;
    return this.pct(banked + this.pendingScore()) - this.pct(banked);
  }

  private pct(score: number): number {
    const target = this.targetScore();
    return target > 0 ? Math.min(100, (score / target) * 100) : 0;
  }
}
