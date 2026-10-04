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

// A goal's logged sets, one group per day, newest day first; each day's sets in the
// order they were done. For the History list on Goals.
export function setHistory(state: CoachState, goalId: string): { date: string; sets: LogEntry[] }[] {
  const byDay = new Map<string, LogEntry[]>();
  for (const entry of state.entries) {
    if (entry.goalId !== goalId) continue;
    const list = byDay.get(entry.date) ?? [];
    list.push(entry);
    byDay.set(entry.date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, sets]) => ({ date, sets: sets.sort((a, b) => a.loggedAt - b.loggedAt) }));
}

// The biggest set logged for a goal, or 0 with none.
export function bestLoggedSet(state: CoachState, goalId: string): number {
  return state.entries.reduce((best, e) => (e.goalId === goalId && e.value > best ? e.value : best), 0);
}

// The set a record goal's number comes from: the earliest one of that size. Null if
// none matches (a record from before sets were logged, or one that no longer has a
// set behind it).
export function recordSet(goal: Goal, state: CoachState): LogEntry | null {
  if (goal.type !== 'best' || goal.current <= 0) return null;
  const matching = state.entries.filter((e) => e.goalId === goal.id && e.value === goal.current);
  if (matching.length === 0) return null;
  return matching.reduce((a, b) => (b.date < a.date || (b.date === a.date && b.loggedAt < a.loggedAt) ? b : a));
}
