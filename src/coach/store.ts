import AsyncStorage from '@react-native-async-storage/async-storage';

import { createPersistedStore } from '../storage/persistedStore';
import { isTimeKey } from '../schedule/time';
import { isDayKey } from './days';
import { roundAmount } from './format';

// "best": a record — the most done in ONE set (push-ups in one unbroken set).
// "daily": a daily total — everything logged today, against a target per day.
// "cumulative": a running total across all time (money saved). Older goals only; new
// ones are "best" or "daily".
export type GoalType = 'best' | 'daily' | 'cumulative';

export interface Goal {
  id: string;
  title: string;
  description: string; // what the goal means, in the user's words ("in one unbroken set")
  target: number; // "daily": per day
  // "best": the best single set so far. "cumulative": the running total. Unused for
  // "daily", whose number is today's total (see coach/progress.ts).
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
  description?: string;
  unit?: string;
}

// The featured goal's wording from before goals had descriptions (it lived in goal.ts).
export const PUSHUPS_DESCRIPTION = '100 push-ups in one unbroken set before the deadline. Show up every day.';

export const FEATURED_GOAL_ID = 'goal_pushups';

const KEY = 'jinesist.coach.v2';
const LEGACY_KEY = 'jinesist.coach.v1'; // Stage 2 format, migrated on first load and left as a backup

function featuredGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: FEATURED_GOAL_ID,
    title: '100 push-ups',
    description: PUSHUPS_DESCRIPTION,
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
    // Goals saved before descriptions existed. The original push-ups goal becomes a
    // record goal ("best single set") with its old wording as the description; its
    // logged sets all stay as they are.
    const legacy = typeof g.description !== 'string';
    const pushups = legacy && g.id === FEATURED_GOAL_ID;
    goals.push({
      id: g.id,
      title: g.title,
      description: legacy ? (pushups ? PUSHUPS_DESCRIPTION : '') : (g.description as string),
      target: g.target,
      current: isNum(g.current) && g.current > 0 ? g.current : 0,
      type: pushups ? 'best' : g.type === 'cumulative' || g.type === 'daily' ? g.type : 'best',
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

const sortEntries = (entries: LogEntry[]) =>
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.loggedAt - b.loggedAt);

// A goal's stored number after its sets changed. A record ("best") never drops below
// `floor` (what it was before, which may predate the sets on file) unless `floor`
// itself came from a set that's now gone or smaller — then the best remaining set.
function recomputeCurrent(goal: Goal, entries: LogEntry[], floor: number): number {
  const values = entries.filter((e) => e.goalId === goal.id).map((e) => e.value);
  if (goal.type === 'best') return Math.max(floor, ...values, 0);
  if (goal.type === 'cumulative') return roundAmount(values.reduce((sum, v) => sum + v, 0));
  return goal.current;
}

// After sets arrive from another device (cloud sync): records and running totals
// follow the merged log. A record never drops here — deleting a set is what lowers
// one, and that edit travels with the goal itself.
export function withRecomputedGoals(state: CoachState): CoachState {
  let changed = false;
  const goals = state.goals.map((goal) => {
    const current = recomputeCurrent(goal, state.entries, goal.type === 'best' ? goal.current : 0);
    if (current === goal.current) return goal;
    changed = true;
    return { ...goal, current };
  });
  return changed ? { ...state, goals } : state;
}

export interface LogResult {
  entryIds: string[];
  isNewBest: boolean;
  previousCurrent: number;
  current: number;
}

// Logs one or more sets at once ("20, then 10, then 20" is three sets), each its own
// entry a millisecond apart so they keep their order. A record only rises if one of
// these sets beats it; a running total adds them all; a daily goal just gains sets.
export function logSets(goalId: string, values: number[], note: string, date: string): LogResult | null {
  const state = store.get();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal || values.length === 0 || !values.every((v) => isNum(v) && v > 0) || !isDayKey(date)) return null;

  const now = Date.now();
  const added: LogEntry[] = values.map((v, i) => ({
    id: newId('entry'),
    goalId,
    date,
    value: roundAmount(v),
    note: i === 0 ? note.trim() : '',
    loggedAt: now + i,
  }));
  const entries = sortEntries([...state.entries, ...added]);

  let current = goal.current;
  if (goal.type === 'best') current = Math.max(goal.current, ...added.map((e) => e.value));
  else if (goal.type === 'cumulative') current = roundAmount(goal.current + added.reduce((sum, e) => sum + e.value, 0));

  store.set({ ...state, entries, goals: state.goals.map((g) => (g.id === goalId ? { ...g, current } : g)) });
  return {
    entryIds: added.map((e) => e.id),
    isNewBest: goal.type === 'best' && current > goal.current,
    previousCurrent: goal.current,
    current,
  };
}

export function logProgress(
  goalId: string,
  value: number,
  note: string,
  date: string,
): { isNewBest: boolean; current: number; entryId: string } | null {
  const result = logSets(goalId, [value], note, date);
  return result && { isNewBest: result.isNewBest, current: result.current, entryId: result.entryIds[0] };
}

// Undo for logged sets: removes them and puts the goal's number back (see
// recomputeCurrent). `previousCurrent` is what it was before they were logged.
export function removeEntries(entryIds: string[], previousCurrent: number) {
  store.update((s) => {
    const gone = s.entries.filter((e) => entryIds.includes(e.id));
    if (gone.length === 0) return s;
    const entries = s.entries.filter((e) => !entryIds.includes(e.id));
    const goalIds = new Set(gone.map((e) => e.goalId));
    const goals = s.goals.map((g) => (goalIds.has(g.id) ? { ...g, current: recomputeCurrent(g, entries, g.type === 'best' ? previousCurrent : 0) } : g));
    return { ...s, entries, goals };
  });
}

// Kept for receipts saved before several sets could be logged at once.
export function undoLog(entryId: string, previousCurrent: number) {
  removeEntries([entryId], previousCurrent);
}

// The record's floor once `entryId` changes: if that set held the record, the record
// is recomputed from the sets; otherwise it stays.
function floorWithout(goal: Goal, entry: LogEntry): number {
  return goal.type === 'best' && entry.value >= goal.current ? 0 : goal.current;
}

// Changes one logged set's size. Returns the set as it was and the goal's number
// before, for Undo.
export function updateEntry(entryId: string, value: number): { before: LogEntry; previousCurrent: number } | null {
  const state = store.get();
  const entry = state.entries.find((e) => e.id === entryId);
  const goal = entry && state.goals.find((g) => g.id === entry.goalId);
  if (!entry || !goal || !isNum(value) || value <= 0) return null;
  const entries = state.entries.map((e) => (e.id === entryId ? { ...e, value: roundAmount(value) } : e));
  const current = recomputeCurrent(goal, entries, floorWithout(goal, entry));
  store.set({ ...state, entries, goals: state.goals.map((g) => (g.id === goal.id ? { ...g, current } : g)) });
  return { before: entry, previousCurrent: goal.current };
}

export function deleteEntry(entryId: string): { before: LogEntry; previousCurrent: number } | null {
  const state = store.get();
  const entry = state.entries.find((e) => e.id === entryId);
  const goal = entry && state.goals.find((g) => g.id === entry.goalId);
  if (!entry || !goal) return null;
  const entries = state.entries.filter((e) => e.id !== entryId);
  const current = recomputeCurrent(goal, entries, floorWithout(goal, entry));
  store.set({ ...state, entries, goals: state.goals.map((g) => (g.id === goal.id ? { ...g, current } : g)) });
  return { before: entry, previousCurrent: goal.current };
}

// Undo for an edited or deleted set: the set goes back exactly as it was, and the
// goal's number with it (or higher, if a bigger set has been logged since).
export function restoreEntry(entry: LogEntry, previousCurrent: number) {
  store.update((s) => {
    const goal = s.goals.find((g) => g.id === entry.goalId);
    if (!goal) return s;
    const entries = sortEntries([...s.entries.filter((e) => e.id !== entry.id), entry]);
    const current = recomputeCurrent(goal, entries, goal.type === 'best' ? previousCurrent : 0);
    return { ...s, entries, goals: s.goals.map((g) => (g.id === goal.id ? { ...g, current } : g)) };
  });
}

export function createGoal(input: NewGoalInput): Goal | null {
  const title = input.title.trim();
  if (!title || !isNum(input.target) || input.target <= 0) return null;
  const goal: Goal = {
    id: newId('goal'),
    title,
    description: input.description?.trim() ?? '',
    target: roundAmount(input.target),
    current: 0,
    type: input.type,
    deadline: isDayKey(input.deadline) ? input.deadline : null,
    unit: input.unit?.trim() ?? '',
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

export interface GoalEdit {
  title?: string;
  description?: string;
  type?: GoalType;
  target?: number;
  deadline?: string | null;
  unit?: string;
}

// Changes a goal's details. Switching type re-reads its number from the sets on file:
// a record becomes the best single set, a running total the sum. Returns the goal as
// it was, for Undo.
export function editGoal(goalId: string, edit: GoalEdit): Goal | null {
  const state = store.get();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const next: Goal = {
    ...goal,
    title: edit.title?.trim() || goal.title,
    description: edit.description !== undefined ? edit.description.trim() : goal.description,
    type: edit.type ?? goal.type,
    target: edit.target !== undefined && isNum(edit.target) && edit.target > 0 ? roundAmount(edit.target) : goal.target,
    deadline: edit.deadline === undefined ? goal.deadline : isDayKey(edit.deadline) ? edit.deadline : null,
    unit: edit.unit !== undefined ? edit.unit.trim() : goal.unit,
  };
  if (next.type !== goal.type) next.current = recomputeCurrent(next, state.entries, 0);
  store.set({ ...state, goals: state.goals.map((g) => (g.id === goalId ? next : g)) });
  return goal;
}

// Undo for an edit: the goal exactly as it was.
export function restoreGoalDetails(goal: Goal) {
  store.update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === goal.id ? { ...goal, featured: g.featured } : g)) }));
}

// Deletes a goal and its progress history, returning both (and where it sat) for
// Undo. The featured goal can't be deleted.
export function deleteGoal(goalId: string): { goal: Goal; entries: LogEntry[]; index: number } | null {
  const state = store.get();
  const index = state.goals.findIndex((g) => g.id === goalId);
  const goal = state.goals[index];
  if (!goal || goal.featured) return null;
  const entries = state.entries.filter((e) => e.goalId === goalId);
  store.set({
    ...state,
    goals: state.goals.filter((g) => g.id !== goalId),
    entries: state.entries.filter((e) => e.goalId !== goalId),
  });
  return { goal, entries, index };
}

export function restoreGoal(goal: Goal, entries: LogEntry[], index: number) {
  store.update((s) => {
    if (s.goals.some((g) => g.id === goal.id)) return s;
    const goals = [...s.goals];
    goals.splice(Math.min(Math.max(index, 1), goals.length), 0, { ...goal, featured: false });
    return { ...s, goals, entries: sortEntries([...s.entries, ...entries]) };
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
