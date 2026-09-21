import { addDays, daysBetween, startOfWeek, weekdayIndex } from './days';
import type { Goal, LogEntry } from './store';

export interface DayActivity {
  key: string;
  letter: string;
  total: number;
  isToday: boolean;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Every value logged for `date`, in the order they were logged (oldest first) — a
// best-result goal's individual sets for that day, e.g. [20, 15, 10].
export function setsOnDay(entries: LogEntry[], date: string): number[] {
  return entries.filter((e) => e.date === date).map((e) => e.value);
}

// Oldest first, ending with today. Values on the same day are added together.
export function last7Days(entries: LogEntry[], todayKey: string): DayActivity[] {
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.date, (totals.get(e.date) ?? 0) + e.value);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(todayKey, i - 6);
    return { key, letter: DAY_LETTERS[weekdayIndex(key)], total: totals.get(key) ?? 0, isToday: i === 6 };
  });
}

// Consecutive active days counting back from today. If today isn't logged yet,
// the count starts from yesterday so the streak isn't shown as broken until the day ends.
export function currentStreak(entries: LogEntry[], todayKey: string): number {
  const active = new Set(entries.filter((e) => e.value > 0).map((e) => e.date));
  let day = active.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (active.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export type DeadlineStatus =
  | { kind: 'unset' }
  | { kind: 'upcoming'; daysLeft: number }
  | { kind: 'passed'; daysOver: number };

export function deadlineStatus(deadline: string | null, todayKey: string): DeadlineStatus {
  if (!deadline) return { kind: 'unset' };
  const days = daysBetween(todayKey, deadline);
  return days >= 0 ? { kind: 'upcoming', daysLeft: days } : { kind: 'passed', daysOver: -days };
}

export function goalProgress(goal: Goal): { percent: number; done: boolean } {
  const percent = Math.max(0, Math.min(100, Math.floor((goal.current / goal.target) * 100)));
  return { percent, done: goal.current >= goal.target };
}

// The longest run of consecutive logged days anywhere in the history.
export function longestStreak(entries: LogEntry[]): number {
  const active = Array.from(new Set(entries.filter((e) => e.value > 0).map((e) => e.date))).sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < active.length; i++) {
    run = i > 0 && daysBetween(active[i - 1], active[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// --- activity heatmap

export interface HeatmapDay {
  key: string;
  total: number;
  note: string;
  // 0 = nothing logged; 1..HEATMAP_LEVELS is the day's share of the best day in range.
  level: number;
  isToday: boolean;
  future: boolean; // a later day of the current week: drawn blank so the last column stays aligned
}

export interface Heatmap {
  weeks: HeatmapDay[][]; // columns, oldest first; each column runs Monday..Sunday
  max: number; // best single day in range, 0 when nothing was logged
  activeDays: number;
  totalDays: number; // days in range up to and including today
}

export const HEATMAP_WEEKS = 13; // ~3 months, one column per week
export const HEATMAP_LEVELS = 4;

// Whole weeks ending with the one containing today, so every column is Monday..Sunday.
// Values logged on the same day are added together, and their notes joined.
export function activityHeatmap(entries: LogEntry[], todayKey: string, weeks = HEATMAP_WEEKS): Heatmap {
  const totals = new Map<string, number>();
  const notes = new Map<string, string[]>();
  for (const e of entries) {
    totals.set(e.date, (totals.get(e.date) ?? 0) + e.value);
    const note = e.note.trim();
    if (note) notes.set(e.date, [...(notes.get(e.date) ?? []), note]);
  }

  const start = addDays(startOfWeek(todayKey), -(weeks - 1) * 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const past = days.filter((key) => key <= todayKey);
  const max = Math.max(0, ...past.map((key) => totals.get(key) ?? 0));

  const cells = days.map((key): HeatmapDay => {
    const future = key > todayKey;
    const total = future ? 0 : (totals.get(key) ?? 0);
    return {
      key,
      total,
      note: future ? '' : (notes.get(key) ?? []).join(' · '),
      level: total > 0 && max > 0 ? Math.min(HEATMAP_LEVELS, Math.ceil((total / max) * HEATMAP_LEVELS)) : 0,
      isToday: key === todayKey,
      future,
    };
  });

  return {
    weeks: Array.from({ length: weeks }, (_, w) => cells.slice(w * 7, w * 7 + 7)),
    max,
    activeDays: past.filter((key) => (totals.get(key) ?? 0) > 0).length,
    totalDays: past.length,
  };
}
