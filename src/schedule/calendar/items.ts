import { formatTime } from '../../coach/days';
import { goalActivityName } from '../../coach/goal';
import type { CoachState, Goal, LogEntry, Task } from '../../coach/store';
import { eventsOnDay } from '../occurrences';
import type { ScheduleEvent } from '../store';
import { minutesOf } from '../time';
import type { CalendarFilters } from './viewStore';

// Everything the calendar can draw, built from data that already exists: schedule
// events (including every repeat of a recurring one), dated tasks, goal deadlines,
// and logged sets as past "sessions".

export const DEFAULT_DURATION_MIN = 30; // an item with no end time
export const MIN_BLOCK_MIN = 20; // never draw a block thinner than this

export type CalendarKind = 'event' | 'task' | 'session' | 'deadline';

// What to reopen when the block is clicked. Sessions and deadlines have no form of
// their own, so they aren't clickable.
export type CalendarSource =
  | { kind: 'event'; event: ScheduleEvent }
  | { kind: 'task'; task: Task }
  | { kind: 'session'; entry: LogEntry }
  | { kind: 'deadline'; goal: Goal };

export interface CalendarItem {
  id: string; // unique per day: a recurring event appears once per day it meets
  kind: CalendarKind;
  title: string;
  date: string;
  start: number | null; // minutes from midnight; null = all-day
  end: number | null;
  timeLabel: string; // "09:30–11:00", "09:30", or "" for all-day
  done: boolean; // tasks only: struck through when checked off
  source: CalendarSource;
}

export interface CalendarData {
  events: ScheduleEvent[];
  coach: CoachState;
}

const label = (start: string, end: string | null) => (end ? `${start}–${end}` : start);

// Every item on one day, all-day ones first, then by start time.
export function itemsOnDay(data: CalendarData, date: string, filters: CalendarFilters): CalendarItem[] {
  const items: CalendarItem[] = [];

  if (filters.events) {
    for (const event of eventsOnDay(data.events, date)) {
      const start = minutesOf(event.startTime);
      items.push({
        id: `event:${event.id}:${date}`,
        kind: 'event',
        title: event.title,
        date,
        start,
        end: event.endTime ? minutesOf(event.endTime) : null,
        timeLabel: label(event.startTime, event.endTime),
        done: false,
        source: { kind: 'event', event },
      });
    }
  }

  if (filters.tasks) {
    for (const task of data.coach.tasks) {
      if (task.date !== date) continue;
      const start = task.time ? minutesOf(task.time) : null;
      items.push({
        id: `task:${task.id}`,
        kind: 'task',
        title: task.text,
        date,
        start,
        end: null,
        timeLabel: task.time ?? '',
        done: task.done,
        source: { kind: 'task', task },
      });
    }
  }

  if (filters.deadlines) {
    for (const goal of data.coach.goals) {
      if (goal.deadline !== date) continue;
      items.push({
        id: `deadline:${goal.id}`,
        kind: 'deadline',
        title: `Deadline · ${goal.title}`,
        date,
        start: null, // a deadline is a day, not a time
        end: null,
        timeLabel: '',
        done: false,
        source: { kind: 'deadline', goal },
      });
    }
  }

  if (filters.sessions) {
    const goalById = new Map(data.coach.goals.map((g) => [g.id, g]));
    for (const entry of data.coach.entries) {
      if (entry.date !== date) continue;
      const goal = goalById.get(entry.goalId);
      const unit = goal?.unit ? ` ${goal.unit}` : '';
      // Sets logged before timestamps existed (loggedAt 0) have no time of day, so
      // they sit in the all-day row rather than pretending to be a midnight session.
      const at = entry.loggedAt > 0 ? new Date(entry.loggedAt) : null;
      const start = at ? at.getHours() * 60 + at.getMinutes() : null;
      items.push({
        id: `session:${entry.id}`,
        kind: 'session',
        title: `${goal ? goalActivityName(goal.title) : 'Progress'} · ${entry.value}${unit}`,
        date,
        start,
        end: null,
        timeLabel: at ? formatTime(entry.loggedAt) : '',
        done: false,
        source: { kind: 'session', entry },
      });
    }
  }

  return items.sort((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.title.localeCompare(b.title));
}

export const allDayItems = (items: CalendarItem[]) => items.filter((i) => i.start === null);
export const timedItems = (items: CalendarItem[]) => items.filter((i) => i.start !== null);

// The minutes a block actually covers, with the default duration applied.
export function spanOf(item: CalendarItem): { start: number; end: number } {
  const start = item.start ?? 0;
  const end = Math.max(start + MIN_BLOCK_MIN, item.end ?? start + DEFAULT_DURATION_MIN);
  return { start, end };
}

export interface PositionedItem {
  item: CalendarItem;
  lane: number; // which side-by-side slot this block sits in
  lanes: number; // how many slots the column is split into around it
}

// Side-by-side layout for overlapping blocks: items are grouped into clusters of
// things that overlap (directly or through a chain), each cluster is split into as
// many lanes as it needs, and every block in it is drawn at that width. Items that
// don't overlap anything keep the full column.
export function layoutDay(items: CalendarItem[]): PositionedItem[] {
  const sorted = timedItems(items).sort((a, b) => {
    const sa = spanOf(a);
    const sb = spanOf(b);
    return sa.start - sb.start || sb.end - sa.end;
  });

  const out: PositionedItem[] = [];
  let cluster: PositionedItem[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const positioned of cluster) positioned.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const { start, end } = spanOf(item);
    if (cluster.length > 0 && start >= clusterEnd) flush();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    clusterEnd = Math.max(clusterEnd, end);
    cluster.push({ item, lane, lanes: 1 });
  }
  if (cluster.length > 0) flush();

  return out;
}
