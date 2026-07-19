import { startTurn, type TurnState } from './turnEngine.js';

export type PlayerId = 'human' | 'ai';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_TARGET_SCORES: Record<Difficulty, number> = {
  easy: 1500,
  medium: 3000,
  hard: 5000,
};

export interface MatchState {
  turnState: TurnState;
  playerTotalScore: number;
  aiTotalScore: number;
  activePlayer: PlayerId;
  targetScore: number;
  winner: PlayerId | null;
}

export function startMatch(difficulty: Difficulty, startingPlayer: PlayerId = 'human'): MatchState {
  return {
    turnState: startTurn(),
    playerTotalScore: 0,
    aiTotalScore: 0,
    activePlayer: startingPlayer,
    targetScore: DIFFICULTY_TARGET_SCORES[difficulty],
    winner: null,
  };
}

export function advanceTurn(match: MatchState, turnState: TurnState): MatchState {
  if (match.winner) return match;

  if (turnState.phase === 'ready' || turnState.phase === 'awaitingSelection') {
    return { ...match, turnState };
  }

  const bankedScore = turnState.phase === 'banked' ? turnState.turnScore : 0;
  const isHumanTurn = match.activePlayer === 'human';
  const playerTotalScore = isHumanTurn ? match.playerTotalScore + bankedScore : match.playerTotalScore;
  const aiTotalScore = isHumanTurn ? match.aiTotalScore : match.aiTotalScore + bankedScore;

  const winner: PlayerId | null =
    playerTotalScore >= match.targetScore ? 'human' : aiTotalScore >= match.targetScore ? 'ai' : null;

  if (winner) {
    return { ...match, turnState, playerTotalScore, aiTotalScore, winner };
  }

  return {
    turnState: startTurn(),
    playerTotalScore,
    aiTotalScore,
    activePlayer: isHumanTurn ? 'ai' : 'human',
    targetScore: match.targetScore,
    winner: null,
  };
}
