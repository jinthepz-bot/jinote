import AsyncStorage from '@react-native-async-storage/async-storage';

import { createPersistedStore } from '../storage/persistedStore';
import { isTimeKey } from '../schedule/time';
import { isDayKey } from './days';
import { roundAmount } from './format';

export type GoalType = 'best' | 'cumulative';

export interface Goal {
  id: string;
  title: string;
  target: number;
  // "best": highest single result so far (never goes down). "cumulative": running total.
  current: number;
  type: GoalType;
  deadline: string | null; // local day, "YYYY-MM-DD"
  unit: string;
  featured: boolean; // the goal that drives the Home screen
  createdAt: number;
}

export interface LogEntry {
  id: string;
  goalId: string;
  date: string; // local day, "YYYY-MM-DD"
  value: number;
  note: string;
  loggedAt: number;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  date: string | null; // optional local day "YYYY-MM-DD"; shown on Schedule when set
  time: string | null; // optional "HH:MM", 24-hour; only meaningful alongside a date
  createdAt: number;
  // When it was checked off. null while open, and for tasks completed before this was
  // recorded (the Home "Done today" list shows those without a time).
  completedAt: number | null;
}

export interface BuyItem {
  id: string;
  name: string;
  price: number | null;
  bought: boolean;
  createdAt: number;
}

export interface CoachState {
  goals: Goal[];
  entries: LogEntry[];
  tasks: Task[];
  toBuy: BuyItem[];
}

export interface NewGoalInput {
  title: string;
  target: number;
  type: GoalType;
  deadline: string | null;
}

export const FEATURED_GOAL_ID = 'goal_pushups';

const KEY = 'jinesist.coach.v2';
const LEGACY_KEY = 'jinesist.coach.v1'; // Stage 2 format, migrated on first load and left as a backup

function featuredGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: FEATURED_GOAL_ID,
    title: '100 push-ups',
    target: 100,
    current: 0,
    type: 'best',
    deadline: null,
    unit: 'reps',
    featured: true,
    createdAt: 0,
    ...overrides,
  };
}

const emptyState = (): CoachState => ({ goals: [featuredGoal()], entries: [], tasks: [], toBuy: [] });

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function records(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}

// Accepts whatever was stored and keeps only well-formed data.
function normalize(raw: unknown): CoachState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const goals: Goal[] = [];
  for (const g of records(obj.goals)) {
    if (typeof g.id !== 'string' || goals.some((x) => x.id === g.id)) continue;
    if (typeof g.title !== 'string' || !isNum(g.target) || g.target <= 0) continue;
    goals.push({
      id: g.id,
      title: g.title,
      target: g.target,
      current: isNum(g.current) && g.current > 0 ? g.current : 0,
      type: g.type === 'cumulative' ? 'cumulative' : 'best',
      deadline: isDayKey(g.deadline) ? g.deadline : null,
      unit: str(g.unit),
      featured: g.id === FEATURED_GOAL_ID,
      createdAt: isNum(g.createdAt) ? g.createdAt : 0,
    });
  }
  const featuredIndex = goals.findIndex((g) => g.featured);
  if (featuredIndex === -1) {
    if (goals.length > 0) goals[0].featured = true;
    else goals.unshift(featuredGoal());
  } else {
    goals.unshift(...goals.splice(featuredIndex, 1)); // featured goal always first
    goals.forEach((g, index) => {
      g.featured = index === 0;
    });
  }

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const entries: LogEntry[] = [];
  for (const e of records(obj.entries)) {
    const goal = typeof e.goalId === 'string' ? goalById.get(e.goalId) : undefined;
    if (!goal || typeof e.id !== 'string' || !isDayKey(e.date) || !isNum(e.value) || e.value < 0) continue;
    const entry: LogEntry = {
      id: e.id,
      goalId: goal.id,
      date: e.date,
      value: e.value,
      note: str(e.note),
      loggedAt: isNum(e.loggedAt) ? e.loggedAt : 0,
    };
    // Best-result goals can have several entries (sets) on the same day now — they
    // all stay, so the day's total and its individual sets are still known.
    entries.push(entry);
    // A best result is never lower than any single set logged.
    if (goal.type === 'best') goal.current = Math.max(goal.current, entry.value);
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.loggedAt - b.loggedAt);

  const tasks: Task[] = records(obj.tasks)
    .filter((t) => typeof t.id === 'string' && typeof t.text === 'string')
    .map((t) => {
      const date = isDayKey(t.date) ? t.date : null;
      return {
        id: t.id as string,
        text: t.text as string,
        done: t.done === true,
        date,
        time: date && isTimeKey(t.time) ? t.time : null, // a time with no date isn't shown anywhere, so drop it
        createdAt: isNum(t.createdAt) ? t.createdAt : 0,
        completedAt: t.done === true && isNum(t.completedAt) ? t.completedAt : null,
      };
    });

  const toBuy: BuyItem[] = records(obj.toBuy)
    .filter((b) => typeof b.id === 'string' && typeof b.name === 'string')
    .map((b) => ({
      id: b.id as string,
      name: b.name as string,
      price: isNum(b.price) && b.price >= 0 ? b.price : null,
      bought: b.bought === true,
      createdAt: isNum(b.createdAt) ? b.createdAt : 0,
    }));

  return { goals, entries, tasks, toBuy };
}

// Converts Stage 2 data ({ dailyLog, bestSet, deadline, tasks }) into the featured goal.
async function migrateFromStage2(): Promise<CoachState | null> {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (raw === null) return null;
  const old = JSON.parse(raw) as Record<string, unknown>;
  return normalize({
    goals: [featuredGoal({ current: isNum(old.bestSet) ? old.bestSet : 0, deadline: isDayKey(old.deadline) ? old.deadline : null })],
    entries: records(old.dailyLog).map((e) => ({
      id: `entry_${str(e.date)}`,
      goalId: FEATURED_GOAL_ID,
      date: e.date,
      value: e.count,
      note: e.note,
      loggedAt: 0,
    })),
    tasks: old.tasks,
    toBuy: [],
  });
}

const store = createPersistedStore<CoachState>({
  key: KEY,
  initial: emptyState(),
  normalize,
  migrate: migrateFromStage2,
  label: 'goals and tasks',
});

export const coachReady = store.ready;

// Replaces everything from a backup file, through the same validation as a load.
export function importCoachState(raw: unknown) {
  store.set(normalize(raw));
}
export const getCoachState = store.get;
export const useCoach = () => store.useStore();

export function getFeaturedGoal(state: CoachState): Goal {
  return state.goals.find((g) => g.featured) ?? state.goals[0] ?? featuredGoal();
}

export function setFeaturedGoal(goalId: string) {
  store.update((s) => ({
    ...s,
    goals: s.goals.map((g) => ({ ...g, featured: g.id === goalId })),
  }));
}

export function entriesForGoal(state: CoachState, goalId: string): LogEntry[] {
  return state.entries.filter((e) => e.goalId === goalId);
}

// --- goals

// Best-result goals: each log adds a new set for that day (never overwrites an earlier
// one) and raises `current` — the best single set ever — only if this one is higher.
// Cumulative goals: adds a new entry and adds the value to the running total.
export function logProgress(
  goalId: string,
  value: number,
  note: string,
  date: string,
): { isNewBest: boolean; current: number; entryId: string } | null {
  const state = store.get();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal || !isNum(value) || value <= 0 || !isDayKey(date)) return null;

  const amount = roundAmount(value);
  const entry: LogEntry = { id: newId('entry'), goalId, date, value: amount, note: note.trim(), loggedAt: Date.now() };
  const entries = [...state.entries, entry].sort(
    (a, b) => a.date.localeCompare(b.date) || a.loggedAt - b.loggedAt,
  );

  let current: number;
  let isNewBest = false;
  if (goal.type === 'best') {
    isNewBest = amount > goal.current;
    current = Math.max(goal.current, amount);
  } else {
    current = roundAmount(goal.current + amount);
  }

  store.set({ ...state, entries, goals: state.goals.map((g) => (g.id === goalId ? { ...g, current } : g)) });
  return { isNewBest, current, entryId: entry.id };
}

// Undo for a logged set: removes the entry and puts the goal's number back. A best
// result returns to what it was before, or to a set logged since if that's higher; a
// running total just loses this amount.
export function undoLog(entryId: string, previousCurrent: number) {
  store.update((s) => {
    const entry = s.entries.find((e) => e.id === entryId);
    if (!entry) return s;
    const entries = s.entries.filter((e) => e.id !== entryId);
    const goals = s.goals.map((g) => {
      if (g.id !== entry.goalId) return g;
      const current =
        g.type === 'best'
          ? Math.max(previousCurrent, ...entries.filter((e) => e.goalId === g.id && e.loggedAt > entry.loggedAt).map((e) => e.value))
          : roundAmount(Math.max(0, g.current - entry.value));
      return { ...g, current };
    });
    return { ...s, entries, goals };
  });
}

export function createGoal(input: NewGoalInput): Goal | null {
  const title = input.title.trim();
  if (!title || !isNum(input.target) || input.target <= 0) return null;
  const goal: Goal = {
    id: newId('goal'),
    title,
    target: roundAmount(input.target),
    current: 0,
    type: input.type,
    deadline: isDayKey(input.deadline) ? input.deadline : null,
    unit: '',
    featured: false,
    createdAt: Date.now(),
  };
  store.update((s) => ({ ...s, goals: [...s.goals, goal] }));
  return goal;
}

export function setGoalDeadline(goalId: string, deadline: string | null) {
  store.update((s) => ({
    ...s,
    goals: s.goals.map((g) => (g.id === goalId ? { ...g, deadline: isDayKey(deadline) ? deadline : null } : g)),
  }));
}

// Deletes a goal and its progress history. The featured goal can't be deleted.
export function deleteGoal(goalId: string) {
  store.update((s) => {
    const goal = s.goals.find((g) => g.id === goalId);
    if (!goal || goal.featured) return s;
    return {
      ...s,
      goals: s.goals.filter((g) => g.id !== goalId),
      entries: s.entries.filter((e) => e.goalId !== goalId),
    };
  });
}

// --- tasks

export function addTask(text: string, date: string | null = null, time: string | null = null): Task | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const task: Task = {
    id: newId('task'),
    text: trimmed,
    done: false,
    date,
    time: date ? time : null, // a time with no date isn't shown anywhere, so drop it
    createdAt: Date.now(),
    completedAt: null,
  };
  store.update((s) => ({ ...s, tasks: [...s.tasks, task] }));
  return task;
}

// Undo support: puts a task back exactly as it was — replacing the current copy, or
// re-inserting it at `index` if it was deleted — so lists keep their order.
export function restoreTask(task: Task, index?: number) {
  store.update((s) => {
    const existing = s.tasks.findIndex((t) => t.id === task.id);
    if (existing !== -1) return { ...s, tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) };
    const tasks = [...s.tasks];
    tasks.splice(index ?? tasks.length, 0, task);
    return { ...s, tasks };
  });
}

// Tasks due on `date`, earliest time first, undated-time ones (a date with no
// time) first among them — the same convention an all-day item gets on a calendar.
export function tasksOnDay(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => t.date === date)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
}

export interface TaskEdit {
  text: string;
  date: string | null;
  time: string | null;
}

export function updateTask(id: string, input: TaskEdit) {
  const text = input.text.trim();
  if (!text) return;
  const date = input.date;
  const time = date ? input.time : null; // a time with no date isn't shown anywhere, so drop it
  store.update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, text, date, time } : t)) }));
}

// Checking a task off stamps when; unchecking clears it.
function toggled(t: Task): Task {
  return t.done ? { ...t, done: false, completedAt: null } : { ...t, done: true, completedAt: Date.now() };
}

export function toggleTask(id: string) {
  store.update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? toggled(t) : t)) }));
}

export function deleteTask(id: string) {
  store.update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
}

// --- to-buy list

export function addBuyItem(name: string, price: number | null) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const item: BuyItem = {
    id: newId('buy'),
    name: trimmed,
    price: isNum(price) && price >= 0 ? roundAmount(price) : null,
    bought: false,
    createdAt: Date.now(),
  };
  store.update((s) => ({ ...s, toBuy: [...s.toBuy, item] }));
}

export function toggleBought(id: string) {
  store.update((s) => ({ ...s, toBuy: s.toBuy.map((b) => (b.id === id ? { ...b, bought: !b.bought } : b)) }));
}

export function deleteBuyItem(id: string) {
  store.update((s) => ({ ...s, toBuy: s.toBuy.filter((b) => b.id !== id) }));
}

// Clears all goals (the featured goal is reset to zero), progress, tasks, and the to-buy list.
export function resetCoachData() {
  store.set(emptyState());
}
