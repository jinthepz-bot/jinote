import { isDayKey } from '../coach/days';
import { createPersistedStore } from '../storage/persistedStore';
import { isTimeKey } from './time';

export type EventType = 'recurring' | 'one-off';
export const EVENT_COLORS = ['accent', 'soft', 'strong', 'success'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

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
          }
        : e,
    ),
  }));
}

export function deleteEvent(id: string): void {
  store.update((s) => ({ events: s.events.filter((e) => e.id !== id) }));
}

export function resetSchedule(): void {
  store.set({ events: [] });
}
