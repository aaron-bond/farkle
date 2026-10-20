import { DecimalPipe } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { DIFFICULTY_TARGET_SCORES, type Difficulty, type MatchState } from '../../core/match.js';
import { Die } from '../die/die.js';

const TABLES: { difficulty: Difficulty; name: string; description: string }[] = [
  { difficulty: 'easy', name: 'Easy', description: 'The dealer plays it safe' },
  { difficulty: 'medium', name: 'Medium', description: 'Even odds, steady nerves' },
  { difficulty: 'hard', name: 'Hard', description: 'The dealer presses its luck' },
];

// Start screen. A saved game in progress is offered inline as a "Resume" card
// above the difficulty choice, replacing the old blocking "Continue Saved
// Game?" modal - starting a new table instead is the implicit "no thanks".
@Component({
  selector: 'app-landing',
  imports: [DecimalPipe, Die],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  readonly savedGame = input<MatchState | null>(null);

  readonly start = output<Difficulty>();
  readonly resume = output<void>();
  readonly openRules = output<void>();

  readonly tables = TABLES.map((t) => ({ ...t, target: DIFFICULTY_TARGET_SCORES[t.difficulty] }));
  readonly chosen = signal<Difficulty>('medium');

  tableName(difficulty: Difficulty): string {
    return TABLES.find((t) => t.difficulty === difficulty)!.name;
  }
}
