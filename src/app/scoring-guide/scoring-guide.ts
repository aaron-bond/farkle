import { Component, input } from '@angular/core';
import { PIP_LAYOUTS } from '../die/die.js';

// Static quick-reference of the scoring table (mirrors src/core/scoringRules.ts).
// Each row carries an example roll, drawn as tiny dice - a picture of
// 1-2-3-4-5 reads faster than the text "1-2-3-4-5". Shown permanently in the
// desktop sidebar, where there's room for it, and as the Rules sheet's
// first tab everywhere.
const SCORING_ROWS: { name: string; points: string; dice: number[] }[] = [
  { name: 'Single 1', points: '100', dice: [1] },
  { name: 'Single 5', points: '50', dice: [5] },
  { name: 'Three 1s', points: '1,000', dice: [1, 1, 1] },
  { name: 'Three of 2–6', points: 'face × 100', dice: [4, 4, 4] },
  { name: 'Low straight', points: '500', dice: [1, 2, 3, 4, 5] },
  { name: 'High straight', points: '750', dice: [2, 3, 4, 5, 6] },
  { name: 'Full straight', points: '1,500', dice: [1, 2, 3, 4, 5, 6] },
];

@Component({
  selector: 'app-scoring-guide',
  host: { '[class.bare]': '!heading()' },
  template: `
    @if (heading()) {
      <h2>Scoring</h2>
    }
    <dl>
      @for (row of rows; track row.name) {
        <div class="row">
          <span class="dice" aria-hidden="true">
            @for (value of row.dice; track $index) {
              <span class="mini-die">
                @for (pip of pips(value); track $index) {
                  <span class="pip" [style.top.%]="pip.top" [style.left.%]="pip.left"></span>
                }
              </span>
            }
          </span>
          <dt>{{ row.name }}</dt>
          <dd>{{ row.points }}</dd>
        </div>
      }
    </dl>
    <p>Each die past three of a kind doubles it: four 3s = 600, five 3s = 1,200.</p>
  `,
  styles: `
    :host {
      display: block;
      padding: 20px;
      border-radius: 20px;
      background: rgba(0, 0, 0, 0.25);
    }
    :host(.bare) {
      padding: 0;
      background: none;
    }
    h2 {
      margin: 0 0 8px;
      font: 400 1.4rem var(--font-display);
      color: var(--brass);
    }
    dl {
      margin: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 4px 12px;
      padding: 9px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.9rem;
    }
    .dice {
      grid-column: 1 / -1;
      display: flex;
      gap: 3px;
    }
    .mini-die {
      position: relative;
      width: 20px;
      height: 20px;
      border-radius: 5px;
      background: linear-gradient(145deg, #fffaf0, #ddd2b4);
    }
    .pip {
      position: absolute;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: #a3241f;
    }
    dt {
      color: var(--text-soft);
    }
    dd {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.15rem;
      color: var(--brass);
    }
    p {
      margin: 12px 0 0;
      font-size: 0.8rem;
      line-height: 1.4;
      color: var(--text-muted);
    }
  `,
})
export class ScoringGuide {
  // Off when embedded somewhere that already titles it (the Rules sheet's
  // "Scoring" tab) - also drops the panel framing there.
  readonly heading = input(true);

  readonly rows = SCORING_ROWS;

  pips(value: number): { top: number; left: number }[] {
    return PIP_LAYOUTS[value] ?? [];
  }
}
