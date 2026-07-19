import { Component, computed, input, output } from '@angular/core';

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
  // Bumped by the parent on every roll, even when the resulting value repeats,
  // so the cube always visibly spins a full extra turn instead of sitting
  // still whenever a re-roll happens to land on the same face as before.
  readonly spin = input(0);
  readonly toggle = output<void>();

  readonly cubeTransform = computed(() => {
    const rotation = FACE_ROTATIONS[this.value()] ?? { x: 0, y: 0 };
    const extraTurns = this.spin() * 360;
    return `rotateX(${rotation.x + extraTurns}deg) rotateY(${rotation.y + extraTurns}deg)`;
  });

  onClick(): void {
    if (this.disabled()) return;
    this.toggle.emit();
  }
}
