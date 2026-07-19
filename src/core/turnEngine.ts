import { evaluateSelection, hasAnyScore } from './scoringEngine.js';

export type TurnState =
  | { phase: 'ready'; turnScore: number; diceToRoll: number; isHotDice: boolean }
  | { phase: 'awaitingSelection'; turnScore: number; rolledDice: number[] }
  | { phase: 'busted'; turnScore: 0 }
  | { phase: 'banked'; turnScore: number };

export function startTurn(): Extract<TurnState, { phase: 'ready' }> {
  return { phase: 'ready', turnScore: 0, diceToRoll: 6, isHotDice: false };
}

export function roll(
  state: Extract<TurnState, { phase: 'ready' }>,
  rolledDice: number[],
): TurnState {
  if (!hasAnyScore(rolledDice)) {
    return { phase: 'busted', turnScore: 0 };
  }
  return { phase: 'awaitingSelection', turnScore: state.turnScore, rolledDice };
}

export function selectDice(
  state: Extract<TurnState, { phase: 'awaitingSelection' }>,
  selectedIndices: number[],
): Extract<TurnState, { phase: 'ready' }> | null {
  if (selectedIndices.length === 0) return null;

  const uniqueIndices = new Set(selectedIndices);
  if (uniqueIndices.size !== selectedIndices.length) return null;
  if (selectedIndices.some((i) => i < 0 || i >= state.rolledDice.length)) return null;

  const selectedValues = selectedIndices.map((i) => state.rolledDice[i]!);
  const result = evaluateSelection(selectedValues);
  if (!result.isValid) return null;

  const turnScore = state.turnScore + result.score;
  const leftover = state.rolledDice.length - selectedIndices.length;
  const isHotDice = leftover === 0;
  const diceToRoll = isHotDice ? 6 : leftover;

  return { phase: 'ready', turnScore, diceToRoll, isHotDice };
}

export function bank(state: Extract<TurnState, { phase: 'ready' }>): Extract<TurnState, { phase: 'banked' }> {
  return { phase: 'banked', turnScore: state.turnScore };
}
