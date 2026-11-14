import { describe, expect, it } from 'vitest';
import { clearWordGoal, parseWordGoals, renameWordGoal, setWordGoal, wordGoalProgress } from './wordGoals';

describe('word goals', () => {
  it('sets and changes a goal for a document', () => {
    const goals = setWordGoal(setWordGoal({}, 'c:\\a.md', 500), 'c:\\a.md', 800);

    expect(goals).toEqual({ 'c:\\a.md': 800 });
  });

  it.each([0, -5, 2.5, 1_000_001, Number.NaN])('goal %s is refused', (goal) => {
    const goals = { 'c:\\a.md': 500 };

    expect(setWordGoal(goals, 'c:\\a.md', goal)).toBe(goals);
  });

  it('clears a goal', () => {
    expect(clearWordGoal({ 'c:\\a.md': 500, 'c:\\b.md': 10 }, 'c:\\a.md')).toEqual({ 'c:\\b.md': 10 });
  });

  it('goal follows Save As', () => {
    expect(renameWordGoal({ 'c:\\untitled-1.md': 300 }, 'c:\\untitled-1.md', 'c:\\essay.md')).toEqual({
      'c:\\essay.md': 300,
    });
  });

  it('reads saved goals and drops bad ones', () => {
    expect(parseWordGoals({ 'c:\\a.md': 500, 'c:\\b.md': 0, 'c:\\c.md': 'many' })).toEqual({
      'c:\\a.md': 500,
    });
    expect(parseWordGoals('nonsense')).toEqual({});
  });

  it('progress reports percentage capped at 100', () => {
    expect(wordGoalProgress(250, 1000)).toEqual({ words: 250, goal: 1000, percent: 25, isReached: false });
    expect(wordGoalProgress(1500, 1000)).toMatchObject({ percent: 100, isReached: true });
  });
});
