import { Component, ElementRef, afterNextRender, output, signal, viewChild } from '@angular/core';
import { ScoringGuide } from '../scoring-guide/scoring-guide.js';

type RulesTab = 'scoring' | 'how';

const HOW_TO_PLAY: { title: string; body: string }[] = [
  { title: 'Roll six dice', body: 'Roll all 6 dice to start your turn.' },
  {
    title: 'Keep at least one scorer',
    body: "You must set aside at least one scoring die from every roll before you're allowed to roll again.",
  },
  {
    title: 'Roll again or bank',
    body: "Roll again to re-roll what's left and risk it, or bank your turn score and end your turn.",
  },
  {
    title: 'Hot dice',
    body: 'Use up all 6 dice and you get to roll all 6 fresh again, keeping your turn score.',
  },
  {
    title: 'Farkle',
    body: 'Roll with no scoring dice at all and you lose everything banked so far this turn - not just the bad roll, the whole turn.',
  },
  {
    title: 'Winning',
    body: "First to bank at or past the target wins immediately - there's no final round for the other player.",
  },
  {
    title: 'Difficulty',
    body: 'Easy 1,500 / Medium 3,000 / Hard 5,000. Higher difficulty also makes the dealer play more aggressively.',
  },
];

// The Rules sheet: slides up from the bottom on phones, sits centered on
// desktop. Built on a native <dialog> opened with showModal(), which gives
// focus trapping, Escape-to-close and inertness of the page behind it for
// free - none of which the old hand-rolled backdrop/flip-card modal had.
// The parent only decides whether this exists; it reports back via `closed`
// however the dialog was dismissed (button, Escape, or a backdrop click).
@Component({
  selector: 'app-rules-sheet',
  imports: [ScoringGuide],
  templateUrl: './rules-sheet.html',
  styleUrl: './rules-sheet.css',
})
export class RulesSheet {
  readonly closed = output<void>();

  readonly tab = signal<RulesTab>('scoring');
  readonly steps = HOW_TO_PLAY;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  // The dialog element itself only receives the click directly when it lands
  // on its ::backdrop - every visible part of the sheet is a child element.
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
