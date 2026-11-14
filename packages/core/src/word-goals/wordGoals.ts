import { isRecord } from '../session/savedValues';

/** Word goals by canonical document key; they live in app data and never in the document. */
export type WordGoals = Readonly<Record<string, number>>;

export const MAX_WORD_GOAL = 1_000_000;
const MAX_SAVED_GOALS = 1_000;
const PERCENT = 100;

export function isValidWordGoal(goal: number): boolean {
  return Number.isInteger(goal) && goal > 0 && goal <= MAX_WORD_GOAL;
}

/** Reads saved goals, dropping any that are not whole numbers in range. */
export function parseWordGoals(saved: unknown): WordGoals {
  if (!isRecord(saved)) return {};
  const validGoals = Object.entries(saved).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && isValidWordGoal(entry[1]),
  );
  return Object.fromEntries(validGoals.slice(0, MAX_SAVED_GOALS));
}

/** Sets a goal; a goal that is not a whole number from 1 to a million leaves the goals as they are. */
export function setWordGoal(goals: WordGoals, canonicalKey: string, goal: number): WordGoals {
  return isValidWordGoal(goal) ? { ...goals, [canonicalKey]: goal } : goals;
}

export function clearWordGoal(goals: WordGoals, canonicalKey: string): WordGoals {
  if (!Object.hasOwn(goals, canonicalKey)) return goals;
  return Object.fromEntries(Object.entries(goals).filter(([key]) => key !== canonicalKey));
}

/** A document saved under a new name keeps its goal. */
export function renameWordGoal(goals: WordGoals, fromKey: string, toKey: string): WordGoals {
  const goal = Object.hasOwn(goals, fromKey) ? goals[fromKey] : undefined;
  if (goal === undefined || fromKey === toKey) return goals;
  return { ...clearWordGoal(goals, fromKey), [toKey]: goal };
}

export interface WordGoalProgress {
  readonly words: number;
  readonly goal: number;
  /** From 0 to 100; writing past the goal stays at 100. */
  readonly percent: number;
  readonly isReached: boolean;
}

export function wordGoalProgress(words: number, goal: number): WordGoalProgress {
  return {
    words,
    goal,
    percent: Math.min(PERCENT, Math.floor((words / goal) * PERCENT)),
    isReached: words >= goal,
  };
}
