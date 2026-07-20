import { Component, afterNextRender, computed, input, output, signal } from '@angular/core';

// Standard opposite-faces-sum-to-7 layout: front=1/back=6, right=2/left=5, top=3/bottom=4.
// The cube itself is never rebuilt per value - only rotated so the correct
// physical face ends up pointing at the viewer.
const FACE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  2: { x: 0, y: -90 },
  5: { x: 0, y: 90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
};

// The die-face images live in public/dice/ (runtime static assets), not
// alongside this component's source, so the url() can't be a static CSS
// reference: an absolute path ("/dice/...") ignores <base href> entirely and
// breaks under GitHub Pages' /farkle/ subpath, while a relative CSS path gets
// resolved by the build as a source-relative file import and fails outright.
// Binding it from the component instead sidesteps both: the string is built
// at runtime and resolved by the browser against the document's <base href>.
const FACE_LAYOUT: { cssClass: string; value: number }[] = [
  { cssClass: 'face-front', value: 1 },
  { cssClass: 'face-back', value: 6 },
  { cssClass: 'face-right', value: 2 },
  { cssClass: 'face-left', value: 5 },
  { cssClass: 'face-top', value: 3 },
  { cssClass: 'face-bottom', value: 4 },
];

@Component({
  selector: 'app-die',
  imports: [],
  templateUrl: './die.html',
  styleUrl: './die.css',
})
export class Die {
  readonly value = input.required<number>();
  readonly selected = input(false);
  readonly disabled = input(false);
  // Shown before the first roll of a turn, sitting in place of the old
  // dice-less "Roll 6 dice" button-only screen. Always non-interactive -
  // there's nothing real to select yet.
  readonly placeholder = input(false);
  // Bumped by the parent on every roll, even when the resulting value repeats,
  // so the cube always visibly spins a full extra turn instead of sitting
  // still whenever a re-roll happens to land on the same face as before.
  readonly spin = input(0);
  readonly toggle = output<void>();

  readonly faces = FACE_LAYOUT;

  // A CSS transition only animates an existing element's property change - a
  // freshly-created element has no "before" state to animate from, so the
  // very first die of a turn (a brand new <app-die> instance, since @switch
  // destroys/recreates the 'ready' -> 'awaitingSelection' case) would just
  // snap straight to its resting orientation with no roll. Freezing at the
  // identity rotation for the first paint, then releasing the real target
  // one frame later, gives the browser a genuine before/after to interpolate.
  private readonly hasRenderedOnce = signal(false);

  constructor() {
    // afterNextRender alone isn't enough: it can fire before the browser has
    // actually painted the frozen first frame, collapsing both states into
    // one paint and skipping the transition anyway. The double rAF forces a
    // real paint boundary in between.
    afterNextRender(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.hasRenderedOnce.set(true));
      });
    });
  }

  readonly cubeTransform = computed(() => {
    if (!this.hasRenderedOnce()) return 'rotateX(0deg) rotateY(0deg)';
    const rotation = FACE_ROTATIONS[this.value()] ?? { x: 0, y: 0 };
    const extraTurns = this.spin() * 360;
    return `rotateX(${rotation.x + extraTurns}deg) rotateY(${rotation.y + extraTurns}deg)`;
  });

  faceImage(value: number): string {
    return `url(dice/die-${value}.png)`;
  }

  onClick(): void {
    if (this.disabled()) return;
    this.toggle.emit();
  }
}
