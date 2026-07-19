export interface Die {
  id: string;
  value: number;
  isLocked: boolean;
  isSelected: boolean;
}

export interface MatchResult {
  isValid: boolean;
  score: number;
  usedIndices: number[];
  remainingDice: number[];
}

export interface ScoringRule {
  name: string;
  priority: number;
  evaluate: (diceValues: number[]) => MatchResult | null;
}
