import { describe, expect, it } from 'vitest';
import { evaluateSelection } from './scoringEngine.js';

describe('evaluateSelection', () => {
  it('scores a single 1 and single 5', () => {
    expect(evaluateSelection([1])).toEqual({ isValid: true, score: 100 });
    expect(evaluateSelection([5])).toEqual({ isValid: true, score: 50 });
  });

  it('scores two loose 1s as 200, not a special pair bonus', () => {
    expect(evaluateSelection([1, 1])).toEqual({ isValid: true, score: 200 });
  });

  it('scores three-of-a-kind at the base value', () => {
    expect(evaluateSelection([1, 1, 1])).toEqual({ isValid: true, score: 1000 });
    expect(evaluateSelection([2, 2, 2])).toEqual({ isValid: true, score: 200 });
    expect(evaluateSelection([6, 6, 6])).toEqual({ isValid: true, score: 600 });
  });

  it('doubles per additional die beyond three-of-a-kind, grouping the full run', () => {
    expect(evaluateSelection([2, 2, 2, 2])).toEqual({ isValid: true, score: 400 });
    expect(evaluateSelection([2, 2, 2, 2, 2])).toEqual({ isValid: true, score: 800 });
    expect(evaluateSelection([2, 2, 2, 2, 2, 2])).toEqual({ isValid: true, score: 1600 });
  });

  it('the canonical Milestone 1 test case: five 1s plus a single 5', () => {
    expect(evaluateSelection([1, 1, 1, 1, 1, 5])).toEqual({ isValid: true, score: 4050 });
  });

  it('scores the low, high, and full straights', () => {
    expect(evaluateSelection([1, 2, 3, 4, 5])).toEqual({ isValid: true, score: 500 });
    expect(evaluateSelection([2, 3, 4, 5, 6])).toEqual({ isValid: true, score: 750 });
    expect(evaluateSelection([1, 2, 3, 4, 5, 6])).toEqual({ isValid: true, score: 1500 });
  });

  it('scores a straight plus a leftover scoring die from a duplicate', () => {
    expect(evaluateSelection([1, 2, 3, 4, 5, 5])).toEqual({ isValid: true, score: 550 });
  });

  it('scores independent triples of different values in the same selection', () => {
    expect(evaluateSelection([1, 1, 1, 2, 2, 2])).toEqual({ isValid: true, score: 1200 });
  });

  it('rejects a selection containing a die that cannot score on its own', () => {
    expect(evaluateSelection([2, 3, 4])).toEqual({ isValid: false, score: 0 });
  });

  it('rejects a straight submitted alongside an un-scorable extra die', () => {
    expect(evaluateSelection([2, 3, 4, 5, 6, 6])).toEqual({ isValid: false, score: 0 });
  });

  it('rejects an empty selection', () => {
    expect(evaluateSelection([])).toEqual({ isValid: false, score: 0 });
  });
});
