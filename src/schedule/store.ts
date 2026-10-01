import { addDays, daysBetween, isDayKey } from '../coach/days';
import { createPersistedStore } from '../storage/persistedStore';
import { isTimeKey, minutesOf } from './time';

export type EventType = 'recurring' | 'one-off';
export const EVENT_COLORS = ['accent', 'soft', 'strong', 'success'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

// One occurrence of a repeating event, changed on its own ("Only this event"): it
// happens on `date` at these times instead of on its usual day at the usual times,
// with any details set here in place of the series' own — or, if `skipped`, not at all.
export interface OccurrenceChange {
  date: string;
  startTime: string;
  endTime: string | null;
  skipped?: boolean;
  title?: string;
  location?: string;
  note?: string;
  color?: EventColor;
  reminderMinutesBefore?: number | null;
}

// The details an occurrence can have of its own, besides its day and times.
export const OCCURRENCE_DETAILS = ['title', 'location', 'note', 'color', 'reminderMinutesBefore'] as const;
export type OccurrenceDetails = Pick<OccurrenceChange, (typeof OCCURRENCE_DETAILS)[number]>;

export interface ScheduleEvent {
  id: string;
  title: string;
  type: EventType;
  days: number[]; // recurring only: 0=Sun..6=Sat, sorted, unique, non-empty
  date: string | null; // one-off only: local day "YYYY-MM-DD"
  startDate: string | null; // recurring only, optional: "YYYY-MM-DD"
  endDate: string | null; // recurring only, optional: "YYYY-MM-DD"
  startTime: string; // "HH:MM", 24-hour
  endTime: string | null; // "HH:MM", 24-hour
  color: EventColor;
  location: string;
  note: string;
  reminderMinutesBefore: number | null; // null = no reminder
  createdAt: number;
  // Recurring only: occurrences changed on their own, keyed by the date the occurrence
  // originally fell on. Events saved before this existed load with none.
  exceptions: Record<string, OccurrenceChange>;
}

interface ScheduleState {
  events: ScheduleEvent[];
}

export interface NewEventInput {
  title: string;
  type: EventType;
  days: number[];
  date: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string | null;
  color: EventColor;
  location: string;
  note: string;
  reminderMinutesBefore: number | null;
}

const KEY = 'jinesist.schedule.v1';

const newId = () => `event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const reminderMinutes = (v: unknown): number | null => (isNum(v) && v > 0 ? Math.round(v) : null);
const eventColor = (v: unknown): EventColor => (EVENT_COLORS.includes(v as EventColor) ? (v as EventColor) : 'accent');

function records(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}

function exceptionsOf(v: unknown): Record<string, OccurrenceChange> {
  const out: Record<string, OccurrenceChange> = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [original, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!isDayKey(original) || typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    if (!isDayKey(c.date) || !isTimeKey(c.startTime)) continue;
    const change: OccurrenceChange = { date: c.date, startTime: c.startTime, endTime: isTimeKey(c.endTime) ? c.endTime : null };
    if (c.skipped === true) change.skipped = true;
    if (typeof c.title === 'string' && c.title.trim()) change.title = c.title.trim();
    if (typeof c.location === 'string') change.location = c.location;
    if (typeof c.note === 'string') change.note = c.note;
    if (EVENT_COLORS.includes(c.color as EventColor)) change.color = c.color as EventColor;
    if ('reminderMinutesBefore' in c) change.reminderMinutesBefore = reminderMinutes(c.reminderMinutesBefore);
    out[original] = change;
  }
  return out;
}

function weekdays(v: unknown): number[] {
  const nums = Array.isArray(v) ? v.filter((n): n is number => isNum(n) && n >= 0 && n <= 6) : [];
  return [...new Set(nums)].sort((a, b) => a - b);
}

// Accepts whatever was stored and keeps only well-formed events.
function normalize(raw: unknown): ScheduleState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const events: ScheduleEvent[] = [];
  for (const e of records(obj.events)) {
    if (typeof e.id !== 'string' || events.some((x) => x.id === e.id)) continue;
    if (typeof e.title !== 'string' || e.title.trim() === '') continue;
    if (!isTimeKey(e.startTime)) continue;
    const type: EventType = e.type === 'recurring' ? 'recurring' : 'one-off';

    if (type === 'recurring') {
      const days = weekdays(e.days);
      if (days.length === 0) continue;
      events.push({
        id: e.id,
        title: e.title.trim(),
        type,
        days,
        date: null,
        startDate: isDayKey(e.startDate) ? e.startDate : null,
        endDate: isDayKey(e.endDate) ? e.endDate : null,
        startTime: e.startTime,
        endTime: isTimeKey(e.endTime) ? e.endTime : null,
        color: eventColor(e.color),
        location: str(e.location),
        note: str(e.note),
        reminderMinutesBefore: reminderMinutes(e.reminderMinutesBefore),
        createdAt: isNum(e.createdAt) ? e.createdAt : 0,
        exceptions: exceptionsOf(e.exceptions),
      });
    } else {
      if (!isDayKey(e.date)) continue;
      events.push({
        id: e.id,
        title: e.title.trim(),
        type,
        days: [],
        date: e.date,
        startDate: null,
        endDate: null,
        startTime: e.startTime,
        endTime: isTimeKey(e.endTime) ? e.endTime : null,
        color: eventColor(e.color),
        location: str(e.location),
        note: str(e.note),
        reminderMinutesBefore: reminderMinutes(e.reminderMinutesBefore),
        createdAt: isNum(e.createdAt) ? e.createdAt : 0,
        exceptions: {},
      });
    }
  }
  events.sort((a, b) => a.createdAt - b.createdAt);

  return { events };
}

const store = createPersistedStore<ScheduleState>({
  key: KEY,
  initial: { events: [] },
  normalize,
  label: 'schedule',
});

export const scheduleReady = store.ready;

// Replaces everything from a backup file, through the same validation as a load.
export function importSchedule(raw: unknown) {
  store.set(normalize(raw));
}
export const getScheduleState = store.get;
export const useSchedule = () => store.useStore();

export function addEvent(input: NewEventInput): ScheduleEvent | null {
  const title = input.title.trim();
  if (!title || !isTimeKey(input.startTime)) return null;
  if (input.type === 'recurring' && input.days.length === 0) return null;
  if (input.type === 'one-off' && !isDayKey(input.date)) return null;

  const event: ScheduleEvent = {
    id: newId(),
    title,
    type: input.type,
    days: input.type === 'recurring' ? weekdays(input.days) : [],
    date: input.type === 'one-off' ? input.date : null,
    startDate: input.type === 'recurring' && isDayKey(input.startDate) ? input.startDate : null,
    endDate: input.type === 'recurring' && isDayKey(input.endDate) ? input.endDate : null,
    startTime: input.startTime,
    endTime: isTimeKey(input.endTime) ? input.endTime : null,
    color: eventColor(input.color),
    location: input.location.trim(),
    note: input.note.trim(),
    reminderMinutesBefore: reminderMinutes(input.reminderMinutesBefore),
    createdAt: Date.now(),
    exceptions: {},
  };
  store.update((s) => ({ events: [...s.events, event] }));
  return event;
}

export function updateEvent(id: string, input: NewEventInput): void {
  const title = input.title.trim();
  if (!title || !isTimeKey(input.startTime)) return;
  if (input.type === 'recurring' && input.days.length === 0) return;
  if (input.type === 'one-off' && !isDayKey(input.date)) return;

  store.update((s) => ({
    events: s.events.map((e) =>
      e.id === id
        ? {
            ...e,
            title,
            type: input.type,
            days: input.type === 'recurring' ? weekdays(input.days) : [],
            date: input.type === 'one-off' ? input.date : null,
            startDate: input.type === 'recurring' && isDayKey(input.startDate) ? input.startDate : null,
            endDate: input.type === 'recurring' && isDayKey(input.endDate) ? input.endDate : null,
            startTime: input.startTime,
            endTime: isTimeKey(input.endTime) ? input.endTime : null,
            color: eventColor(input.color),
            location: input.location.trim(),
            note: input.note.trim(),
            reminderMinutesBefore: reminderMinutes(input.reminderMinutesBefore),
            // A series keeps its one-off changes through an edit; a one-off has none.
            exceptions: input.type === 'recurring' ? e.exceptions : {},
          }
        : e,
    ),
  }));
}

const validTimes = (start: string, end: string | null) =>
  isTimeKey(start) && (end === null || (isTimeKey(end) && minutesOf(end) > minutesOf(start)));

// "Only this event": the occurrence that originally fell on `originalDate` now
// happens as `change` says. It merges with any change already there: a detail left
// out keeps its current value, one given as `undefined` goes back to the series'. An
// occurrence moved back to exactly where it was, with nothing of its own, is cleared.
export function setOccurrenceChange(id: string, originalDate: string, change: OccurrenceChange): void {
  if (!isDayKey(originalDate) || !isDayKey(change.date) || !validTimes(change.startTime, change.endTime)) return;
  store.update((s) => ({
    events: s.events.map((e) => {
      if (e.id !== id || e.type !== 'recurring') return e;
      const exceptions = { ...e.exceptions };
      const merged: OccurrenceChange = { ...exceptions[originalDate], ...change };
      if (!merged.skipped) delete merged.skipped;
      for (const k of OCCURRENCE_DETAILS) if (merged[k] === undefined) delete merged[k];
      const unchanged =
        !merged.skipped &&
        merged.date === originalDate &&
        merged.startTime === e.startTime &&
        merged.endTime === e.endTime &&
        OCCURRENCE_DETAILS.every((k) => merged[k] === undefined);
      if (unchanged) delete exceptions[originalDate];
      else exceptions[originalDate] = merged;
      return { ...e, exceptions };
    }),
  }));
}

// "Delete → Only this event": the occurrence that fell on `originalDate` is skipped.
export function skipOccurrence(id: string, originalDate: string): void {
  if (!isDayKey(originalDate)) return;
  store.update((s) => ({
    events: s.events.map((e) =>
      e.id === id && e.type === 'recurring'
        ? {
            ...e,
            exceptions: {
              ...e.exceptions,
              [originalDate]: { date: originalDate, startTime: e.startTime, endTime: e.endTime, skipped: true },
            },
          }
        : e,
    ),
  }));
}

export interface SeriesEdit {
  occurrence: string; // original date of the occurrence the edit was made from
  shiftDays: number; // move the whole series by this many days (0 = stay)
  times?: { startTime: string; endTime: string | null }; // new times for every occurrence
  details?: Partial<Record<(typeof OCCURRENCE_DETAILS)[number], unknown>>; // changed details
  days?: number[]; // new repeat days
  endDate?: string | null; // new "until"
}

// "Save → All events in the series", from the side sheet: only what was actually
// changed is applied to the series. Moving it across days shifts it the way dragging
// does (see retimeEvent); new times also bring the edited occurrence back in line if it
// had its own.
export function editSeries(id: string, edit: SeriesEdit): void {
  if (edit.times && !validTimes(edit.times.startTime, edit.times.endTime)) return;
  const shift = edit.shiftDays;
  store.update((s) => ({
    events: s.events.map((e) => {
      if (e.id !== id || e.type !== 'recurring') return e;
      const exceptions: Record<string, OccurrenceChange> = {};
      for (const [original, c] of Object.entries(e.exceptions)) {
        let next: OccurrenceChange = c;
        if (original === edit.occurrence) {
          next = { ...c };
          // Details just changed for the whole series stop being this occurrence's own.
          for (const k of OCCURRENCE_DETAILS) if (edit.details && k in edit.details) delete next[k];
          // New times or a new day bring it back in line with the series.
          if (edit.times || shift) {
            next.date = original;
            next.startTime = edit.times?.startTime ?? e.startTime;
            next.endTime = edit.times ? edit.times.endTime : e.endTime;
          }
          const ownDetails = OCCURRENCE_DETAILS.some((k) => next[k] !== undefined);
          const sameAsSeries =
            next.date === original &&
            next.startTime === (edit.times?.startTime ?? e.startTime) &&
            next.endTime === (edit.times ? edit.times.endTime : e.endTime);
          if (!next.skipped && !ownDetails && sameAsSeries) continue;
        }
        exceptions[shift ? addDays(original, shift) : original] = shift ? { ...next, date: addDays(next.date, shift) } : next;
      }
      const d = edit.details ?? {};
      const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim() : e.title;
      return {
        ...e,
        title,
        location: typeof d.location === 'string' ? d.location.trim() : e.location,
        note: typeof d.note === 'string' ? d.note.trim() : e.note,
        color: 'color' in d ? eventColor(d.color) : e.color,
        reminderMinutesBefore: 'reminderMinutesBefore' in d ? reminderMinutes(d.reminderMinutesBefore) : e.reminderMinutesBefore,
        days: edit.days && edit.days.length ? weekdays(edit.days) : shift ? weekdays(e.days.map((x) => (((x + shift) % 7) + 7) % 7)) : e.days,
        startDate: e.startDate && shift ? addDays(e.startDate, shift) : e.startDate,
        endDate: edit.endDate !== undefined ? (isDayKey(edit.endDate) ? edit.endDate : null) : e.endDate && shift ? addDays(e.endDate, shift) : e.endDate,
        startTime: edit.times?.startTime ?? e.startTime,
        endTime: edit.times ? edit.times.endTime : e.endTime,
        exceptions,
      };
    }),
  }));
}

export interface Retime {
  from: string; // the day the occurrence was on
  to: string; // the day it was dropped on
  startTime: string;
  endTime: string | null;
  originalDate?: string; // recurring: the occurrence's own date, if it was already a one-day change
}

// Moves or resizes a whole event. A one-off simply changes day and times. A series
// ("All events in the series") takes the new times, and moving it across days shifts
// every weekday it repeats on, its start and end dates, and its one-day changes by the
// same number of days — so a Mon/Wed class dragged a day later becomes Tue/Thu.
export function retimeEvent(id: string, change: Retime): void {
  if (!isDayKey(change.from) || !isDayKey(change.to) || !validTimes(change.startTime, change.endTime)) return;
  const shift = daysBetween(change.from, change.to);
  store.update((s) => ({
    events: s.events.map((e) => {
      if (e.id !== id) return e;
      if (e.type === 'one-off') return { ...e, date: change.to, startTime: change.startTime, endTime: change.endTime };
      const exceptions: Record<string, OccurrenceChange> = {};
      for (const [original, c] of Object.entries(e.exceptions)) {
        // The dragged occurrence rejoins the series, which now carries its times.
        if (original === change.originalDate) continue;
        exceptions[shift ? addDays(original, shift) : original] = shift ? { ...c, date: addDays(c.date, shift) } : c;
      }
      return {
        ...e,
        days: shift ? weekdays(e.days.map((d) => (((d + shift) % 7) + 7) % 7)) : e.days,
        startDate: e.startDate && shift ? addDays(e.startDate, shift) : e.startDate,
        endDate: e.endDate && shift ? addDays(e.endDate, shift) : e.endDate,
        startTime: change.startTime,
        endTime: change.endTime,
        exceptions,
      };
    }),
  }));
}

// Undo support: puts an event back exactly as it was (replacing the current copy, or
// re-adding it if it was deleted), through the same validation as a load.
export function restoreEvent(event: ScheduleEvent): void {
  store.update((s) => normalize({ events: [...s.events.filter((e) => e.id !== event.id), event] }));
}

export function deleteEvent(id: string): void {
  store.update((s) => ({ events: s.events.filter((e) => e.id !== id) }));
}

export function resetSchedule(): void {
  store.set({ events: [] });
}
