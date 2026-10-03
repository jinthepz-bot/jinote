import { useSyncExternalStore } from 'react';

import { dayKey } from '../../coach/days';
import { spacing } from '../../design/theme';
import { useMainWidth } from '../../navigation/layout';
import { createPersistedStore } from '../../storage/persistedStore';

// What the desktop calendar is looking at. It lives outside React because two
// separate trees read it: the Schedule screen inside the tab navigator, and the
// sidebar beside it (mini month + "Show" checkboxes).
//
// How you like to look at the calendar is saved; *where* you were looking isn't.
// The anchor stays in memory so a reload lands on today.

export type CalendarMode = 'day' | 'week' | 'month';

export interface CalendarFilters {
  events: boolean;
  tasks: boolean;
  sessions: boolean;
  deadlines: boolean;
}

export interface CalendarPrefs {
  mode: CalendarMode;
  filters: CalendarFilters;
  zoom: number; // 0 = Fit day, up to ZOOM_LEVELS - 1 = the tallest hours
}

// How many hour heights the +/- buttons step through, Fit day included.
export const ZOOM_LEVELS = 4;

const MODES: CalendarMode[] = ['day', 'week', 'month'];
const ALL_ON: CalendarFilters = { events: true, tasks: true, sessions: true, deadlines: true };

function normalize(raw: unknown): CalendarPrefs {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const saved = (typeof obj.filters === 'object' && obj.filters !== null ? obj.filters : {}) as Record<string, unknown>;
  // An unknown or missing filter defaults to on: a kind of item should never go
  // missing from the grid because of a half-written preferences file.
  const filters = { ...ALL_ON };
  for (const key of Object.keys(ALL_ON) as (keyof CalendarFilters)[]) {
    if (typeof saved[key] === 'boolean') filters[key] = saved[key];
  }
  const zoom = typeof obj.zoom === 'number' && Number.isFinite(obj.zoom) ? Math.round(obj.zoom) : 0;
  return {
    mode: MODES.includes(obj.mode as CalendarMode) ? (obj.mode as CalendarMode) : 'week',
    filters,
    zoom: Math.min(ZOOM_LEVELS - 1, Math.max(0, zoom)),
  };
}

const store = createPersistedStore<CalendarPrefs>({
  key: 'jinesist.calendar.v1',
  initial: { mode: 'week', filters: ALL_ON, zoom: 0 }, // Fit day by default
  normalize,
  label: 'calendar view',
});

// --- anchor: in memory only

let anchor = dayKey();
const listeners = new Set<() => void>();

const subscribeAnchor = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function setAnchor(next: string) {
  anchor = next;
  listeners.forEach((l) => l());
}

// Jumping to a date from the mini month keeps the current mode, so clicking a day
// in month view stays in month view.
export const goToDay = setAnchor;

// --- 3 days in place of a week, when a week won't fit
//
// When the main column is too narrow for seven readable columns, Week view shows
// three days from the anchor instead. That's a default, not a lock: picking Week in
// the toolbar while narrow keeps seven columns for the rest of the session. Kept in
// memory, so a saved "Week" still means a week on a wide window.

export const WEEK_COLUMN_MIN = 88;
export const TIME_GUTTER_WIDTH = 56; // TimeGrid's hour labels
export const THREE_DAYS = 3;

let weekWhenNarrow = false;
const spanListeners = new Set<() => void>();

export function setWeekWhenNarrow(keep: boolean) {
  weekWhenNarrow = keep;
  spanListeners.forEach((l) => l());
}

const subscribeSpan = (listener: () => void) => {
  spanListeners.add(listener);
  return () => {
    spanListeners.delete(listener);
  };
};

// `narrow`: a week's columns would be thinner than WEEK_COLUMN_MIN.
// `threeDay`: Week view is showing three days because of that.
export function useCalendarSpan(mode: CalendarMode): { narrow: boolean; threeDay: boolean } {
  const mainWidth = useMainWidth();
  const keepWeek = useSyncExternalStore(subscribeSpan, () => weekWhenNarrow);
  const columns = mainWidth - spacing.lg * 2 - TIME_GUTTER_WIDTH;
  const narrow = columns / 7 < WEEK_COLUMN_MIN;
  return { narrow, threeDay: mode === 'week' && narrow && !keepWeek };
}

// --- reading

export interface CalendarViewState extends CalendarPrefs {
  anchor: string;
  loaded: boolean; // false until the saved mode and filters have been read
}

export function useCalendarView(): CalendarViewState {
  const { state, loaded } = store.useStore();
  const current = useSyncExternalStore(subscribeAnchor, () => anchor);
  return { anchor: current, mode: state.mode, filters: state.filters, zoom: state.zoom, loaded };
}

export function setMode(mode: CalendarMode) {
  store.update((s) => ({ ...s, mode }));
}

export function setZoom(zoom: number) {
  store.update((s) => ({ ...s, zoom: Math.min(ZOOM_LEVELS - 1, Math.max(0, zoom)) }));
}

export function toggleFilter(key: keyof CalendarFilters) {
  store.update((s) => ({ ...s, filters: { ...s.filters, [key]: !s.filters[key] } }));
}

export function importCalendarPrefs(raw: unknown) {
  store.set(normalize(raw));
}

export const getCalendarPrefs = store.get;
