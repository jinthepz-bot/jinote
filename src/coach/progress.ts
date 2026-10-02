import { formatAmount } from './format';
import type { CoachState, Goal, GoalType, LogEntry } from './store';

// Two readings of the same sets. A set logged once counts toward both:
// - the record: the most done in one set (a "best" goal's number), and
// - the day's volume: everything logged today, across all sets.

// A goal's sets on one day, in the order they were done.
export function setsOn(state: CoachState, goalId: string, date: string): LogEntry[] {
  return state.entries.filter((e) => e.goalId === goalId && e.date === date).sort((a, b) => a.loggedAt - b.loggedAt);
}

export function dayTotal(sets: LogEntry[]): number {
  return Math.round(sets.reduce((sum, e) => sum + e.value, 0) * 100) / 100;
}

// The number a goal's progress is measured by: the best single set, today's total,
// or the running total.
export function goalValue(goal: Goal, state: CoachState, todayKey: string): number {
  return goal.type === 'daily' ? dayTotal(setsOn(state, goal.id, todayKey)) : goal.current;
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  best: 'Best single set',
  daily: 'Daily total',
  cumulative: 'Running total',
};

// What the number is, after it: "30 of 100 in one set", "50 of 100 today".
export function valueCaption(goal: Goal): string {
  const target = formatAmount(goal.target);
  if (goal.type === 'best') return `of ${target} in one set`;
  if (goal.type === 'daily') return `of ${target} today`;
  return `of ${target}`;
}
